// Runs the integration suite in a real VS Code: node test/integration/runTest.js
// AF_BIN selects the af binary the extension launches, or go-tool.
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { runTests } = require('@vscode/test-electron')

async function main() {
  const workspace = process.env.AF_WORKSPACE
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'af-vscode-'))
  fs.mkdirSync(path.join(userData, 'User'), { recursive: true })
  // AF_BIN=go-tool keeps the default settings, so the extension has to find
  // af through the workspace go.mod's tool directive.
  const settings = process.env.AF_BIN === 'go-tool' ? {} : {
    'agentflow.languageServer.command': process.env.AF_BIN,
    'agentflow.languageServer.args': ['lsp', '--mode', 'stdio'],
  }
  fs.writeFileSync(path.join(userData, 'User', 'settings.json'), JSON.stringify(settings))
  await runTests({
    version: '1.105.1',
    extensionDevelopmentPath: path.resolve(__dirname, '../..'),
    extensionTestsPath: path.resolve(__dirname, 'suite.js'),
    launchArgs: [workspace, '--disable-extensions', '--user-data-dir', userData, '--no-sandbox', '--disable-gpu'],
    extensionTestsEnv: { AF_EXPECT: process.env.AF_EXPECT || 'modern' },
  })
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
