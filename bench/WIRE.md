# Wire-layer bench (live, end-to-end)

sender/receiver: `claude-opus-4-8` / `claude-opus-4-8` · runs: 3 · payload: 25 uniform records · no judge

| Variant | Wire tok | vs unprompted | Sender out tok | Valid ESO | Recovery | Positional |
|---------|---------:|--------------:|---------------:|----------:|---------:|-----------:|
| unprompted | 696 | +0% | 1087 | — | 100% | 100% |
| json | 696 | 0% | 1087 | — | 100% | 100% |
| eso | 532 | -24% | 749 | 100% | 100% | 100% |

- **Wire tok** — o200k tokens of the handoff the sender actually produced.
- **Valid ESO** — decodes per SPEC.md and passes `eso lint` with no MUST violations
  (checks that the canonical primer alone is enough to *produce* the format).
- **Recovery** — receiver accuracy on key-lookup, positional, filtered-field, and absence
  queries answered from the handoff alone.
- **Positional** — the "12th result" query in isolation: the reserved `n` field's job.

Caveats: the sender is fed minified JSON, so the unprompted baseline tends to echo
compact JSON — the +55% pretty-print waste is measured deterministically in
FORMATS.md, not here. At 25 records the recovery queries saturate for every
variant; the positional-access gap appears at ~50 records (see the honey
comprehension suite). What this bench uniquely shows: the canonical primer +
one dispatch line is sufficient for a model to PRODUCE spec-valid ESO.
