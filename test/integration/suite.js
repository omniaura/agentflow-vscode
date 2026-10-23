const vscode = require('vscode')
const assert = require('node:assert/strict')
const path = require('node:path')

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function until(what, fn, timeout = 20000) {
  const start = Date.now()
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() - start > timeout) throw new Error('timed out waiting for ' + what)
    await sleep(200)
  }
}

exports.run = async function () {
  const modern = process.env.AF_EXPECT === 'modern'
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath
  const uri = vscode.Uri.file(path.join(root, 'todos.af'))
  const doc = await vscode.workspace.openTextDocument(uri)
  await vscode.window.showTextDocument(doc)
  assert.equal(doc.languageId, 'agentflow')
  const ext = vscode.extensions.getExtension('omniaura.agentflow-vscode')
  await until('activation', () => ext.isActive)

  // Diagnostics: append a broken prompt and expect AF003 from the server
  // (modern) or from af lint (legacy).
  const editor = vscode.window.activeTextEditor
  await editor.edit(b => b.insert(new vscode.Position(doc.lineCount, 0), '\n.title Broken\n<!who> <!who>\n<?x>\n'))
  const diags = await until('AF003 diagnostic', () => {
    const d = vscode.languages.getDiagnostics(uri).filter(d => d.code === 'AF003' || d.code?.value === 'AF003')
    return d.length ? d : null
  })
  console.log('diagnostic:', diags[0].message, diags[0].source)
  assert.equal(diags[0].source, modern ? 'agentflow' : 'af lint')

  // Formatting goes through exactly one provider either way.
  const edits = await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', uri, { tabSize: 4, insertSpaces: true })
  assert.ok(Array.isArray(edits) && edits.length > 0, 'format edits, got ' + JSON.stringify(edits))
  console.log('format edit ok')

  const routeLine = doc.getText().split('\n').findIndex(l => l.startsWith('.route GET /todos/{id} GetTodo'))
  assert.ok(routeLine >= 0, 'the workspace todos.af needs a .route GET /todos/{id} GetTodo line')
  const onQuery = new vscode.Position(routeLine, '.route GET /todos/{id} Get'.length)
  const defs = await vscode.commands.executeCommand('vscode.executeDefinitionProvider', uri, onQuery)
  const hovers = await vscode.commands.executeCommand('vscode.executeHoverProvider', uri, onQuery)
  const hoverText = hovers.flatMap(h => h.contents.map(c => c.value ?? String(c))).join('\n')
  const symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', uri)
  if (modern) {
    const target = defs[0].targetUri ?? defs[0].uri
    assert.ok(target.fsPath.endsWith(path.join('db', 'queries.sql.go')), 'definition ' + target.fsPath)
    assert.match(hoverText, /`ownerId` string ← caller/)
    assert.ok(symbols.some(s => s.name === 'GET /todos/{id}'), 'route symbol')
    const whoLine = doc.getText().split('\n').findIndex(l => l.startsWith('<!who>'))
    const rename = await vscode.commands.executeCommand('vscode.executeDocumentRenameProvider', uri, new vscode.Position(whoLine, 3), 'name')
    assert.equal(rename.get(uri).length, 2, 'rename both <!who>, got ' + JSON.stringify(rename.get(uri)))
    console.log('definition, hover, symbols, rename ok')
  } else {
    assert.equal(defs.length, 0)
    console.log('legacy server: no definition, as expected')
  }
  console.log('PASS', process.env.AF_EXPECT)
}
