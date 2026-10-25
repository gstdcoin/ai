/**
 * Project guard: fails CI when a change breaks a standing project rule.
 * Run from the repo root: node scripts/guard.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const SELF = 'scripts/guard.mjs';
const TEXT = /\.(ts|tsx|js|mjs|json|md|yml|yaml|html|sh|toml|env|example)$/i;

const rules = [
    { name: 'Telegram bot token', re: /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/ },
    { name: 'private key', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
    { name: 'dead domain gstdbot.gstdtoken.com', re: /gstdbot\.gstdtoken\.com/ },
    { name: 'fake early-adopter promo', re: /Race to 10/i },
];
const bannedFiles = [/(^|\/)vercel\.json$/, /^\.vercel\//, /(^|\/)\.env$/];

const problems = [];
for (const f of files) {
    if (bannedFiles.some(r => r.test(f))) problems.push(`${f}: file not allowed in this project`);
    if (f === SELF || !TEXT.test(f) || !existsSync(f)) continue;
    const body = readFileSync(f, 'utf8');
    for (const r of rules) if (r.re.test(body)) problems.push(`${f}: ${r.name}`);
}

if (problems.length) {
    console.error('Guard failed:\n' + problems.map(p => ` - ${p}`).join('\n'));
    process.exit(1);
}
console.log(`Guard ok (${files.length} files checked)`);
