import { useMemo, useState } from 'react'
import AutomataDiagram from './components/AutomataDiagram'
import {
  EPSILON,
  generateAutomata,
  minimizeDFA,
  simulateDFA,
  simulateNFA,
  type Automaton,
  type Trace,
} from './algorithms/automata'

const examples = [
  { regex: 'a*b', title: 'Zero or more a’s, then b', alphabet: 'a, b', accepted: ['b', 'ab', 'aaab'], rejected: ['a', 'ba'] },
  { regex: '(a+b)*', title: 'Any string over a and b', alphabet: 'a, b', accepted: ['ε', 'a', 'abba'], rejected: ['c', 'abc'] },
  { regex: '(a+b)*abb', title: 'Strings ending in abb', alphabet: 'a, b', accepted: ['abb', 'aabb', 'babb'], rejected: ['ab', 'abba'] },
  { regex: 'a(b+c)', title: 'a followed by b or c', alphabet: 'a, b, c', accepted: ['ab', 'ac'], rejected: ['a', 'bc'] },
  { regex: '(ab)*', title: 'Repeated ab pairs', alphabet: 'a, b', accepted: ['ε', 'ab', 'abab'], rejected: ['a', 'abb'] },
  { regex: 'a+b', title: 'Either a or b', alphabet: 'a, b', accepted: ['a', 'b'], rejected: ['ab', 'ε'] },
  { regex: '(a+b)(a+b)', title: 'Exactly two symbols', alphabet: 'a, b', accepted: ['aa', 'ab', 'ba'], rejected: ['a', 'aba'] },
]

const learning = [
  ['Regular Expression', 'A compact pattern describing a language.', 'a*b', 'Search and validation'],
  ['Finite Automata', 'A machine that changes state for each input symbol.', 'q0 —a→ q1', 'Protocol modelling'],
  ['NFA', 'May follow many paths for one symbol.', 'δ(q,a) = {q1,q2}', 'Simple construction'],
  ['DFA', 'Has one defined path for each state and symbol.', 'δ(q,a) = q1', 'Fast matching'],
  ['Epsilon Transition', 'Moves between states without reading input.', 'q0 —ε→ q1', 'Joining fragments'],
  ['Epsilon Closure', 'All states reachable using only ε moves.', 'ε-close({q0})', 'Subset conversion'],
  ['Thompson Construction', 'Builds small NFA fragments and combines them.', 'Regex → NFA', 'Regex engines'],
  ['Subset Construction', 'Treats each NFA state set as one DFA state.', '{q0,q1} → D0', 'NFA to DFA'],
  ['DFA Minimization', 'Merges states with indistinguishable futures.', 'D1 ≡ D3', 'Efficient scanners'],
]

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    play: <><path d="m7 4 11 8-11 8Z" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    spark: <><path d="m12 3 1.3 4.3L17 9l-3.7 1.7L12 15l-1.3-4.3L7 9l3.7-1.7Z" /><path d="m5 15 .7 2.3L8 18l-2.3.7L5 21l-.7-2.3L2 18l2.3-.7Z" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    code: <><path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14" /></>,
    table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" /></>,
    flask: <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 15h8" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function Logo() {
  return (
    <a className="logo" href="#home" aria-label="RegexLab home">
      <svg viewBox="0 0 42 42" aria-hidden="true"><path d="M11 21h20M16 12l10 18" /><circle cx="10" cy="21" r="5" /><circle cx="18" cy="11" r="5" /><circle cx="27" cy="31" r="5" /><circle cx="33" cy="21" r="5" /></svg>
      <span>Regex<span>Lab</span></span>
    </a>
  )
}

function SectionTitle({ eyebrow, title, copy }: { eyebrow: string; title: string; copy?: string }) {
  return <div className="section-title"><span>{eyebrow}</span><h2>{title}</h2>{copy && <p>{copy}</p>}</div>
}

function TransitionTable({ automaton, type }: { automaton: Automaton; type: 'NFA' | 'DFA' }) {
  const columns = type === 'NFA' ? [...automaton.alphabet, EPSILON] : automaton.alphabet
  const value = (state: string, symbol: string) => {
    const targets = automaton.transitions.filter((item) => item.from === state && item.symbol === symbol).map((item) => item.to)
    return targets.length ? (type === 'NFA' ? `{${targets.join(', ')}}` : targets[0]) : '—'
  }
  return (
    <div className="table-card">
      <div className="table-heading"><div><span className="type-badge">{type}</span><h3>{type} transition table</h3></div><span>{automaton.states.length} states</span></div>
      <div className="table-scroll"><table><thead><tr><th>State</th>{columns.map((symbol) => <th key={symbol}>Input {symbol}</th>)}<th>Final</th></tr></thead>
        <tbody>{automaton.states.map((state) => <tr key={state}><td><strong>{state === automaton.start ? '→ ' : ''}{state}</strong></td>{columns.map((symbol) => <td key={symbol}>{value(state, symbol)}</td>)}<td>{automaton.accepts.includes(state) ? <span className="yes">Yes</span> : 'No'}</td></tr>)}</tbody>
      </table></div>
    </div>
  )
}

