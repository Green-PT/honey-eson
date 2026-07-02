#!/usr/bin/env node
"use strict";
// Regenerates vectors.json from the JS reference implementation.
// Valid vectors pin canonical encoding (encode(value) === eso) and lossless
// decoding (decode(eso) deepEquals value). decode_only vectors are legal inputs
// a canonical encoder would not produce. Invalid vectors MUST be rejected.
// Values stay within plain JSON (no BigInt, no -0) so the file is language-neutral;
// arbitrary-precision integers are spec-mandated but tested per-implementation.

const fs = require("fs");
const path = require("path");
const { encode } = require("../js");

const v = (name, value, opts) => ({ name, value, eso: encode(value, opts) });

const valid = [
  v("scalar string bare", { greeting: "hello world" }),
  v("scalar types", { s: "x", i: 42, f: 3.14, neg: -2.5, t: true, fl: false, nil: null }),
  v("quoted: empty string", { s: "" }),
  v("quoted: literal lookalikes", { a: "null", b: "true", c: "false" }),
  v("quoted: number lookalikes", { a: "42", b: "1.0", c: "01", d: "-0", e: "1e3" }),
  v("quoted: whitespace and control", { a: "  padded  ", b: "a\tb", c: "a\nb" }),
  v("quoted: JSON-opening characters", { a: '"quote', b: "[bracket", c: "{brace" }),
  v("bare: grammar lookalikes are data in cells", { a: "!eso/1", b: "x[2]{y}", c: "k=v" }),
  v("unicode strings", { s: "café 🚀", back: "back\\slash" }),
  v("scalar array", { xs: [1, "two", null, true] }),
  v("empty array", { xs: [] }),
  v("record array", {
    findings: [
      { severity: "high", file: "src/auth.js", line: 42, message: "token never expires" },
      { severity: "medium", file: "src/api.js", line: 18, message: "missing rate limit" },
      { severity: "low", file: "src/ui.js", line: null, message: "true" },
    ],
  }),
  v("numbered record array (reserved n)", {
    rows: [{ n: 1, x: "a" }, { n: 2, x: "b" }, { n: 3, x: "c" }],
  }),
  v("single record", { meta: { complete: true, retry: null } }),
  v("empty object", { meta: {} }),
  v("empty records in array", { rows: [{}, {}] }),
  v("nested values as JSON cells", {
    cfg: { tags: ["security", "api"], limits: { rps: 10, burst: null } },
    rows: [{ id: 1, opts: { deep: [1, 2] } }],
  }),
  v("mixed-type array falls back to scalar rows", { xs: [{ a: 1 }, "plain", 2] }),
  v("full envelope", {
    from: "reviewer", to: "implementer", kind: "code_review", id: "review-42",
    findings: [
      { severity: "high", file: "src/auth.js", line: 42, message: "token never expires" },
      { severity: "medium", file: "src/api.js", line: 18, message: "missing rate limit" },
    ],
    meta: { complete: true, retry: null, tags: ["security", "api"] },
  }),
];

const decodeOnly = [
  { name: "CRLF line endings", value: { a: 1, rows: [{ x: "y" }] }, eso: "!eso/1\r\na=1\r\nrows[1]{x}\r\ny\r\n" },
  { name: "missing trailing newline", value: { a: 1 }, eso: "!eso/1\na=1" },
  { name: "needlessly quoted bare-safe string", value: { s: "plain" }, eso: '!eso/1\ns="plain"\n' },
];

const invalid = [
  { name: "missing header", eso: "a=1\n" },
  { name: "wrong version header", eso: "!eso/2\na=1\n" },
  { name: "truncated record array (count checksum)", eso: "!eso/1\nrows[2]{id}\n1\n" },
  { name: "extra row becomes invalid section", eso: "!eso/1\nrows[1]{id}\n1\n2\n" },
  { name: "row with wrong cell count", eso: "!eso/1\nrows[1]{a,b}\n1\n" },
  { name: "duplicate top-level name", eso: "!eso/1\na=1\na=2\n" },
  { name: "duplicate field name", eso: "!eso/1\nrow{x,x}\n1\t2\n" },
  { name: "invalid name", eso: "!eso/1\n1abc=1\n" },
  { name: "reserved n not sequential", eso: "!eso/1\nrows[2]{n,x}\n1\ta\n3\tb\n" },
  { name: "reserved n reordered", eso: "!eso/1\nrows[2]{n,x}\n2\ta\n1\tb\n" },
  { name: "malformed JSON cell", eso: '!eso/1\na={"broken\n' },
  { name: "non-finite number", eso: "!eso/1\nn=1e999\n" },
];

// the numbered vector must be reproducible via the number option too
const numbered = encode({ rows: [{ x: "a" }, { x: "b" }, { x: "c" }] }, { number: true });
if (numbered !== valid.find((x) => x.name.startsWith("numbered")).eso) {
  throw new Error("number:true output drifted from the numbered vector");
}

fs.writeFileSync(
  path.join(__dirname, "vectors.json"),
  JSON.stringify({ eso: "1", valid, decode_only: decodeOnly, invalid }, null, 2) + "\n"
);
console.log(`vectors.json: ${valid.length} valid, ${decodeOnly.length} decode-only, ${invalid.length} invalid`);
