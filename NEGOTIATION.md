# Wire negotiation, version 1

How two agents agree on a payload encoding, on any transport. Modeled on
HTTP content negotiation: capability advertisement, self-identifying
payloads, mandatory fallback. No new transport, no handshake round-trip.

## Capability tokens

- `eso/1` — ESO per SPEC.md (wire header `!eso/1`)
- `columnar` — columnar JSON: uniform record arrays as `{"#c":[cols],"#r":[[row],…]}`
- `json` — compact JSON (the universal floor; every agent implicitly accepts it)

## Advertising

Put the accepted tokens wherever the pipe already carries metadata:

- **Agent card / manifest / tool description**: `"wire": {"accept": ["eso/1", "columnar", "json"]}`
- **Prompt-driven subagents** (no structured metadata): one dispatch line —

  ```text
  Return structured results as ESO (wire format !eso/1) per the primer below.
  ```

  followed by the canonical [PRIMER.md](PRIMER.md) base primer (plus the
  numbered-rows addendum if payloads use the reserved `n`). Send the primer
  once per session, not per message — it is cacheable.

## Choosing (sender)

Pick the densest advertised token you can produce: `eso/1` > `columnar` >
`json`. **Capability unknown or unparseable → compact JSON** (Profile W8).
Irreversible instructions always go as schema-validated JSON regardless of
negotiation (Profile W6).

## Detecting (receiver)

Payloads self-identify; no envelope needed:

1. starts with `!eso/1` (first line) → ESO; decode per SPEC.md. Decode
   failure — including a `[count]`/`n` checksum mismatch — means the message
   is corrupt: reject or request resend, never answer from it (Profile W4).
2. parses as JSON → JSON. Objects shaped `{"#c":[…],"#r":[…]}` (both keys,
   `#c` all strings, `#r` rows matching `#c`'s length) are columnar record
   arrays; rebuild records by zipping.
3. neither → not a wire payload; treat as prose.

## Versioning

`eso/1` names both the capability token and the wire header. An incompatible
ESO revision ships as `eso/2` + `!eso/2`; receivers reject unknown headers
(SPEC.md §8), which the fallback rule turns into a clean downgrade to JSON
rather than a silent misparse.