export default function App() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [twilight, setTwilight] = useState(false)
  const [regex, setRegex] = useState('(a+b)*abb')
  const [data, setData] = useState<ReturnType<typeof generateAutomata> | null>(() => generateAutomata('(a+b)*abb'))
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'NFA' | 'DFA' | 'Compare'>('NFA')
  const [step, setStep] = useState(0)
  const [testInput, setTestInput] = useState('')
  const [traces, setTraces] = useState<{ nfa: Trace; dfa: Trace } | null>(null)
  const [minimized, setMinimized] = useState<ReturnType<typeof minimizeDFA> | null>(null)

  const generate = (target: 'NFA' | 'DFA' | 'both' = 'both') => {
    try {
      const next = generateAutomata(regex)
      setData(next)
      setError('')
      setTraces(null)
      setMinimized(null)
      setStep(0)
      setTab(target === 'DFA' ? 'DFA' : target === 'both' ? 'Compare' : 'NFA')
    } catch (reason) {
      setData(null)
      setError(reason instanceof Error ? reason.message : 'Unable to parse this expression.')
    }
  }
  const updateRegex = (value: string) => {
    setRegex(value)
    setData(null)
    setTraces(null)
    setMinimized(null)
    setError('')
  }
  const chooseExample = (value: string, jump = false) => {
    updateRegex(value)
    if (jump) setTimeout(() => document.querySelector('#studio')?.scrollIntoView({ behavior: 'smooth' }), 0)
  }
  const runTest = () => {
    if (!data) return
    setTraces({ nfa: simulateNFA(data.nfa, testInput === EPSILON ? '' : testInput), dfa: simulateDFA(data.dfa, testInput === EPSILON ? '' : testInput) })
  }
  const journey = useMemo(() => {
    if (!data) return []
    const startClosure = data.dfa.subsets?.[data.dfa.start] ?? []
    return [
      { title: 'Regular Expression Parsing', copy: `Operator precedence is applied and implicit concatenation is made explicit.`, detail: `Infix: ${data.parsed.explicit}\nPostfix: ${data.parsed.postfix.join(' ')}` },
      { title: 'Thompson’s Construction', copy: 'Each token creates or joins an NFA fragment with epsilon transitions.', detail: `${data.nfa.states.length} NFA states · ${data.nfa.transitions.length} transitions\nStart ${data.nfa.start} · Accept ${data.nfa.accepts.join(', ')}` },
      { title: 'Epsilon Closure', copy: 'The DFA begins with every NFA state reachable without consuming input.', detail: `ε-closure({${data.nfa.start}}) = {${startClosure.join(', ')}}` },
      { title: 'Subset Construction', copy: 'For every alphabet symbol, move from the current set and take epsilon closure again.', detail: Object.entries(data.dfa.subsets ?? {}).map(([key, set]) => `${key} = {${set.join(', ') || '∅'}}`).join('\n') },
      { title: 'DFA Generation', copy: 'Each discovered NFA state set becomes one deterministic state.', detail: `${data.dfa.states.length} DFA states · ${data.dfa.transitions.length} deterministic transitions` },
      { title: 'Final Automata', copy: 'The NFA and DFA are complete and recognize exactly the same language.', detail: `Alphabet: {${data.parsed.alphabet.join(', ')}}\nAccepting DFA states: ${data.dfa.accepts.join(', ')}` },
    ]
  }, [data])

  return (
    <div className={`app ${twilight ? 'twilight' : ''}`}>
      <header className="navbar">
        <Logo />
        <nav className={mobileOpen ? 'open' : ''}>
          {['Home', 'Automata Studio', 'Learn', 'Examples', 'About Project'].map((item) => <a key={item} href={`#${item.toLowerCase().replaceAll(' ', '-')}`} onClick={() => setMobileOpen(false)}>{item}</a>)}
        </nav>
        <div className="nav-actions"><button className="icon-button" aria-label={twilight ? 'Use deep navy theme' : 'Use twilight theme'} aria-pressed={twilight} onClick={() => setTwilight(!twilight)}><Icon name="sun" /></button><button className="menu-button" aria-label="Toggle navigation" onClick={() => setMobileOpen(!mobileOpen)}><Icon name={mobileOpen ? 'close' : 'menu'} /></button></div>
      </header>

      <main>
        <section className="hero" id="home">
          <div className="hero-orb one" /><div className="hero-orb two" />
          <div className="hero-copy">
            <div className="eyebrow"><Icon name="spark" size={15} /> Theory of computation, made visual</div>
            <h1>From Regex to <span>Automata.</span></h1>
            <p>Explore regular expressions, visualize NFA and DFA, and understand how finite automata process strings.</p>
            <div className="hero-actions"><a className="primary-button" href="#automata-studio">Start Exploring <Icon name="arrow" /></a><a className="secondary-button" href="#examples">View Examples</a></div>
            <div className="feature-line"><span>Learn.</span><i /><span>Visualize.</span><i /><span>Test.</span></div>
          </div>
          <div className="hero-visual">
            <div className="visual-top"><span><i /> LIVE AUTOMATA</span><strong>Regex → DFA</strong></div>
            <svg viewBox="0 0 560 330" aria-label="Automata illustration">
              <defs><linearGradient id="heroLine" x1="0" x2="1"><stop stopColor="#8B5CF6" /><stop offset="1" stopColor="#06B6D4" /></linearGradient><marker id="heroArrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0 9 4.5 0 9Z" fill="#06B6D4" /></marker></defs>
              <path className="hero-path" d="M45 170 C110 80 165 80 220 155 S340 240 405 150 500 95 520 165" markerEnd="url(#heroArrow)" />
              <path className="hero-path faint" d="M220 155 C265 50 375 55 405 150" markerEnd="url(#heroArrow)" />
              {[['q0', 70, 160], ['q1', 220, 155], ['q2', 405, 150], ['q3', 500, 245]].map(([label, x, y], i) => <g className={`hero-node n${i}`} key={label as string}><circle cx={x as number} cy={y as number} r="35" /><text x={x as number} y={(y as number) + 5}>{label}</text>{i === 2 && <circle cx={x as number} cy={y as number} r="28" className="inner" />}</g>)}
              <text x="140" y="98" className="hero-edge-label">a</text><text x="320" y="88" className="hero-edge-label">ε</text><text x="470" y="170" className="hero-edge-label">b</text>
            </svg>
            <div className="visual-status"><span><Icon name="check" size={15} /> Construction complete</span><span>4 states · 5 transitions</span></div>
          </div>
        </section>

        <section className="studio section" id="automata-studio">
          <SectionTitle eyebrow="AUTOMATA STUDIO" title="Build. Convert. Understand." copy="Enter an expression and inspect every state produced by real automata algorithms." />
          <div className="studio-grid">
            <aside className="control-card">
              <div className="card-kicker"><span><Icon name="code" /></span><div><h3>Regular Expression</h3><p>Define the language to visualize</p></div></div>
              <label htmlFor="regex">Expression</label>
              <div className={`input-wrap ${error ? 'invalid' : ''}`}><input id="regex" value={regex} onChange={(event) => updateRegex(event.target.value)} placeholder="e.g. (a+b)*abb" /><span>REGEX</span></div>
              {error ? <p className="error-message">{error}</p> : <p className="helper">Supports union (+ or |), concatenation, Kleene star (*), parentheses, and ε.</p>}
              <label htmlFor="example">Quick example</label>
              <select id="example" value="" onChange={(event) => event.target.value && chooseExample(event.target.value)}><option value="">Choose an expression…</option>{examples.map((example) => <option key={example.regex} value={example.regex}>{example.regex} — {example.title}</option>)}</select>
              <div className="button-grid"><button className="primary-button" onClick={() => generate('both')}><Icon name="spark" /> Generate Both</button><button className="secondary-button small" onClick={() => generate('NFA')}>Generate NFA</button><button className="secondary-button small" onClick={() => generate('DFA')}>Generate DFA</button></div>
              <button className="clear-button" onClick={() => { updateRegex(''); setTestInput('') }}><Icon name="trash" size={16} /> Clear workspace</button>
              {data && <div className="detected"><span>Detected alphabet</span><div>{data.parsed.alphabet.length ? data.parsed.alphabet.map((symbol) => <b key={symbol}>{symbol}</b>) : <b>{EPSILON}</b>}</div></div>}
            </aside>

            <div className="visualizer-card">
              <div className="tabs">{(['NFA', 'DFA', 'Compare'] as const).map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item === 'Compare' ? 'NFA vs DFA' : item}</button>)}</div>
              {data ? tab === 'Compare' ? <div className="compare-diagrams"><div className="comparison-pane"><div className="comparison-pane-head"><div><span className="type-badge">NFA</span><strong>Nondeterministic automaton</strong></div><small>{data.nfa.states.length} states · {data.nfa.transitions.length} transitions</small></div><AutomataDiagram automaton={data.nfa} compact /></div><div className="comparison-pane"><div className="comparison-pane-head"><div><span className="type-badge cyan">DFA</span><strong>Deterministic automaton</strong></div><small>{data.dfa.states.length} states · {data.dfa.transitions.length} transitions</small></div><AutomataDiagram automaton={data.dfa} compact /></div></div> : <AutomataDiagram automaton={tab === 'NFA' ? data.nfa : data.dfa} activeStates={traces ? (tab === 'NFA' ? traces.nfa.finalStates : traces.dfa.finalStates) : []} /> : <div className="empty-state"><span><Icon name="flask" size={30} /></span><h3>Ready to construct</h3><p>Enter a valid expression, then generate an automaton.</p></div>}
            </div>
          </div>
        </section>

        {data && <section className="journey section">
          <SectionTitle eyebrow="CONVERSION JOURNEY" title="Follow the algorithm, step by step." copy="Every value below comes from the currently generated expression." />
          <div className="journey-card">
            <div className="step-rail">{journey.map((item, index) => <button key={item.title} className={index === step ? 'active' : index < step ? 'done' : ''} onClick={() => setStep(index)}><span>{index < step ? '✓' : index + 1}</span><small>{item.title}</small></button>)}</div>
            <div className="step-content"><div className="step-number">STEP {step + 1} OF {journey.length}</div><h3>{journey[step].title}</h3><p>{journey[step].copy}</p><pre>{journey[step].detail}</pre><div className="step-nav"><button disabled={step === 0} onClick={() => setStep(step - 1)}>Previous step</button><button disabled={step === journey.length - 1} onClick={() => setStep(step + 1)}>Next step <Icon name="arrow" size={16} /></button></div></div>
          </div>
        </section>}

        {data && <section className="testing section">
          <div className="test-card">
            <div className="test-copy"><span className="icon-tile"><Icon name="play" /></span><h2>Test Your String</h2><p>Run input through the actual NFA and DFA, then compare their processing traces.</p><div className="test-input"><input value={testInput} onChange={(event) => { setTestInput(event.target.value); setTraces(null) }} placeholder={`Enter a string or ${EPSILON}`} /><button className="primary-button" onClick={runTest}>Run test <Icon name="play" size={15} /></button><button className="icon-button" aria-label="Clear test" onClick={() => { setTestInput(''); setTraces(null) }}><Icon name="trash" /></button></div><small>Use ε or leave empty to test the empty string.</small></div>
            {traces ? <div className={`result-panel ${traces.dfa.accepted ? 'accepted' : 'rejected'}`}><div className="result-head"><span><Icon name={traces.dfa.accepted ? 'check' : 'close'} size={22} /></span><div><small>RESULT</small><h3>{traces.dfa.accepted ? 'Accepted' : 'Rejected'}</h3></div></div><p>{traces.dfa.reason}</p><div className="trace-title"><span>NFA trace</span><span>Final: {traces.nfa.finalStates.join(', ') || '∅'}</span></div><div className="trace">{traces.nfa.steps.map((item, index) => <span key={index}>{`{${item.from.join(',')}}`} <b>—{item.symbol}→</b> {`{${item.to.join(',') || '∅'}}`}</span>)}</div><div className="agreement"><Icon name="check" size={15} /> NFA and DFA results agree</div></div> : <div className="result-placeholder"><div className="pulse-ring"><Icon name="play" /></div><h3>Awaiting input</h3><p>Your processing trace will appear here.</p></div>}
          </div>
        </section>}

        {data && <section className="comparison section">
          <SectionTitle eyebrow="COMPARE MODELS" title="NFA vs DFA" copy="Different structures. The exact same recognized language." />
          <div className="metric-grid"><div><span>NFA states</span><strong>{data.nfa.states.length}</strong><small>{data.nfa.transitions.length} transitions</small></div><div><span>DFA states</span><strong>{data.dfa.states.length}</strong><small>{data.dfa.transitions.length} transitions</small></div><div><span>Alphabet</span><strong>{`{ ${data.parsed.alphabet.join(', ')} }`}</strong><small>{data.parsed.alphabet.length} symbols detected</small></div><div><span>Accepting states</span><strong>{data.nfa.accepts.length} / {data.dfa.accepts.length}</strong><small>NFA / DFA</small></div></div>
          <div className="compare-copy"><div><span className="type-badge">NFA</span><h3>Multiple possibilities</h3><p>An NFA can branch to multiple states for a symbol and travel through epsilon transitions without consuming input.</p></div><div className="equivalent"><span>≡</span><strong>Language equivalent</strong><small>Both accept exactly the same strings</small></div><div><span className="type-badge cyan">DFA</span><h3>One precise path</h3><p>A complete DFA has exactly one transition for each state and alphabet symbol, making execution deterministic.</p></div></div>
        </section>}

        {data && <section className="tables section">
          <SectionTitle eyebrow="TRANSITION DATA" title="Inspect every state change." copy="Start states use an arrow; accepting states are clearly identified." />
          <div className="tables-grid"><TransitionTable automaton={data.nfa} type="NFA" /><TransitionTable automaton={data.dfa} type="DFA" /></div>
        </section>}

        {data && <section className="minimize section">
          <div className="minimize-head"><div><span className="eyebrow"><Icon name="spark" size={15} /> ADVANCED</span><h2>Minimize DFA</h2><p>Partition refinement merges states that no input string can distinguish.</p></div><button className="primary-button" onClick={() => setMinimized(minimizeDFA(data.dfa))}>{minimized ? 'Recalculate' : 'Run minimization'} <Icon name="arrow" /></button></div>
          {minimized ? <div className="minimize-result"><div className="partition-panel"><h3>Partition refinement</h3>{minimized.history.map((partition, index) => <div key={index}><span>P{index}</span><code>{partition.map((group) => `{${group.join(', ')}}`).join('  ')}</code></div>)}<div className="savings"><span>Before <b>{data.dfa.states.length}</b></span><Icon name="arrow" /><span>After <b>{minimized.automaton.states.length}</b></span></div></div><AutomataDiagram automaton={minimized.automaton} compact /></div> : <div className="minimize-empty"><span>Equivalent states will be grouped and the resulting minimized machine will appear here.</span></div>}
        </section>}

        <section className="learn section" id="learn">
          <SectionTitle eyebrow="UNDERSTAND AUTOMATA" title="The ideas behind the machine." copy="Simple explanations for the concepts you need in class, your project demo, and viva." />
          <div className="learning-grid">{learning.map(([title, copy, example, use], index) => <article key={title}><div className="learn-index">{String(index + 1).padStart(2, '0')}</div><h3>{title}</h3><p>{copy}</p><code>{example}</code><small>Used for · {use}</small></article>)}</div>
          <div className="uses"><div><span className="eyebrow">IN THE REAL WORLD</span><h2>Where automata are used</h2></div>{['Compiler design', 'Lexical analysis', 'Pattern matching', 'Text processing', 'Input validation'].map((item) => <span key={item}><Icon name="check" size={15} /> {item}</span>)}</div>
        </section>

        <section className="examples section" id="examples">
          <SectionTitle eyebrow="EXAMPLE LIBRARY" title="Start with a proven pattern." copy="Choose a language, send it to the studio, and construct its real automata." />
          <div className="example-grid">{examples.map((example) => <article key={example.regex}><div className="example-top"><code>{example.regex}</code><span>{`Σ = {${example.alphabet}}`}</span></div><h3>{example.title}</h3><div className="sample-row"><span><b>Accept</b>{example.accepted.join(' · ')}</span><span><b>Reject</b>{example.rejected.join(' · ')}</span></div><button onClick={() => chooseExample(example.regex, true)}>Use example <Icon name="arrow" size={16} /></button></article>)}</div>
        </section>

        <section className="about section" id="about-project">
          <div className="about-card"><div className="about-main"><span className="eyebrow">ABOUT THE PROJECT</span><h2>RegexLab</h2><h3>Regular Expression to NFA/DFA Converter</h3><p>A Theory of Computation project that implements and visualizes regular expressions as finite automata, making each algorithm inspectable and testable.</p><div className="tech"><span>React</span><span>Vite</span><span>TypeScript</span><span>SVG</span><span>Tailwind CSS</span></div></div><div className="architecture"><h3>Project architecture</h3>{['User Input', 'Regex Parser', 'NFA Generator', 'DFA Converter', 'Automata Visualizer', 'String Testing'].map((item, index, all) => <div key={item}><span>{index + 1}</span><strong>{item}</strong>{index < all.length - 1 && <i>↓</i>}</div>)}</div></div>
        </section>
      </main>
      <footer><Logo /><p>Built for Theory of Computation · Real algorithms, visual learning.</p><a href="#home">Back to top ↑</a></footer>
    </div>
  )
}
