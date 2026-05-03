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
})
