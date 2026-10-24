import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { DEFAULT_ARGS, afArgs, goModUsesAgentflowTool, resolveAF, serverServesLintAndFormat } from './launch'

describe('resolveAF', () => {
  test('runs go tool af when go.mod pins it', () => {
    const { af, lspArgs } = resolveAF('af', DEFAULT_ARGS, true)
    expect(af.command).toBe('go')
    expect(afArgs(af, ['gen', 'prompts', '.'])).toEqual(['tool', 'af', 'gen', 'prompts', '.'])
    expect([...af.prefix, ...lspArgs]).toEqual(['tool', 'af', 'lsp', '--mode', 'stdio'])
  })

  test('runs af from PATH otherwise', () => {
    const { af, lspArgs } = resolveAF('af', DEFAULT_ARGS, false)
    expect(af.command).toBe('af')
    expect(afArgs(af, ['fmt', 'x.af'])).toEqual(['fmt', 'x.af'])
    expect(lspArgs).toEqual(DEFAULT_ARGS)
  })

  test('a custom command keeps its prefix for CLI commands', () => {
    const { af, lspArgs } = resolveAF('/opt/go/bin/go', ['tool', 'af', 'lsp', '--debug'], false)
    expect(af.command).toBe('/opt/go/bin/go')
    expect(afArgs(af, ['eject'])).toEqual(['tool', 'af', 'eject'])
    expect(lspArgs).toEqual(['lsp', '--debug'])
  })

  test('a custom server without lsp in its args falls back to af for the CLI', () => {
    const { af, lspArgs } = resolveAF('my-af-server', ['--stdio'], true)
    expect(af.command).toBe('af')
    expect(lspArgs).toEqual(['--stdio'])
  })
})

describe('serverServesLintAndFormat', () => {
  test('needs formatting and definition', () => {
    expect(serverServesLintAndFormat({ documentFormattingProvider: true, definitionProvider: true })).toBe(true)
    expect(serverServesLintAndFormat({ documentFormattingProvider: true })).toBe(false)
    expect(serverServesLintAndFormat({})).toBe(false)
    expect(serverServesLintAndFormat(undefined)).toBe(false)
  })
})

describe('goModUsesAgentflowTool', () => {
  test('finds tool lines and blocks, ignoring comments', () => {
    expect(goModUsesAgentflowTool('module x\n\ntool github.com/omniaura/agentflow/cmd/af\n')).toBe(true)
    expect(goModUsesAgentflowTool('tool (\n\tgolang.org/x/tools/cmd/stringer\n\tgithub.com/omniaura/agentflow/cmd/af // af\n)\n')).toBe(true)
    expect(goModUsesAgentflowTool('// tool github.com/omniaura/agentflow/cmd/af\nrequire github.com/omniaura/agentflow v0.13.0\n')).toBe(false)
  })
})

const grammar = JSON.parse(readFileSync(new URL('../syntaxes/agentflow.tmLanguage.json', import.meta.url), 'utf8'))

function captures(rule: { match: string }, line: string): Record<number, string> | null {
  const m = new RegExp(rule.match).exec(line)
  if (!m) {
    return null
  }
  const out: Record<number, string> = {}
  m.forEach((v, i) => {
    if (i > 0 && v !== undefined && v.trim() !== '') {
      out[i] = v
    }
  })
  return out
}

