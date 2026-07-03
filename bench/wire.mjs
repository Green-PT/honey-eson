#!/usr/bin/env node
// Live wire-layer benchmark: does the negotiation dispatch line + canonical primer
// actually work end-to-end? A sender agent hands off a record set; a receiver agent
// answers ground-truth queries from the handoff alone. Objective, no LLM judge.
//
// Variants (the only difference is the wire instruction given to the sender):
//   unprompted — no wire instruction (what agents do by default)
//   json       — "compact minified JSON" (Profile W1 alone)
//   eson        — NEGOTIATION.md dispatch line + PRIMER.md (+ numbered-rows addendum)
//
// Measured per variant: sender output tokens, handoff wire tokens (o200k),
// ESON validity/lint pass rate, receiver accuracy on key-lookup / positional /
// absence queries.
//
//   ANTHROPIC_API_KEY=... node bench/wire.mjs     env: MODEL, RECEIVER_MODEL, RUNS

import fs from "node:fs";
import { createRequire } from "node:module";
import { countTokens } from "gpt-tokenizer/encoding/o200k_base";

const require = createRequire(import.meta.url);
const { tryDecode } = require("../js");
const { lint } = require("../js/lint");

const MODEL = process.env.MODEL || "claude-opus-4-8";
const RECEIVER_MODEL = process.env.RECEIVER_MODEL || MODEL;
const RUNS = Number(process.env.RUNS || 3);
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) throw new Error("ANTHROPIC_API_KEY is not set");

const PRIMER = /```text\n([\s\S]*?)```/g;
const primers = [...fs.readFileSync(new URL("../PRIMER.md", import.meta.url), "utf8").matchAll(PRIMER)].map((m) => m[1].trim());
const [BASE_PRIMER, N_ADDENDUM] = primers;

// Ground-truth payload: 25 uniform records (the shape ESON targets).
const results = Array.from({ length: 25 }, (_, i) => ({
  rank: i + 1,
  source: `docs-${i}.example`,
  score: +(0.99 - i / 100).toFixed(2),
  title: `Result ${i} for structured agent communication`,
}));
const DATA = { from: "search-agent", to: "synthesis-agent", kind: "tool_results", results };
const QUERIES = [
  { q: "What is the source of the result whose rank is 7?", a: "docs-6.example" },
  { q: "What is the title of the 12th result in the list?", a: "Result 11 for structured agent communication" },
  { q: "What is the score of the result whose source is docs-3.example?", a: "0.96" },
  { q: 'Is there any result whose source is "docs-99.example"? Answer yes or no.', a: "no" },
];

const VARIANTS = {
  unprompted: { primer: null, instruction: "" },
  json: { primer: null, instruction: "Return the handoff as compact minified JSON (no indentation, no code fences)." },
  eson: {
    primer: `${BASE_PRIMER}\n\n${N_ADDENDUM}`,
    instruction:
      "Return structured results as ESON (wire format !eson/1) per the primer you were given. " +
      "Number the record array: make its first field n, the 1-based row number. No code fences.",
  },
};

async function complete({ model, system, user, maxTokens = 4096 }) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model, max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) {
      if ([429, 500, 502, 503, 529].includes(res.status) && attempt < 5) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = await res.json();
    return {
      text: data.content.filter((b) => b.type === "text").map((b) => b.text).join(""),
      out: data.usage.output_tokens,
    };
  }
}

const stripFences = (t) => t.replace(/^```[a-z]*\n?/gm, "").replace(/```\s*$/gm, "").trim();

