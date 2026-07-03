"use strict";
// Honey Wire Profile linter — the statically checkable rules (PROFILE.md):
//   W1 minified · W4 checksums decode · W5 record arrays deduped · W6 carve-outs
// lint(text) -> { findings: [{rule, level: "error"|"suggestion", message}] }
// "error" = MUST violation; "suggestion" = SHOULD.

const { tryDecode } = require(".");

const CARVE_OUT = /^(auth|secret|password|credential|payment|transfer|migration|delete|drop|revoke|api_?key|bearer|jwt|(auth|access|refresh)_token)s?$/i;
const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isColumnar = (v) =>
  isRecord(v) && Array.isArray(v["#c"]) && Array.isArray(v["#r"]) &&
  v["#c"].every((c) => typeof c === "string") &&
  v["#r"].every((r) => Array.isArray(r) && r.length === v["#c"].length);

// Uniform record arrays (3+ rows, one schema) that repeat their keys per row.
function undedupedArrays(value, path = "$", out = []) {
  if (Array.isArray(value)) {
    if (value.length >= 3 && value.every(isRecord) && !value.some(isColumnar)) {
      const keys = JSON.stringify(Object.keys(value[0]));
      if (value.every((row) => JSON.stringify(Object.keys(row)) === keys)) out.push(path);
    }
    value.forEach((item, i) => undedupedArrays(item, `${path}[${i}]`, out));
  } else if (isRecord(value) && !isColumnar(value)) {
    for (const [key, item] of Object.entries(value)) undedupedArrays(item, `${path}.${key}`, out);
  }
  return out;
}

// Carve-out fields (W6): flag when a key that names an irreversible action
// carries a dense-encoded value. `dense` marks values already inside a dense
// document (any ESON field) or a columnar block within JSON.
function carveOutViolations(value, dense, out = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => carveOutViolations(item, dense, out));
  else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      const itemDense = dense || isColumnar(item);
      if (CARVE_OUT.test(key) && itemDense) out.add(key);
      carveOutViolations(item, itemDense, out);
    }
  }
  return out;
}

function lint(text) {
  const findings = [];
  const add = (rule, level, message) => findings.push({ rule, level, message });

  if (text.startsWith("!eson/1")) {
    const res = tryDecode(text);
    if (!res.ok) {
      add("W4", "error", `ESON payload fails integrity decode: ${res.error.message}`);
      return { findings };
    }
    for (const key of carveOutViolations(res.value, true)) {
      add("W6", "error", `field "${key}" looks like an irreversible-action payload; carry it as schema-validated JSON, not ESON`);
    }
    return { findings };
  }

  let value;
  try {
    value = JSON.parse(text);
  } catch {
    add("W1", "error", "payload is neither ESON (!eson/1) nor valid JSON");
    return { findings };
  }

  const minified = JSON.stringify(value);
  if (text.trim().length > minified.length) {
    const pct = Math.round((text.trim().length / minified.length - 1) * 100);
    add("W1", "error", `pretty-printed JSON: +${pct}% characters vs minified — emit JSON.stringify(value) with no indent`);
  }
  for (const path of undedupedArrays(value)) {
    add("W5", "suggestion", `uniform record array at ${path} repeats its keys per row; use columnar JSON ({"#c":[cols],"#r":[rows]}) or ESON`);
  }
  for (const key of carveOutViolations(value, false)) {
    add("W6", "error", `field "${key}" looks like an irreversible-action payload; carry it as plain schema-validated JSON, not columnar`);
  }
  return { findings };
}

module.exports = { lint };
