"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { lint } = require("./lint");
const { encode } = require(".");

const rules = (text) => lint(text).findings.map((f) => f.rule).sort();
const errors = (text) => lint(text).findings.filter((f) => f.level === "error");

test("clean payloads pass", () => {
  assert.deepEqual(rules(JSON.stringify({ from: "a", findings: [{ id: 1 }] })), []);
  assert.deepEqual(rules(encode({ findings: [{ id: 1, sev: "high" }, { id: 2, sev: "low" }] })), []);
  // carve-outs as plain JSON are the required form, not a violation
  assert.deepEqual(rules(JSON.stringify({ auth: { user: "x" }, delete: ["a"] })), []);
});

test("W1: pretty-printed JSON is an error", () => {
  const pretty = JSON.stringify({ a: 1, rows: [{ x: 1 }] }, null, 2);
  assert.deepEqual(rules(pretty), ["W1"]);
  assert.match(errors(pretty)[0].message, /pretty-printed/);
  assert.deepEqual(rules("not a payload"), ["W1"]);
});

test("W4: corrupt ESO is an error", () => {
  const bad = "!eso/1\nrows[2]{n,x}\n1\ta\n3\tb\n"; // broken n sequence
  assert.deepEqual(rules(bad), ["W4"]);
  assert.deepEqual(rules("!eso/1\nrows[3]{id}\n1\n2\n"), ["W4"]); // count checksum
});

test("W5: undeduped uniform record arrays are a suggestion", () => {
  const doc = JSON.stringify({ findings: [{ a: 1, b: 2 }, { a: 3, b: 4 }, { a: 5, b: 6 }] });
  const res = lint(doc);
  assert.deepEqual(res.findings.map((f) => [f.rule, f.level]), [["W5", "suggestion"]]);
  // columnar form of the same data passes
  const col = JSON.stringify({ findings: { "#c": ["a", "b"], "#r": [[1, 2], [3, 4], [5, 6]] } });
  assert.deepEqual(rules(col), []);
  // short (<3) and mixed-schema arrays are exempt
  assert.deepEqual(rules(JSON.stringify({ xs: [{ a: 1 }, { a: 2 }] })), []);
  assert.deepEqual(rules(JSON.stringify({ xs: [{ a: 1 }, { b: 2 }, { c: 3 }] })), []);
});

test("W6: carve-out fields in dense encodings are errors", () => {
  const eso = encode({ payments: [{ to: "acct-1", amount: 500 }], note: "batch" });
  assert.deepEqual(rules(eso), ["W6"]);
  const col = JSON.stringify({ migrations: { "#c": ["id", "sql"], "#r": [[1, "DROP TABLE x"]] } });
  assert.deepEqual(rules(col), ["W6"]);
});

test("multiple findings accumulate", () => {
  const pretty = JSON.stringify({ rows: [{ a: 1 }, { a: 2 }, { a: 3 }] }, null, 1);
  assert.deepEqual(rules(pretty), ["W1", "W5"]);
});
