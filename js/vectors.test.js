"use strict";
// Conformance: the reference implementation must pass its own vectors.

const assert = require("node:assert/strict");
const test = require("node:test");
const vectors = require("../vectors/vectors.json");
const { decode, encode } = require(".");

test("valid vectors: canonical encode and lossless decode", () => {
  for (const { name, value, eson } of vectors.valid) {
    assert.equal(encode(value), eson, `encode: ${name}`);
    assert.deepEqual(decode(eson), value, `decode: ${name}`);
  }
});

test("decode_only vectors: legal input, non-canonical form", () => {
  for (const { name, value, eson } of vectors.decode_only) {
    assert.deepEqual(decode(eson), value, `decode: ${name}`);
  }
});

test("invalid vectors: must be rejected", () => {
  for (const { name, eson } of vectors.invalid) {
    assert.throws(() => decode(eson), undefined, `should reject: ${name}`);
  }
});
