import * as vscode from 'vscode'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import {
  Executable,
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  Trace,
} from 'vscode-languageclient/node'
import {
  DEFAULT_ARGS,
  DEFAULT_COMMAND,
  Launch,
  afArgs,
  goModUsesAgentflowTool,
  resolveAF,
  serverServesLintAndFormat,
} from './launch'

const execFileAsync = promisify(execFile)
const INSTALL_HINT = 'Install AgentFlow with: go install github.com/omniaura/agentflow/cmd/af@latest, or pin it with: go get -tool github.com/omniaura/agentflow/cmd/af@latest'
const LINT_DEBOUNCE_MS = 300

let client: LanguageClient | undefined
let outputChannel: vscode.OutputChannel | undefined
let diagnosticCollection: vscode.DiagnosticCollection | undefined
// af is how the language server runs: `af` or `go tool af`, launched in
// afCwd, the module that pins af as a tool.
let af: Launch = { command: DEFAULT_COMMAND, prefix: [], detectedFromGoMod: false }
let afCwd: string | undefined
// Servers older than af v0.13 neither lint nor format, so the extension
// runs af lint and af fmt itself for them. These are its registrations.
let legacy: vscode.Disposable[] | undefined
const lintTimers = new Map<string, ReturnType<typeof setTimeout>>()

type AgentFlowDiagnostic = {
  file: string
  line: number
  column: number
  severity: 'error' | 'warning'
  code: string
  message: string
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  outputChannel = vscode.window.createOutputChannel('AgentFlow Language Server')
  diagnosticCollection = vscode.languages.createDiagnosticCollection('agentflow-lint')
  context.subscriptions.push(outputChannel, diagnosticCollection, { dispose: () => disableLegacy() })

  context.subscriptions.push(
    vscode.commands.registerCommand('agentflow.createDemoProject', async () => {
      await createDemoProject()
    }),
    vscode.commands.registerCommand('agentflow.restartLanguageServer', async () => {
      await restartLanguageServer(context)
      vscode.window.showInformationMessage('AgentFlow language server restarted.')
    }),
    vscode.commands.registerCommand('agentflow.generate', async () => {
      await runInWorkspace(['gen', 'prompts', generateTarget()], 'Generated Go code from .af files.')
    }),
    vscode.commands.registerCommand('agentflow.check', async () => {
      await runInWorkspace(['check', './...'], 'af check passed.')
    }),
    vscode.commands.registerCommand('agentflow.installSkills', async () => {
      await runInWorkspace(['skills', 'install'], 'Installed the AgentFlow agent skill.')
    }),
    vscode.commands.registerCommand('agentflow.ejectRuntime', async () => {
      await runInWorkspace(['eject'], 'Ejected the AgentFlow runtime. Run AgentFlow: Generate Go Code to use it.')
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
      scheduleLint(document)
    }),
    vscode.workspace.onDidOpenTextDocument(document => {
      scheduleLint(document)
    }),
    vscode.workspace.onDidChangeTextDocument(event => {
      scheduleLint(event.document)
    }),
    vscode.workspace.onDidCloseTextDocument(document => {
      clearLintTimer(document)
      diagnosticCollection?.delete(document.uri)
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      await restartLanguageServer(context)
    }),
  )

  if (shouldStartLanguageServer()) {
    await startLanguageServer(context)
  }
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

// enableLegacy registers the af lint and af fmt fallbacks for servers that
// do not lint or format.
function enableLegacy(): void {
  if (legacy) {
    return
  }
  outputChannel?.appendLine('This af language server does not lint or format; running af lint and af fmt instead. Upgrade af to v0.13 or later for go to definition, rename and faster diagnostics.')
  legacy = [
    vscode.languages.registerDocumentFormattingEditProvider('agentflow', {
      provideDocumentFormattingEdits: async document => formatDocument(document),
    }),
  ]
  for (const document of vscode.workspace.textDocuments) {
    scheduleLint(document)
  }
}

function disableLegacy(): void {
  for (const d of legacy ?? []) {
    d.dispose()
  }
  legacy = undefined
  for (const timer of lintTimers.values()) {
    clearTimeout(timer)
  }
  lintTimers.clear()
  diagnosticCollection?.clear()
}

async function createDemoProject(): Promise<void> {
  const selections = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Create Demo Here',
    title: 'Select an empty folder for the AgentFlow demo project',
  })

  const demoDir = selections?.[0]
  if (!demoDir) {
    return
  }

  try {
    await runAF(['demo', 'init', demoDir.fsPath])
  } catch (error) {
    if (isMissingExecutableError(error)) {
      vscode.window.showErrorMessage(`AgentFlow CLI not found. ${INSTALL_HINT}`)
      return
    }
    vscode.window.showErrorMessage(`Failed to create AgentFlow demo project. ${formatCommandError(error)}`)
    return
  }

  await vscode.commands.executeCommand('vscode.openFolder', demoDir, false)
  vscode.window.showInformationMessage('AgentFlow demo created. Next: run `af gen prompts --dir prompts`, then `go run .`.')
}