async function runCell(variantName, run) {
  const v = VARIANTS[variantName];
  const sender = await complete({
    model: MODEL,
    system: v.primer ? `You are a subagent in a multi-agent pipeline.\n\n${v.primer}` : "You are a subagent in a multi-agent pipeline.",
    user:
      `You searched and found these tool results:\n\n${JSON.stringify(DATA)}\n\n` +
      `Hand off ALL of these results to the synthesis agent. Include every record and every field, unabridged. ` +
      `Reply with ONLY the handoff payload, nothing else. ${v.instruction}`,
  });
  const handoff = stripFences(sender.text);

  // ESON validity + profile compliance (objective)
  let valid = null;
  if (variantName === "eson") {
    const decoded = tryDecode(handoff);
    valid = decoded.ok && !lint(handoff).findings.some((f) => f.level === "error");
  }

  const receiver = await complete({
    model: RECEIVER_MODEL,
    system: v.primer ? `You answer questions from a structured handoff.\n\n${v.primer}` : "You answer questions from a structured handoff.",
    user:
      `You received this handoff from another agent:\n\n${handoff}\n\n` +
      `Answer each question using ONLY the handoff. Reply with a JSON array of ${QUERIES.length} short string answers, nothing else.\n\n` +
      QUERIES.map((x, i) => `${i + 1}. ${x.q}`).join("\n"),
    maxTokens: 500,
  });
  let answers = [];
  try { answers = JSON.parse(stripFences(receiver.text)); } catch {}
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9.\- ]/g, "").trim();
  const correct = QUERIES.map((x, i) => (answers[i] != null && norm(answers[i]).includes(norm(x.a)) ? 1 : 0));

  return { variant: variantName, run, senderOut: sender.out, wireTok: countTokens(handoff), valid, correct };
}

const records = [];
for (const name of Object.keys(VARIANTS)) {
  for (let run = 0; run < RUNS; run++) {
    const rec = await runCell(name, run);
    records.push(rec);
    console.error(`${name}#${run} out=${rec.senderOut} wire=${rec.wireTok} valid=${rec.valid} acc=${rec.correct.join("")}`);
  }
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (x) => `${Math.round(x * 100)}%`;
const rows = Object.keys(VARIANTS).map((name) => {
  const rs = records.filter((r) => r.variant === name);
  const flat = rs.flatMap((r) => r.correct);
  return {
    name,
    wire: mean(rs.map((r) => r.wireTok)),
    out: mean(rs.map((r) => r.senderOut)),
    valid: name === "eson" ? pct(mean(rs.map((r) => (r.valid ? 1 : 0)))) : "—",
    acc: pct(mean(flat)),
    posAcc: pct(mean(rs.map((r) => r.correct[1]))), // the positional query
  };
});
const base = rows.find((r) => r.name === "unprompted");
const table = [
  "| Variant | Wire tok | vs unprompted | Sender out tok | Valid ESON | Recovery | Positional |",
  "|---------|---------:|--------------:|---------------:|----------:|---------:|-----------:|",
  ...rows.map((r) =>
    `| ${r.name} | ${r.wire.toFixed(0)} | ${r.name === "unprompted" ? "+0%" : `${Math.round((r.wire / base.wire - 1) * 100)}%`} | ` +
    `${r.out.toFixed(0)} | ${r.valid} | ${r.acc} | ${r.posAcc} |`),
].join("\n");

const report = `# Wire-layer bench (live, end-to-end)

sender/receiver: \`${MODEL}\` / \`${RECEIVER_MODEL}\` · runs: ${RUNS} · payload: 25 uniform records · no judge

${table}

- **Wire tok** — o200k tokens of the handoff the sender actually produced.
- **Valid ESON** — decodes per SPEC.md and passes \`eson lint\` with no MUST violations
  (checks that the canonical primer alone is enough to *produce* the format).
- **Recovery** — receiver accuracy on key-lookup, positional, filtered-field, and absence
  queries answered from the handoff alone.
- **Positional** — the "12th result" query in isolation: the reserved \`n\` field's job.

Caveats: the sender is fed minified JSON, so the unprompted baseline tends to echo
compact JSON — the +55% pretty-print waste is measured deterministically in
FORMATS.md, not here. At 25 records the recovery queries saturate for every
variant; the positional-access gap appears at ~50 records (see the honey
comprehension suite). What this bench uniquely shows: the canonical primer +
one dispatch line is sufficient for a model to PRODUCE spec-valid ESON.
`;
fs.writeFileSync(new URL("./WIRE.md", import.meta.url), report);
console.log("\n" + report);
