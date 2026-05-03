# AgentFlow for VS Code

AgentFlow adds first-class editor support for `.af` templates in VS Code.

Instead of relying on a large TextMate grammar, the extension starts the AgentFlow language server so the editor stays aligned with the real parser and tokenizer used by `af gen prompts`.

## Features

- semantic highlighting powered by `af lsp`
- hover information for variables and conditional operators
- completions for directives, variables, types, and comparison operators
- parser diagnostics surfaced directly in the editor
- document symbols for prompt titles and variables
- command-palette demo project scaffolding via `af demo init`
- Format Document support powered by `af fmt`
- inline diagnostics powered by `af lint --format json`
- bracket matching and auto-closing for AgentFlow tags

The bundled TextMate grammar remains as a lightweight fallback while semantic tokens load, but the LSP is the primary source of language intelligence.

## Requirements

Install the AgentFlow CLI first:

```bash
go install github.com/omniaura/agentflow/cmd/af@latest
```

If you pin AgentFlow as a project-scoped Go tool instead, the extension detects that automatically from the workspace `go.mod` and switches to `go tool af lsp --mode stdio` when the default launch settings are still in place.

## Installation

Install from the VS Code Marketplace once published, or package it locally:

1. Clone `https://github.com/omniaura/agentflow-vscode`
2. Run `bun install`
3. Run `bun run package`
4. In VS Code, use `Extensions: Install from VSIX...`
5. Select the generated `.vsix` file

## Releases

Releases are automated with Release Please. Merge conventional commits into `main`, let Release Please open the version bump PR, and merge that PR to publish a new Marketplace release.

The workflow also uploads the built `.vsix` to the matching GitHub release.

VS Code Marketplace publishing still requires a `VSCE_PAT` secret today. There is no native GitHub OIDC trusted publishing flow for `vsce`, so this repo uses a publisher token rather than npm-style trusted publishing.

## Configuration

The extension starts the AgentFlow language server with these defaults:

- `agentflow.languageServer.command`: `af`
- `agentflow.languageServer.args`: `['lsp', '--mode', 'stdio']`

When those defaults are unchanged, the extension checks the active workspace's `go.mod`. If it finds the AgentFlow tool directive, it automatically switches to:

- `agentflow.languageServer.command`: `go`
- `agentflow.languageServer.args`: `['tool', 'af', 'lsp', '--mode', 'stdio']`

If you set custom command or args values yourself, the extension respects them and skips auto-detection.

You can also enable client tracing with `agentflow.languageServer.trace.server`.

## Formatting

Use VS Code's `Format Document` command in `.af` files to format templates with the AgentFlow CLI. The extension shells out to `af fmt` and applies the result as a single full-document edit, so formatter behavior stays aligned with the CLI.

Formatter errors are written to the AgentFlow output channel without modifying the open document.

## Diagnostics

AgentFlow files are linted with `af lint --format json` on open, save, and debounced edits. Diagnostics are displayed inline in VS Code and use the same rules as the CLI linter.

## Demo Projects

Run `AgentFlow: Create Demo Project` from the command palette to select an empty folder and scaffold a runnable demo project. The extension shells out to `af demo init <selected-folder>`, so the AgentFlow CLI remains the single source of truth for emitted demo files.

After the folder opens, run:

```bash
af gen prompts --dir prompts
go run .
```

## AgentFlow Syntax Overview

AgentFlow templates support:

- titles with `.title Prompt Name`
- variables such as `<!user.name>`
- typed variables such as `<!count int>` and `<!enabled bool>`
- conditional blocks such as `<?user.premium>` ... `</user.premium>`
- optional `<else>` branches
- comparison operators: `eq`, `ne`, `gt`, `lt`, `gte`, `lte`

Example:

```af
.title Review Summary
Hello <!user.name>

<?score gte 90>
Ship it.
<else>
Needs another pass.
</score>
```

## Development

```bash
bun install
bun run compile
bun run package
```

To test locally, press `F5` in VS Code to launch an Extension Development Host.

## Contributing

Issues and pull requests are welcome at `https://github.com/omniaura/agentflow-vscode`.

## License

MIT. See `LICENSE`.
