#!/usr/bin/env bash
# Compare flat key paths in frontend/public/locales/en vs ru common.json.
# Exit 0 = same key set; 1 = drift (CI-friendly).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export EN_JSON="$ROOT/frontend/public/locales/en/common.json"
export RU_JSON="$ROOT/frontend/public/locales/ru/common.json"
node -e '
const fs = require("fs");
const en = JSON.parse(fs.readFileSync(process.env.EN_JSON, "utf8"));
const ru = JSON.parse(fs.readFileSync(process.env.RU_JSON, "utf8"));
function keys(o, p = "") {
  let k = [];
  for (const x of Object.keys(o)) {
    const q = p ? p + "." + x : x;
    if (typeof o[x] === "object" && o[x] !== null && !Array.isArray(o[x])) k = k.concat(keys(o[x], q));
    else k.push(q);
  }
  return k;
}
const ke = keys(en).sort();
const kr = keys(ru).sort();
const onlyEn = ke.filter((k) => !kr.includes(k));
const onlyRu = kr.filter((k) => !ke.includes(k));
console.log("en:", ke.length, "ru:", kr.length);
if (onlyEn.length || onlyRu.length) {
  console.error("Locale key drift:");
  if (onlyEn.length) console.error("  only en:", onlyEn.join(", "));
  if (onlyRu.length) console.error("  only ru:", onlyRu.join(", "));
  process.exit(1);
}
console.log("OK: en/ru common.json keys match");
'
