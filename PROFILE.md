# The Honey Wire Profile, version 1

A compliance profile for agent-to-agent message pipes — any transport (MCP,
A2A, subagent dispatch, a queue). It does not define transport, auth, or
discovery; it defines what the *payloads* and the *reading discipline* must
look like for the pipe to be token-efficient without losing information.
Every rule is backed by a measurement in [bench/](bench/) or the
[honey comprehension suite](https://github.com/Green-PT/honey-for-devs/tree/main/bench/eso).

The key words MUST, SHOULD, and MAY are per RFC 2119. Rules are numbered for
tooling; `eson lint` checks the statically checkable ones per message
(W1, W4, W5, W6) — the rest are conversation-level and are verified by
behavior benches, not by linting a single message.

## Rules

- **W1 — MUST minify.** No pretty-printed JSON between agents. Indentation is
  +55% tokens for a reader that does not need it (bench/FORMATS.md).
- **W2 — MUST address records by stable key, never by ordinal** — or ship the
  reserved `n` field (SPEC.md §5). Un-numbered positional access scores 0–17%
  in every format, frontier models included.
- **W3 — MUST aggregate in code.** Never ask a model to count or filter-count
  rows; it scores ~0% in every format. Compute the number, send the number.
- **W4 — MUST verify checksums on read.** Treat `[count]` (and `n` when
  present) as integrity checks; on mismatch, reject or request resend — never
  answer from a payload that failed them. A dense misparse is silent; the
  reader confabulates.
- **W5 — SHOULD use a key-deduplicating encoding for uniform record arrays**
  (3+ records): columnar JSON (−22%) when the pipe must stay valid JSON, ESON
  (−28%) when both ends are yours and the primer amortizes (see
  bench/PRIMER-COST.md for the break-even).
- **W6 — MUST keep irreversible instructions in schema-validated JSON.**
  Auth, money, migrations, deletes, revocations: explicit JSON validated
  against an application schema — never ESON, never columnar. Compactness is
  not worth an ambiguous high-impact action.
- **W7 — MUST use the canonical primer** ([PRIMER.md](PRIMER.md)) verbatim
  when a model will read ESON. A paraphrased primer makes receiver behavior
  unreproducible across a fleet.
- **W8 — MUST fall back to compact JSON when the receiver's capability is
  unknown** (see [NEGOTIATION.md](NEGOTIATION.md)). Adoption must never be a
  compatibility bet.

## Checking compliance

```bash
node bin/eson.js lint < message        # W1, W4, W5, W6 on one payload
```

Exit 0 = no MUST violations (SHOULDs report as suggestions). W2/W3/W8 are
properties of the sender's behavior across a conversation; test them with a
relay-style bench (encode → neutral receiver answers ground-truth queries),
as in the honey suite.

## Conformance statement

A pipe conforms to Honey Wire v1 iff: every message passes `lint` with no
MUST violations, ESON payloads decode against SPEC.md v1.1, the primer (when
used) is byte-identical to PRIMER.md, and the sender falls back per W8.
