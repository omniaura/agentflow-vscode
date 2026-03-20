import * as vscode from 'vscode'
import {
  Executable,
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  Trace,
} from 'vscode-languageclient/node'

const DEFAULT_COMMAND = 'af'
const DEFAULT_ARGS = ['lsp', '--mode', 'stdio']
const GO_TOOL_COMMAND = 'go'
const GO_TOOL_ARGS = ['tool', 'af', 'lsp', '--mode', 'stdio']
const AGENTFLOW_TOOL_MODULE = 'github.com/omniaura/agentflow/cmd/af'

let client: LanguageClient | undefined
let outputChannel: vscode.OutputChannel | undefined

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  outputChannel = vscode.window.createOutputChannel('AgentFlow Language Server')
  context.subscriptions.push(outputChannel)

  context.subscriptions.push(
    vscode.commands.registerCommand('agentflow.restartLanguageServer', async () => {
      await restartLanguageServer(context)
      vscode.window.showInformationMessage('AgentFlow language server restarted.')
    }),
    vscode.workspace.onDidChangeConfiguration(async event => {
      if (event.affectsConfiguration('agentflow.languageServer')) {
        await restartLanguageServer(context)
      }
    }),
    vscode.workspace.onDidSaveTextDocument(async document => {
      if (document.uri.scheme === 'file' && document.fileName.endsWith('go.mod')) {
        await restartLanguageServer(context)
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      await restartLanguageServer(context)
    }),
  )

  await startLanguageServer(context)
}

export async function deactivate(): Promise<void> {
  if (!client) {
    return
  }

  const currentClient = client
  client = undefined
  await currentClient.stop()
}

async function restartLanguageServer(context: vscode.ExtensionContext): Promise<void> {
  await deactivate()
  await startLanguageServer(context)
}

async function startLanguageServer(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration('agentflow.languageServer')
  const command = config.get<string>('command', DEFAULT_COMMAND)
  const args = config.get<string[]>('args', DEFAULT_ARGS)
  const trace = config.get<'off' | 'messages' | 'verbose'>('trace.server', 'off')
  const launchConfig = await resolveLaunchConfig(command, args)

  const executable: Executable = {
    command: launchConfig.command,
    args: launchConfig.args,
  }

  const serverOptions: ServerOptions = {
    run: executable,
    debug: executable,
  }

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'agentflow' },
      { scheme: 'untitled', language: 'agentflow' },
    ],
    outputChannel,
  }

  client = new LanguageClient('agentflow', 'AgentFlow Language Server', serverOptions, clientOptions)
  await client.setTrace(toTrace(trace))

  try {
    await client.start()
    context.subscriptions.push({
      dispose: () => {
        void deactivate()
      },
    })

    if (launchConfig.detectedFromGoMod) {
      outputChannel?.appendLine('Detected AgentFlow tool directive in go.mod; starting language server via `go tool af lsp --mode stdio`.')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const action = 'Open Settings'
    const selection = await vscode.window.showErrorMessage(
      `Failed to start the AgentFlow language server via '${launchConfig.command}'. ${message}`,
      action,
    )

    if (selection === action) {
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'agentflow.languageServer.command',
      )
    }
  }
}

async function resolveLaunchConfig(command: string, args: string[]): Promise<{ command: string; args: string[]; detectedFromGoMod: boolean }> {
  if (!matchesDefaultLaunch(command, args)) {
    return { command, args, detectedFromGoMod: false }
  }

  const usesToolDirective = await workspaceUsesAgentflowGoTool()
  if (usesToolDirective) {
    return { command: GO_TOOL_COMMAND, args: GO_TOOL_ARGS, detectedFromGoMod: true }
  }

  return { command, args, detectedFromGoMod: false }
}

function matchesDefaultLaunch(command: string, args: string[]): boolean {
  return command === DEFAULT_COMMAND && sameArgs(args, DEFAULT_ARGS)
}

function sameArgs(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  return left.every((value, index) => value === right[index])
}

async function workspaceUsesAgentflowGoTool(): Promise<boolean> {
  for (const folder of orderedWorkspaceFolders()) {
    const goModUri = vscode.Uri.joinPath(folder.uri, 'go.mod')

    try {
      const goModContents = await vscode.workspace.fs.readFile(goModUri)
      if (goModUsesAgentflowTool(Buffer.from(goModContents).toString('utf8'))) {
        return true
      }
    } catch (error) {
      if (!(error instanceof vscode.FileSystemError)) {
        outputChannel?.appendLine(`Failed to inspect ${goModUri.fsPath}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  return false
}

function orderedWorkspaceFolders(): readonly vscode.WorkspaceFolder[] {
  const folders = vscode.workspace.workspaceFolders ?? []
  const activeDocument = vscode.window.activeTextEditor?.document

  if (!activeDocument) {
    return folders
  }

  const activeFolder = vscode.workspace.getWorkspaceFolder(activeDocument.uri)
  if (!activeFolder) {
    return folders
  }

  return [activeFolder, ...folders.filter(folder => folder.uri.toString() !== activeFolder.uri.toString())]
}

function goModUsesAgentflowTool(contents: string): boolean {
  const lines = contents.split(/\r?\n/)
  let inToolBlock = false

  for (const rawLine of lines) {
    const line = stripLineComment(rawLine).trim()
    if (!line) {
      continue
    }

    if (inToolBlock) {
      if (line === ')') {
        inToolBlock = false
        continue
      }

      if (line === AGENTFLOW_TOOL_MODULE) {
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

function stripLineComment(line: string): string {
  const commentIndex = line.indexOf('//')
  if (commentIndex === -1) {
    return line
  }

  return line.slice(0, commentIndex)
}

function toTrace(value: 'off' | 'messages' | 'verbose'): Trace {
  switch (value) {
    case 'messages':
      return Trace.Messages
    case 'verbose':
      return Trace.Verbose
    default:
      return Trace.Off
  }
}
