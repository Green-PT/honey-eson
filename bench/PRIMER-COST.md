# Primer cost & ESON-vs-columnar break-even

## One-time primer cost (system prompt, cacheable)

| Format | Primer tokens |
|---|---:|
| JSON | 0 |
| columnar | 50 |
| ESON | 125 |

ESON needs **75** more primer tokens than columnar JSON (one-time, cacheable).

## Per-message savings: ESON vs columnar JSON

| Message shape | ESON tok | columnar tok | ESON saves |
|---|---:|---:|---:|
| small review | 106 | 118 | +12 |
| large review | 2040 | 2244 | +204 |
| scalar envelope | 40 | 37 | -3 |
| tool results | 733 | 787 | +54 |

Average saving **67 tok/message** (range shows it is shape-dependent — scalar envelopes can be negative).

## Break-even (how many messages before ESON nets ahead of columnar)

| Scenario | Break-even messages |
|---|---:|
| No prompt cache (primer re-sent every call) | never |
| Prompt cache at 10% read cost | 2 |
| Primer truly amortized (read ~free) | 2 |

With average 67 tok/msg saving and a 75-token extra primer:
a cached agent pipeline recovers ESON's primer in a handful of messages; a low-volume
or scalar-heavy one may never recover it. The decision is volume × message-shape.
