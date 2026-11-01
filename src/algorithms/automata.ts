export const EPSILON = 'ε'

export type Transition = { from: string; to: string; symbol: string }
export type Automaton = {
  states: string[]
  alphabet: string[]
  transitions: Transition[]
  start: string
  accepts: string[]
  subsets?: Record<string, string[]>
}
export type Trace = {
  accepted: boolean
  steps: { symbol: string; from: string[]; to: string[] }[]
  finalStates: string[]
  reason: string
}

const isOperator = (token: string) => ['+', '|', '.', '*', '(', ')'].includes(token)
const isOperand = (token: string) => !isOperator(token)

export function parseRegex(source: string) {
  const compact = source.replace(/\s/g, '')
  if (!compact) throw new Error('Enter a regular expression to begin.')

  const tokens = [...compact]
  let balance = 0
  tokens.forEach((token, index) => {
    if (token === '(') balance++
    if (token === ')') balance--
    if (balance < 0) throw new Error('A closing parenthesis has no matching opening parenthesis.')
    if ((token === '+' || token === '|') && (index === 0 || index === tokens.length - 1))
      throw new Error('Union needs an expression on both sides.')
    if (token === '*' && (index === 0 || ['+', '|', '('].includes(tokens[index - 1])))
      throw new Error('Kleene star must follow a symbol or group.')
    if (token === '(' && tokens[index + 1] === ')') throw new Error('Empty groups are not supported. Use ε.')
  })
  if (balance !== 0) throw new Error('Parentheses are not balanced.')

  const explicit: string[] = []
  tokens.forEach((token, index) => {
    const previous = tokens[index - 1]
    if (
      index > 0 &&
      (isOperand(previous) || previous === ')' || previous === '*') &&
      (isOperand(token) || token === '(')
    )
      explicit.push('.')
    explicit.push(token)
  })

  const precedence: Record<string, number> = { '+': 1, '|': 1, '.': 2, '*': 3 }
  const output: string[] = []
  const stack: string[] = []
  explicit.forEach((token) => {
    if (isOperand(token)) output.push(token)
    else if (token === '(') stack.push(token)
    else if (token === ')') {
      while (stack.length && stack.at(-1) !== '(') output.push(stack.pop()!)
      stack.pop()
    } else if (token === '*') output.push(token)
    else {
      while (stack.length && stack.at(-1) !== '(' && precedence[stack.at(-1)!] >= precedence[token])
        output.push(stack.pop()!)
      stack.push(token)
    }
  })
  while (stack.length) output.push(stack.pop()!)

  let depth = 0
  output.forEach((token) => {
    if (isOperand(token)) depth++
    else if (token === '*') {
      if (depth < 1) throw new Error('Invalid Kleene star placement.')
    } else {
      if (depth < 2) throw new Error('An operator is missing an operand.')
      depth--
    }
  })
  if (depth !== 1) throw new Error('The expression could not be parsed.')

  return {
    source: compact,
    postfix: output,
    explicit: explicit.join(' '),
    alphabet: [...new Set(tokens.filter((token) => isOperand(token) && token !== EPSILON))].sort(),
  }
}

export function buildNFA(source: string): { nfa: Automaton; parsed: ReturnType<typeof parseRegex> } {
  const parsed = parseRegex(source)
  let id = 0
  const transitions: Transition[] = []
  type Fragment = { start: string; accept: string }
  const stack: Fragment[] = []
  const state = () => `q${id++}`

  parsed.postfix.forEach((token) => {
    if (isOperand(token)) {
      const start = state()
      const accept = state()
      transitions.push({ from: start, to: accept, symbol: token })
      stack.push({ start, accept })
    } else if (token === '.') {
      const right = stack.pop()!
      const left = stack.pop()!
      transitions.push({ from: left.accept, to: right.start, symbol: EPSILON })
      stack.push({ start: left.start, accept: right.accept })
    } else if (token === '+' || token === '|') {
      const right = stack.pop()!
      const left = stack.pop()!
      const start = state()
      const accept = state()
      transitions.push(
        { from: start, to: left.start, symbol: EPSILON },
        { from: start, to: right.start, symbol: EPSILON },
        { from: left.accept, to: accept, symbol: EPSILON },
        { from: right.accept, to: accept, symbol: EPSILON },
      )
      stack.push({ start, accept })
    } else if (token === '*') {
      const fragment = stack.pop()!
      const start = state()
      const accept = state()
      transitions.push(
        { from: start, to: fragment.start, symbol: EPSILON },
        { from: start, to: accept, symbol: EPSILON },
        { from: fragment.accept, to: fragment.start, symbol: EPSILON },
        { from: fragment.accept, to: accept, symbol: EPSILON },
      )
      stack.push({ start, accept })
    }
  })

  const result = stack.pop()!
  return {
    parsed,
    nfa: {
      states: Array.from({ length: id }, (_, index) => `q${index}`),
      alphabet: parsed.alphabet,
      transitions,
      start: result.start,
      accepts: [result.accept],
    },
  }
}

export function epsilonClosure(nfa: Automaton, initial: Iterable<string>) {
  const closure = new Set(initial)
  const work = [...closure]
  while (work.length) {
    const current = work.pop()!
    nfa.transitions
      .filter((transition) => transition.from === current && transition.symbol === EPSILON)
      .forEach((transition) => {
        if (!closure.has(transition.to)) {
          closure.add(transition.to)
          work.push(transition.to)
        }
      })
  }
  return [...closure].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
}

