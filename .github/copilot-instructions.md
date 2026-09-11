## Design Context

### Users

Primary user is protocol operator running Hatch locally to inspect live Sui arbitrage signals. Core job: start or refresh read-only scans, judge quote quality and net profitability quickly, inspect route/provider evidence, and spot upstream failures without reading raw JSONL. Interface must clearly separate observation from future transaction execution.

### Brand Personality

TortoiseOS should feel deliberate, trustworthy, and technically sharp. Voice is concise and operational. Product identity uses turtle mark plus established teal (`#02AAB0`), cyan (`#00CDAC`), seafoam, and deep-teal palette. Calm confidence matters more than speculative trading hype.

### Aesthetic Direction

Use `eth-flashloan` information architecture as reference: overview home plus dedicated scanner page. Translate it into TortoiseOS visual language and Sui terminology rather than copying Ethereum controls. Support light and dark themes with system preference as default and visible toggle. Prefer clean operator-console density: strong hierarchy, compact metrics, readable tables, monospaced atomic values, restrained gradients, and purposeful status color. Avoid casino styling, excessive glow, emoji-heavy cards, fake profitability, and execution affordances while scanner remains read-only.

### Design Principles

1. Surface decision evidence: net profit, gas reserve, quote age, provider, venues, pools, and overlap risk stay easy to scan.
2. Make safety state unmistakable: persistent `READ ONLY` status; no wallet, signing, PTB, or execute controls.
3. Preserve TortoiseOS continuity: teal/cyan brand system, turtle identity, consistent light/dark tokens.
4. Optimize for operator speed: overview for health and latest result; scanner page for controls, candidates, routes, failures, and history.
5. Show uncertainty honestly: distinguish profitable quote signals from executable guarantees and explain partial provider failure.
6. Meet WCAG AA contrast, keyboard access, visible focus, color-independent status cues, and reduced-motion preferences.