describe('grammar', () => {
  const [tool] = grammar.repository.sectionHeader.patterns
  const route = { match: grammar.repository.routeSection.begin }
  test('section headers', () => {
    expect(captures(tool, '.tool offer_refund')).toEqual({ 1: '.tool', 3: 'offer_refund' })
    expect(captures(tool, '.output task_value_check')).toEqual({ 1: '.output', 3: 'task_value_check' })
    expect(captures(tool, '.agent support')).toEqual({ 1: '.agent', 3: 'support' })
    expect(captures(route, '.route GET /todos/{id} GetTodo')).toEqual({ 1: '.route', 3: 'GET', 5: '/todos/{id}', 7: 'GetTodo' })
    expect(captures(route, '.route PATCH /a db.UpsertA')?.[7]).toBe('db.UpsertA')
    expect(captures(route, '.route FETCH /a Q')).toBeNull()
  })

  test('params with and without types', () => {
    const param = grammar.repository.paramDirective
    expect(captures(param, '.param reason enum(damaged, late) Why.')).toEqual({ 1: '.param', 3: 'reason', 5: 'enum(damaged, late)', 6: ' Why.' })
    expect(captures(param, '.param lines[].quantity int How many.')).toEqual({ 1: '.param', 3: 'lines[].quantity', 5: 'int', 6: ' How many.' })
    expect(captures(param, '.param note? A note.')).toEqual({ 1: '.param', 3: 'note?', 6: ' A note.' })
    expect(captures(param, '.param ids []int?')).toEqual({ 1: '.param', 3: 'ids', 5: '[]int?' })
    expect(captures(param, '.field cadence? enum(daily, weekly) How often.')).toEqual({ 1: '.field', 3: 'cadence?', 5: 'enum(daily, weekly)', 6: ' How often.' })
    // The longest type wins, and a word that only starts like a type is
    // description.
    expect(captures(param, '.param rate float64 Cost')).toEqual({ 1: '.param', 3: 'rate', 5: 'float64', 6: ' Cost' })
    expect(captures(param, '.param n integer Count')?.[5]).toBe('integer')
    expect(captures(param, '.param ok boolean? Flag')?.[5]).toBe('boolean?')
    expect(captures(param, '.param q anything goes')).toEqual({ 1: '.param', 3: 'q', 6: ' anything goes' })
  })

  test('route and tool directives', () => {
    const directive = grammar.repository.sectionDirective
    expect(captures(directive, '.auth owner_id, kg_id')).toEqual({ 1: '.auth', 2: ' owner_id, kg_id' })
    expect(captures(directive, '.public')).toEqual({ 1: '.public' })
    expect(captures(directive, '.authority')).toBeNull()
    expect(captures(directive, '.tools lookup_order, offer_refund')).toEqual({ 1: '.tools', 2: ' lookup_order, offer_refund' })
    expect(captures(directive, '.system Support')).toEqual({ 1: '.system', 2: ' Support' })
    expect(captures(directive, '.maxturns 6')).toEqual({ 1: '.maxturns', 2: ' 6' })
    expect(captures(directive, '.returns triage')).toEqual({ 1: '.returns', 2: ' triage' })
    expect(captures(directive, '.serve POST /triage')).toEqual({ 1: '.serve', 2: ' POST /triage' })
  })

  test('inline sql', () => {
    const sql = grammar.repository.sqlBlock
    expect(captures({ match: sql.begin }, '.sql :execrows')).toEqual({ 1: '.sql', 3: ':execrows' })
    expect(captures({ match: sql.begin }, '.sql :batchone')).toBeNull()
    const end = new RegExp(sql.end, 'm')
    for (const line of ['.route GET /a A', '.agent x', '.title T', '.tool t', '.output o']) {
      expect(end.test(line)).toBe(true)
    }
    expect(end.test('SELECT 1')).toBe(false)
    expect(sql.patterns).toEqual([{ include: 'source.sql' }])
    // Only a .route section holds a query.
    expect(grammar.patterns.map((p: { include: string }) => p.include)).not.toContain('#sqlBlock')
    expect(grammar.repository.routeSection.patterns[0]).toEqual({ include: '#sqlBlock' })
    expect(grammar.repository.routeSection.end).toBe(sql.end)
  })

  test('loops', () => {
    expect(captures(grammar.repository.loopDirective, '<*tools []Tool as tool>')).toEqual({ 1: '<', 2: '*', 3: 'tools', 5: '[]Tool', 7: 'as', 9: 'tool', 10: '>' })
  })

  test('every included rule exists', () => {
    for (const p of grammar.patterns) {
      expect(grammar.repository[p.include.slice(1)]).toBeDefined()
    }
  })
})

describe('snippets', () => {
  const snippets = JSON.parse(readFileSync(new URL('../snippets/agentflow.json', import.meta.url), 'utf8'))
  test('cover the section directives', () => {
    const prefixes = Object.values(snippets).map((s: any) => s.prefix)
    expect(prefixes).toEqual(expect.arrayContaining(['.title', '.tool', '.output', '.route', '.agent', '.sql', '<?', '<*']))
  })
})
