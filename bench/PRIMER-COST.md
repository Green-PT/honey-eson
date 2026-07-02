# Primer cost & ESO-vs-columnar break-even

## One-time primer cost (system prompt, cacheable)

| Format | Primer tokens |
|---|---:|
| JSON | 0 |
| columnar | 50 |
| ESO | 124 |

ESO needs **74** more primer tokens than columnar JSON (one-time, cacheable).

## Per-message savings: ESO vs columnar JSON

| Message shape | ESO tok | columnar tok | ESO saves |
|---|---:|---:|---:|
| small review | 106 | 118 | +12 |
| large review | 2040 | 2244 | +204 |
| scalar envelope | 40 | 37 | -3 |
| tool results | 733 | 787 | +54 |

Average saving **67 tok/message** (range shows it is shape-dependent — scalar envelopes can be negative).

## Break-even (how many messages before ESO nets ahead of columnar)

| Scenario | Break-even messages |
|---|---:|
| No prompt cache (primer re-sent every call) | never |
| Prompt cache at 10% read cost | 2 |
| Primer truly amortized (read ~free) | 2 |

With average 67 tok/msg saving and a 74-token extra primer:
a cached agent pipeline recovers ESO's primer in a handful of messages; a low-volume
or scalar-heavy one may never recover it. The decision is volume × message-shape.