function move(nfa: Automaton, states: Iterable<string>, symbol: string) {
  const active = new Set(states)
  return [
    ...new Set(
      nfa.transitions
        .filter((transition) => active.has(transition.from) && transition.symbol === symbol)
        .map((transition) => transition.to),
    ),
  ]
}

const setKey = (states: string[]) => (states.length ? states.join(',') : '∅')

export function buildDFA(nfa: Automaton): Automaton {
  const startSet = epsilonClosure(nfa, [nfa.start])
  const queue: string[][] = [startSet]
  const sets = new Map<string, string[]>([[setKey(startSet), startSet]])
  const names = new Map<string, string>([[setKey(startSet), 'D0']])
  const transitions: Transition[] = []

  while (queue.length) {
    const current = queue.shift()!
    const currentKey = setKey(current)
    nfa.alphabet.forEach((symbol) => {
      const target = epsilonClosure(nfa, move(nfa, current, symbol))
      const targetKey = setKey(target)
      if (!sets.has(targetKey)) {
        sets.set(targetKey, target)
        names.set(targetKey, `D${names.size}`)
        queue.push(target)
      }
      transitions.push({ from: names.get(currentKey)!, to: names.get(targetKey)!, symbol })
    })
  }

  const subsets = Object.fromEntries([...sets].map(([key, value]) => [names.get(key)!, value]))
  return {
    states: [...names.values()],
    alphabet: nfa.alphabet,
    transitions,
    start: 'D0',
    accepts: [...names.entries()]
      .filter(([key]) => sets.get(key)!.some((state) => nfa.accepts.includes(state)))
      .map(([, name]) => name),
    subsets,
  }
}

export function simulateNFA(nfa: Automaton, input: string): Trace {
  let active = epsilonClosure(nfa, [nfa.start])
  const steps: Trace['steps'] = [{ symbol: EPSILON, from: [nfa.start], to: active }]
  for (const symbol of [...input]) {
    const from = active
    active = epsilonClosure(nfa, move(nfa, active, symbol))
    steps.push({ symbol, from, to: active })
  }
  const accepted = active.some((state) => nfa.accepts.includes(state))
  return {
    accepted,
    steps,
    finalStates: active,
    reason: accepted
      ? `The final ε-closure contains accepting state ${active.find((state) => nfa.accepts.includes(state))}.`
      : active.length
        ? 'Processing finished without an accepting state in the active set.'
        : 'No valid transition remained for the complete input.',
  }
}

export function simulateDFA(dfa: Automaton, input: string): Trace {
  let current = dfa.start
  const steps: Trace['steps'] = []
  for (const symbol of [...input]) {
    const transition = dfa.transitions.find((item) => item.from === current && item.symbol === symbol)
    const from = [current]
    current = transition?.to ?? ''
    steps.push({ symbol, from, to: current ? [current] : [] })
    if (!current) break
  }
  const accepted = Boolean(current && dfa.accepts.includes(current))
  return {
    accepted,
    steps,
    finalStates: current ? [current] : [],
    reason: accepted
      ? `${current} is an accepting DFA state.`
      : current
        ? `${current} is not an accepting DFA state.`
        : 'The DFA has no transition for the next input symbol.',
  }
}

export function minimizeDFA(dfa: Automaton) {
  let partitions = [
    dfa.accepts.filter(Boolean),
    dfa.states.filter((state) => !dfa.accepts.includes(state)),
  ].filter((group) => group.length)
  const history = [partitions.map((group) => [...group])]
  let changed = true
  while (changed) {
    changed = false
    const next: string[][] = []
    partitions.forEach((group) => {
      const buckets = new Map<string, string[]>()
      group.forEach((state) => {
        const signature = dfa.alphabet
          .map((symbol) => {
            const target = dfa.transitions.find((item) => item.from === state && item.symbol === symbol)?.to
            return partitions.findIndex((part) => target && part.includes(target))
          })
          .join(',')
        buckets.set(signature, [...(buckets.get(signature) ?? []), state])
      })
      next.push(...buckets.values())
      if (buckets.size > 1) changed = true
    })
    partitions = next
    if (changed) history.push(partitions.map((group) => [...group]))
  }

  const nameFor = (state: string) => `M${partitions.findIndex((group) => group.includes(state))}`
  const transitions: Transition[] = []
  partitions.forEach((group, index) => {
    dfa.alphabet.forEach((symbol) => {
      const target = dfa.transitions.find((item) => item.from === group[0] && item.symbol === symbol)?.to
      if (target) transitions.push({ from: `M${index}`, to: nameFor(target), symbol })
    })
  })
  return {
    automaton: {
      states: partitions.map((_, index) => `M${index}`),
      alphabet: dfa.alphabet,
      transitions,
      start: nameFor(dfa.start),
      accepts: partitions
        .map((group, index) => (group.some((state) => dfa.accepts.includes(state)) ? `M${index}` : ''))
        .filter(Boolean),
      subsets: Object.fromEntries(partitions.map((group, index) => [`M${index}`, group])),
    } satisfies Automaton,
    partitions,
    history,
  }
}

export function generateAutomata(source: string) {
  const { nfa, parsed } = buildNFA(source)
  return { nfa, dfa: buildDFA(nfa), parsed }
}