// generateTarget is the directory af gen runs on: the active .af file's,
// or the workspace.
function generateTarget(): string {
  const document = vscode.window.activeTextEditor?.document
  if (document?.languageId === 'agentflow' && document.uri.scheme === 'file') {
    return dirname(document.uri.fsPath)
  }
  return '.'
}

function workspaceRoot(): string | undefined {
  const document = vscode.window.activeTextEditor?.document
  const folder = (document && vscode.workspace.getWorkspaceFolder(document.uri)) ?? vscode.workspace.workspaceFolders?.[0]
  return folder?.uri.fsPath
}

async function runInWorkspace(args: string[], success: string): Promise<void> {
  const cwd = workspaceRoot()
  if (!cwd) {
    vscode.window.showErrorMessage('Open a folder to run AgentFlow commands.')
    return
  }
  outputChannel?.appendLine(`$ af ${args.join(' ')}  (in ${cwd})`)
  try {
    const { stdout, stderr } = await runAF(args, cwd)
    outputChannel?.append(stdout + stderr)
    vscode.window.showInformationMessage(success)
  } catch (error) {
    if (isMissingExecutableError(error)) {
      vscode.window.showErrorMessage(`AgentFlow CLI not found. ${INSTALL_HINT}`)
      return
    }
    outputChannel?.appendLine(formatCommandError(error))
    outputChannel?.show(true)
    vscode.window.showErrorMessage(`af ${args[0]} failed; see the AgentFlow output.`)
  }
}

async function formatDocument(document: vscode.TextDocument): Promise<vscode.TextEdit[] | undefined> {
  let tempDir: string | undefined

  try {
    let targetPath = document.uri.fsPath
    if (document.uri.scheme !== 'file' || document.isDirty) {
      tempDir = await mkdtemp(join(tmpdir(), 'agentflow-format-'))
      targetPath = join(tempDir, 'document.af')
      await writeFile(targetPath, document.getText(), 'utf8')
    }

    const { stdout } = await runAF(['fmt', targetPath], documentDir(document))
    const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length))
    return [vscode.TextEdit.replace(fullRange, stdout)]
  } catch (error) {
    if (isMissingExecutableError(error)) {
      vscode.window.showErrorMessage(`AgentFlow CLI not found. ${INSTALL_HINT}`)
      return undefined
    }

    outputChannel?.appendLine('AgentFlow formatter failed:')
    outputChannel?.appendLine(formatCommandError(error))
    outputChannel?.show(true)
    return undefined
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
    }
  }
}

function scheduleLint(document: vscode.TextDocument): void {
  if (!legacy || document.languageId !== 'agentflow') {
    return
  }

  clearLintTimer(document)
  const key = document.uri.toString()
  lintTimers.set(key, setTimeout(() => {
    lintTimers.delete(key)
    void lintDocument(document)
  }, LINT_DEBOUNCE_MS))
}

function clearLintTimer(document: vscode.TextDocument): void {
  const key = document.uri.toString()
  const timer = lintTimers.get(key)
  if (timer) {
    clearTimeout(timer)
    lintTimers.delete(key)
  }
}

async function lintDocument(document: vscode.TextDocument): Promise<void> {
  let tempDir: string | undefined

  try {
    let targetPath = document.uri.fsPath
    if (document.uri.scheme !== 'file' || document.isDirty) {
      tempDir = await mkdtemp(join(tmpdir(), 'agentflow-lint-'))
      targetPath = join(tempDir, 'document.af')
      await writeFile(targetPath, document.getText(), 'utf8')
    }

    const { stdout } = await runAF(['lint', '--format', 'json', targetPath], documentDir(document))
    diagnosticCollection?.set(document.uri, parseLintDiagnostics(document, stdout))
  } catch (error) {
    if (isMissingExecutableError(error)) {
      diagnosticCollection?.delete(document.uri)
      return
    }

    const stdout = getCommandStdout(error)
    if (stdout) {
      diagnosticCollection?.set(document.uri, parseLintDiagnostics(document, stdout))
      return
    }

    outputChannel?.appendLine('AgentFlow lint failed:')
    outputChannel?.appendLine(formatCommandError(error))
    outputChannel?.show(true)
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
    }
  }
}

function parseLintDiagnostics(document: vscode.TextDocument, raw: string): vscode.Diagnostic[] {
  const parsed = JSON.parse(raw) as AgentFlowDiagnostic[]
  return parsed.map(diagnostic => {
    const line = Math.max(diagnostic.line - 1, 0)
    const column = Math.max(diagnostic.column - 1, 0)
    const start = new vscode.Position(line, column)
    const lineText = document.lineAt(Math.min(line, document.lineCount - 1)).text
    const endColumn = Math.min(Math.max(column + 1, column), lineText.length)
    const range = new vscode.Range(start, new vscode.Position(line, endColumn))
    const severity = diagnostic.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning
    const vscodeDiagnostic = new vscode.Diagnostic(range, diagnostic.message, severity)
    vscodeDiagnostic.code = diagnostic.code
    vscodeDiagnostic.source = 'af lint'
    return vscodeDiagnostic
  })
}

