# Change Log

All notable changes to the "agentflow-vscode" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.5.0](https://github.com/omniaura/agentflow-vscode/compare/agentflow-vscode-v0.4.0...agentflow-vscode-v0.5.0) (2026-10-24)


### Features

* **grammar:** highlight .cache ([#30](https://github.com/omniaura/agentflow-vscode/issues/30)) ([06c5728](https://github.com/omniaura/agentflow-vscode/commit/06c5728581e1bde1c461ecd80512e35459cbaecd))
* **grammar:** highlight .map ([#31](https://github.com/omniaura/agentflow-vscode/issues/31)) ([21b97a7](https://github.com/omniaura/agentflow-vscode/commit/21b97a7adbb9322d64a8d84b4cd9fc78d6caba5c))
* **grammar:** highlight .sqlc and .empty ([#28](https://github.com/omniaura/agentflow-vscode/issues/28)) ([a794809](https://github.com/omniaura/agentflow-vscode/commit/a794809ce50c2574d6827954a4b8f84f9d0377c0))
* **grammar:** highlight .wrap ([#29](https://github.com/omniaura/agentflow-vscode/issues/29)) ([58deebf](https://github.com/omniaura/agentflow-vscode/commit/58deebf67b157b8cbccb26a1a9f2b0299b8ea7da))
* highlight .agent sections and inline .sql queries ([#23](https://github.com/omniaura/agentflow-vscode/issues/23)) ([85453f6](https://github.com/omniaura/agentflow-vscode/commit/85453f6a2ddc87b5d311d7d2dc882b6b035ce963))
* highlight .output and .field, and add an .output snippet ([#22](https://github.com/omniaura/agentflow-vscode/issues/22)) ([1222f7e](https://github.com/omniaura/agentflow-vscode/commit/1222f7e55d8cf4b5e736a7b332424e81cb2cb365))
* highlight .returns in agent sections ([#25](https://github.com/omniaura/agentflow-vscode/issues/25)) ([b0e8597](https://github.com/omniaura/agentflow-vscode/commit/b0e8597f3b7dc66c912b115bbccb65301bfb65e0))
* highlight .serve in agent sections ([#26](https://github.com/omniaura/agentflow-vscode/issues/26)) ([060ed31](https://github.com/omniaura/agentflow-vscode/commit/060ed3111981113529764eb8f04f8f799eec9688))
* highlight the SQL of tools written in SQL ([#27](https://github.com/omniaura/agentflow-vscode/issues/27)) ([d35e4bc](https://github.com/omniaura/agentflow-vscode/commit/d35e4bcee24004e5178066f3a0498cddd40ae33a))
* use the language server for lint and formatting, and support .tool, .route and the af commands ([#20](https://github.com/omniaura/agentflow-vscode/issues/20)) ([ecb254e](https://github.com/omniaura/agentflow-vscode/commit/ecb254e8b4a5ed2df7d2b2facd20737c005e5c03))


### Bug Fixes

* embed SQL only inside .route sections ([#24](https://github.com/omniaura/agentflow-vscode/issues/24)) ([8bd2836](https://github.com/omniaura/agentflow-vscode/commit/8bd2836a533d183479a40e83663ff7773a64b4f9))

## [0.4.0](https://github.com/omniaura/agentflow-vscode/compare/agentflow-vscode-v0.3.0...agentflow-vscode-v0.4.0) (2026-05-03)


### Features

* surface af lint diagnostics ([#15](https://github.com/omniaura/agentflow-vscode/issues/15)) ([8cc461b](https://github.com/omniaura/agentflow-vscode/commit/8cc461b7774fb2f1e1edf2797fefe075bd1ca3d7)), closes [#14](https://github.com/omniaura/agentflow-vscode/issues/14)

## [0.3.0](https://github.com/omniaura/agentflow-vscode/compare/agentflow-vscode-v0.2.0...agentflow-vscode-v0.3.0) (2026-05-03)


### Features

* register Format Document provider via af fmt ([#12](https://github.com/omniaura/agentflow-vscode/issues/12)) ([6772d5f](https://github.com/omniaura/agentflow-vscode/commit/6772d5fcf13a2b2f8098cc7bc99c7b0856925966)), closes [#11](https://github.com/omniaura/agentflow-vscode/issues/11)

## [0.2.0](https://github.com/omniaura/agentflow-vscode/compare/agentflow-vscode-v0.1.0...agentflow-vscode-v0.2.0) (2026-05-03)


### Features

* add create demo project command ([#9](https://github.com/omniaura/agentflow-vscode/issues/9)) ([6df46a3](https://github.com/omniaura/agentflow-vscode/commit/6df46a3719911cda23db24de80dffd1734f81bb0)), closes [#8](https://github.com/omniaura/agentflow-vscode/issues/8)

## [0.1.0](https://github.com/omniaura/agentflow-vscode/compare/agentflow-vscode-v0.0.1...agentflow-vscode-v0.1.0) (2026-03-26)


### Features

* expand TextMate grammar coverage ([#7](https://github.com/omniaura/agentflow-vscode/issues/7)) ([f7f90c4](https://github.com/omniaura/agentflow-vscode/commit/f7f90c4921f4c457eaf5b7a1dc31ea27500fb53a))
* launch the AgentFlow LSP from VS Code ([#5](https://github.com/omniaura/agentflow-vscode/issues/5)) ([c38a940](https://github.com/omniaura/agentflow-vscode/commit/c38a940e50a98973497944c2399b61aee4b18def))

## [Unreleased]

- add a VS Code language client that launches `af lsp`
- auto-detect `github.com/omniaura/agentflow/cmd/af` in workspace `go.mod` tool directives and switch to `go tool af lsp`
- add extension settings for configuring the AgentFlow language server command and args
- replace placeholder README and marketplace metadata with publishable content

## [0.0.1]

- initial syntax-highlighting release
