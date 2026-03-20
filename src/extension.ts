import * as vscode from 'vscode'
import {
  Executable,
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  Trace,
} from 'vscode-languageclient/node'

let client: LanguageClient | undefined

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  context.subscriptions.push(
    vscode.commands.registerCommand('agentflow.restartLanguageServer', async () => {
      await restartLanguageServer(context)
      vscode.window.showInformationMessage('AgentFlow language server restarted.')
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
  const command = config.get<string>('command', 'af')
  const args = config.get<string[]>('args', ['lsp', '--mode', 'stdio'])
  const trace = config.get<'off' | 'messages' | 'verbose'>('trace.server', 'off')

  const executable: Executable = {
    command,
    args,
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
    outputChannel: vscode.window.createOutputChannel('AgentFlow Language Server'),
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const action = 'Open Settings'
    const selection = await vscode.window.showErrorMessage(
      `Failed to start the AgentFlow language server via '${command}'. ${message}`,
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
