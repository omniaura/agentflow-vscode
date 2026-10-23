// Launch and capability logic that does not depend on the vscode module, so
// it can be unit tested with bun.

export const DEFAULT_COMMAND = 'af'
export const DEFAULT_ARGS = ['lsp', '--mode', 'stdio']
export const GO_TOOL_COMMAND = 'go'
export const AGENTFLOW_TOOL_MODULE = 'github.com/omniaura/agentflow/cmd/af'

export type Launch = {
  // command and prefix run af: `af ...` or `go tool af ...`.
  command: string
  prefix: string[]
  detectedFromGoMod: boolean
}

// resolveAF decides how to run af. A user-configured language server command
// wins; otherwise a workspace whose go.mod pins af as a tool runs `go tool
// af`, and anything else runs `af` from PATH.
export function resolveAF(configuredCommand: string, configuredArgs: string[], goModUsesTool: boolean): { af: Launch; lspArgs: string[] } {
  const isDefault = configuredCommand === DEFAULT_COMMAND && sameArgs(configuredArgs, DEFAULT_ARGS)
  if (!isDefault) {
    // A custom command launches the server as configured. Its CLI is the
    // same command when the args start with "lsp", else plain af.
    const lspIndex = configuredArgs.indexOf('lsp')
    const prefix = lspIndex >= 0 ? configuredArgs.slice(0, lspIndex) : []
    const af = lspIndex >= 0 ? { command: configuredCommand, prefix, detectedFromGoMod: false } : { command: DEFAULT_COMMAND, prefix: [], detectedFromGoMod: false }
    return { af, lspArgs: configuredArgs.slice(prefix.length) }
  }
  if (goModUsesTool) {
    return { af: { command: GO_TOOL_COMMAND, prefix: ['tool', 'af'], detectedFromGoMod: true }, lspArgs: DEFAULT_ARGS }
  }
  return { af: { command: DEFAULT_COMMAND, prefix: [], detectedFromGoMod: false }, lspArgs: DEFAULT_ARGS }
}

export function afArgs(af: Launch, args: string[]): string[] {
  return [...af.prefix, ...args]
}

// serverServesLintAndFormat reports whether the language server publishes
// af lint diagnostics and formats documents itself (af v0.13+, which added
// definition, rename, formatting and lint diagnostics together). Older
// servers need the extension's af lint / af fmt fallbacks.
export function serverServesLintAndFormat(capabilities: { documentFormattingProvider?: unknown; definitionProvider?: unknown } | undefined): boolean {
  return Boolean(capabilities?.documentFormattingProvider) && Boolean(capabilities?.definitionProvider)
}

export function sameArgs(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export function goModUsesAgentflowTool(contents: string): boolean {
  let inToolBlock = false
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = stripLineComment(rawLine).trim()
    if (!line) {
      continue
    }
    if (inToolBlock) {
      if (line === ')') {
        inToolBlock = false
      } else if (line === AGENTFLOW_TOOL_MODULE) {
        return true
      }
      continue
    }
    if (line === `tool ${AGENTFLOW_TOOL_MODULE}`) {
      return true
    }
    if (line === 'tool (' || line === 'tool(') {
      inToolBlock = true
    }
  }
  return false
}

export function stripLineComment(line: string): string {
  const i = line.indexOf('//')
  return i === -1 ? line : line.slice(0, i)
}
