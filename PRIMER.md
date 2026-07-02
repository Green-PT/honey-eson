# The ESO primer

ESO's readers are language models, so the text that teaches a model the format
is part of the wire contract. Use these canonical primers verbatim in the
system prompt of any agent that receives ESO; they are the exact primers the
comprehension benchmarks were run with. Version them with the format.

## Base primer (~126 tokens, o200k)

```text
Messages use ESO, a compact text format. The first line is the magic header !eso/1.
Then entries: `name=value` is a scalar (bare strings are unquoted; null, booleans,
numbers, and ambiguous or tab/newline strings use JSON). `name[N]{f1,f2}` declares
N records sharing fields f1,f2; each following line is one record with TAB-separated
cells in field order. `name[N]` is N scalar rows. `name{f1,f2}` is a single record.
Nested objects and arrays appear as JSON text inside a cell.
```

## Numbered-rows addendum (append when payloads use the reserved `n` field)

```text
When a record array's first field is `n`, it is the 1-based row number: use it to
answer any "the Nth item" question, and treat it plus the [N] count as checksums —
if the sequence or count doesn't match the rows, say the message is corrupted
instead of answering from it.
```

## Notes

- The primer is a one-time, cacheable cost. Per-message savings vs columnar
  JSON must amortize it: with prompt caching that takes ~2 record-heavy
  messages; without caching, or for scalar-heavy traffic, ESO does not pay —
  use compact or columnar JSON instead (see README decision table).
- Do not paraphrase the primer per-agent; a shared canonical text is what makes
  receiver behavior reproducible across a fleet.
