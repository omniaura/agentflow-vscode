import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

describe('extension manifest', () => {
  test('contributes the create demo project command', () => {
    expect(packageJson.activationEvents).toContain('onCommand:agentflow.createDemoProject')
    expect(packageJson.contributes.commands).toContainEqual({
      command: 'agentflow.createDemoProject',
      title: 'AgentFlow: Create Demo Project',
    })
  })

  test('activates on AgentFlow documents for formatting support', () => {
    expect(packageJson.activationEvents).toContain('onLanguage:agentflow')
    expect(packageJson.contributes.languages).toContainEqual(
      expect.objectContaining({
        id: 'agentflow',
        extensions: ['.af'],
      }),
    )
  })

  test('activates on AgentFlow documents for lint diagnostics', () => {
    expect(packageJson.activationEvents).toContain('onLanguage:agentflow')
  })

  test('contributes the af CLI commands', () => {
    for (const [command, title] of [
      ['agentflow.generate', 'AgentFlow: Generate Go Code'],
      ['agentflow.check', 'AgentFlow: Check Generated Code'],
      ['agentflow.installSkills', 'AgentFlow: Install Agent Skills'],
      ['agentflow.ejectRuntime', 'AgentFlow: Eject Runtime'],
    ]) {
      expect(packageJson.activationEvents).toContain(`onCommand:${command}`)
      expect(packageJson.contributes.commands).toContainEqual({ command, title })
    }
  })

  test('contributes snippets', () => {
    expect(packageJson.contributes.snippets).toContainEqual({ language: 'agentflow', path: './snippets/agentflow.json' })
  })
})
