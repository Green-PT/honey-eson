#!/usr/bin/env node
"use strict";
// eso encode [--number] < data.json > data.eso
// eso decode < data.eso > data.json

const fs = require("fs");
const { decode, encode } = require("../js");

// BigInt-aware JSON serializer: emits big integers as bare number literals.
// (JSON.stringify throws on BigInt; a replacer+regex would corrupt string
// values that merely look numeric.)
function jstr(v) {
  if (typeof v === "bigint") return v.toString();
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(jstr).join(",")}]`;
  return `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}:${jstr(x)}`).join(",")}}`;
}

try {
  const cmd = process.argv[2];
  if (cmd === "encode") {
    const number = process.argv.includes("--number");
    process.stdout.write(encode(JSON.parse(fs.readFileSync(0, "utf8")), { number }));
  } else if (cmd === "decode") {
    process.stdout.write(jstr(decode(fs.readFileSync(0, "utf8"))) + "\n");
  } else {
    process.stderr.write("Usage: eso encode [--number] | eso decode  (JSON/ESO via stdin/stdout)\n");
    process.exit(1);
  }
} catch (e) {
  process.stderr.write(`${e.message}\n`);
  process.exit(1);
}
