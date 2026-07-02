"use strict";
// Conformance: the reference implementation must pass its own vectors.

const assert = require("node:assert/strict");
const test = require("node:test");
const vectors = require("../vectors/vectors.json");
const { decode, encode } = require(".");

test("valid vectors: canonical encode and lossless decode", () => {
  for (const { name, value, eso } of vectors.valid) {
    assert.equal(encode(value), eso, `encode: ${name}`);
    assert.deepEqual(decode(eso), value, `decode: ${name}`);
  }
});

test("decode_only vectors: legal input, non-canonical form", () => {
  for (const { name, value, eso } of vectors.decode_only) {
    assert.deepEqual(decode(eso), value, `decode: ${name}`);
  }
});

test("invalid vectors: must be rejected", () => {
  for (const { name, eso } of vectors.invalid) {
    assert.throws(() => decode(eso), undefined, `should reject: ${name}`);
  }
});
