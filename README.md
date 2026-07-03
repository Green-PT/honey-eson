# Honey ESON — Efficient Structured Object Notation

A compact, lossless wire encoding for **agent-to-agent structured payloads**.
Line-oriented UTF-8, schema-once record arrays, counts that double as
checksums, and a spec'd row-number field that fixes the one thing every text
format fails at: a model addressing "the Nth row".

```eson
!eson/1
from=reviewer
to=implementer
kind=code_review
findings[2]{n,severity,file,line,message}
1	high	src/auth.js	42	token never expires
2	medium	src/api.js	18	missing rate limit
meta{complete,retry}
true	null
```

ESON is a **payload encoding, not a protocol** — it rides inside whatever
transport your agents already use (an orchestrator's tool results, A2A/MCP
messages, a queue). Its readers are language models and programs, so the repo
ships the two things both need: conformance vectors for parsers and a
[canonical primer](PRIMER.md) for models.

For end-to-end pipes, two thin layers ride on top — think `Content-Encoding`,
not a new HTTP: the **[Honey Wire Profile](PROFILE.md)** (eight testable rules
for token-efficient, integrity-checked agent messages; `eson lint` checks the
per-message ones) and **[wire negotiation](NEGOTIATION.md)** (capability
tokens, self-identifying payloads, mandatory compact-JSON fallback — adoption
is never a compatibility bet).

## Why (measured, not vibes)

Token cost on realistic handoff documents (o200k tokenizer, `npm run bench:formats`):

| Format | Valid JSON? | vs compact JSON |
|---|:--:|---:|
| JSON (pretty) | yes | **+55%** ← what models emit unprompted |
| JSON (compact) | yes | 0% |
| TOON | no | −20% |
| JSON (columnar) | yes | −22% |
| **ESON** | no | **−28%** |

Model comprehension (Claude + GPT, small and frontier): **ties at 100%** across
formats for every realistic access pattern — key lookup, field match, nested
extraction. The only failures are format-independent model limits: positional
access and filtered counting. ESON addresses the first in-spec (the reserved
`n` field, §5 — 0–17% → 100% for ~+6–9% tokens) and forbids relying on the
second (aggregate in code, never in the model).

## When to use what — honest decision table

| Your pipe | Use |
|---|---|
| Low volume, no prompt caching, or scalar-heavy envelopes | **compact JSON** — ESON's ~126-token primer never amortizes |
| Must stay valid JSON (stdlib-only readers, strict tooling) | **columnar JSON** (−22%): keys once — `{"#c":[cols],"#r":[rows]}` |
| High-volume, cached, record-array-heavy, both ends yours | **ESON** (−28%, −35% on record arrays) |
| Models may address rows positionally ("the 3rd finding") | add the **`n` field** (any format; spec'd + checksum-verified in ESON) |
| Auth, money, migrations, deletes, anything irreversible | **schema-validated JSON** — never a compact format |

Break-even vs columnar JSON: ~2 record-heavy messages with prompt caching;
never without caching; never for scalar-heavy traffic (`npm run bench:primer`).
If you take one thing from this table: stop emitting pretty-printed JSON
between agents (+55% for nothing).

## Use it

```bash
npm install          # dev deps are only for the benchmarks
npm test             # JS + Python suites + shared conformance vectors

echo '{"findings":[{"sev":"high","msg":"no auth"}]}' | node bin/eson.js encode --number
node bin/eson.js decode < doc.eson
node bin/eson.js lint < message.json   # Honey Wire Profile: W1/W4/W5/W6, exit 1 on MUST violation
```

```js
const { encode, decode, tryDecode } = require("eson-format");
const wire = encode({ findings }, { number: true });
const { ok, value } = tryDecode(wire); // non-throwing, for message routers
```

```python
import eson
wire = eson.encode({"findings": findings}, number=True)
data = eson.decode(wire)   # raises eson.ESONError on malformed input
```

Both implementations are dependency-free single files
([js/index.js](js/index.js), [py/eson.py](py/eson.py)) — vendoring is fine.

## Repo layout

- [SPEC.md](SPEC.md) — normative spec, v1.1 (`!eson/1` wire format)
- [PROFILE.md](PROFILE.md) — the Honey Wire Profile: rules W1–W8 for any agent pipe
- [NEGOTIATION.md](NEGOTIATION.md) — encoding negotiation and fallback
- [PRIMER.md](PRIMER.md) — canonical model primer; part of the wire contract
- [vectors/vectors.json](vectors/vectors.json) — conformance vectors; an
  implementation conforms iff it passes them (`vectors/generate.js` regenerates)
- [js/](js/), [py/](py/) — reference implementations + tests
- [bench/](bench/) — deterministic token benchmarks with committed results:
  [FORMATS.md](bench/FORMATS.md) (`npm run bench:formats`),
  [PRIMER-COST.md](bench/PRIMER-COST.md) (`npm run bench:primer`), and the
  live end-to-end [WIRE.md](bench/WIRE.md) (`node bench/wire.mjs`, needs
  `ANTHROPIC_API_KEY`: primer + dispatch line → 100% valid ESON, −24% wire
  tokens at 100% recovery); the
  model-comprehension methodology lives in the
  [honey benchmark suite](https://github.com/Green-PT/honey-for-devs/tree/main/bench/eso)

## Provenance

Extracted from [Honey](https://github.com/Green-PT/honey-for-devs), where ESON
is the Lever-3 (agent-to-agent) format, validated against JSON/columnar/TOON on
token efficiency and model comprehension across Claude and GPT model families.

MIT © Green-PT