// runAF runs the af CLI in cwd the way that folder does: `go tool af` when
// its go.mod pins af, otherwise af from PATH or the configured command.
async function runAF(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  const dir = cwd ?? workspaceRoot()
  const config = vscode.workspace.getConfiguration('agentflow.languageServer')
  const folder = dir ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(dir)) : undefined
  const pinned = folder ? await folderUsesAgentflowGoTool(folder) : false
  const { af: launch } = resolveAF(config.get<string>('command', DEFAULT_COMMAND), config.get<string[]>('args', DEFAULT_ARGS), pinned)
  return execFileAsync(launch.command, afArgs(launch, args), { cwd: dir })
}

// documentDir is where af runs for a document: its workspace folder.
function documentDir(document: vscode.TextDocument): string | undefined {
  return vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ?? workspaceRoot()
}

function formatCommandError(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return String(error)
  }

  const parts: string[] = []
  if ('message' in error && typeof error.message === 'string' && error.message !== '') {
    parts.push(error.message)
  }
  if ('stdout' in error && typeof error.stdout === 'string' && error.stdout !== '') {
    parts.push(error.stdout.trimEnd())
  }
  if ('stderr' in error && typeof error.stderr === 'string' && error.stderr !== '') {
    parts.push(error.stderr.trimEnd())
  }

  return parts.join('\n') || String(error)
}

function getCommandStdout(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'stdout' in error && typeof error.stdout === 'string' && error.stdout !== '') {
    return error.stdout
  }
  return undefined
}

function shouldStartLanguageServer(): boolean {
  const documents = new Set<vscode.TextDocument>()
  if (vscode.window.activeTextEditor) {
    documents.add(vscode.window.activeTextEditor.document)
  }
  for (const editor of vscode.window.visibleTextEditors) {
    documents.add(editor.document)
  }

  return [...documents].some(document => document.languageId === 'agentflow')
}

function isMissingExecutableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  return 'code' in error && error.code === 'ENOENT'
}

async function resolveLaunch(): Promise<ReturnType<typeof resolveAF> & { cwd?: string }> {
  const config = vscode.workspace.getConfiguration('agentflow.languageServer')
  const command = config.get<string>('command', DEFAULT_COMMAND)
  const args = config.get<string[]>('args', DEFAULT_ARGS)
  const folder = await workspaceAgentflowToolFolder()
  return { ...resolveAF(command, args, folder !== undefined), cwd: folder?.uri.fsPath }
}

async function startLanguageServer(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration('agentflow.languageServer')
  const trace = config.get<'off' | 'messages' | 'verbose'>('trace.server', 'off')
  const resolved = await resolveLaunch()
  af = resolved.af
  afCwd = af.detectedFromGoMod ? resolved.cwd : undefined

  const executable: Executable = {
    command: af.command,
    args: [...af.prefix, ...resolved.lspArgs],
    // go tool af resolves af from the module whose go.mod pins it.
    options: afCwd ? { cwd: afCwd } : undefined,
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

    if (af.detectedFromGoMod) {
      outputChannel?.appendLine('Detected AgentFlow tool directive in go.mod; starting language server via `go tool af lsp --mode stdio`.')
    }
    if (serverServesLintAndFormat(client.initializeResult?.capabilities)) {
      disableLegacy()
    } else {
      enableLegacy()
    }
  } catch (error) {
    // Without a server, af lint and af fmt may still work.
    enableLegacy()
    const message = error instanceof Error ? error.message : String(error)
    const action = 'Open Settings'
    const selection = await vscode.window.showErrorMessage(
      `Failed to start the AgentFlow language server via '${af.command}'. ${message}`,
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

// workspaceAgentflowToolFolder returns the first workspace folder, active
// folder first, whose go.mod pins af as a tool.
async function workspaceAgentflowToolFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  for (const folder of orderedWorkspaceFolders()) {
    if (await folderUsesAgentflowGoTool(folder)) {
      return folder
    }
  }
  return undefined
}

async function folderUsesAgentflowGoTool(folder: vscode.WorkspaceFolder): Promise<boolean> {
  const goModUri = vscode.Uri.joinPath(folder.uri, 'go.mod')
  try {
    const goModContents = await vscode.workspace.fs.readFile(goModUri)
    return goModUsesAgentflowTool(Buffer.from(goModContents).toString('utf8'))
  } catch (error) {
    if (!(error instanceof vscode.FileSystemError)) {
      outputChannel?.appendLine(`Failed to inspect ${goModUri.fsPath}: ${error instanceof Error ? error.message : String(error)}`)
    }
    return false
  }
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
