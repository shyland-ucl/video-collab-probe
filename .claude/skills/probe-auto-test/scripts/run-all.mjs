// Aggregate runner. Spawns each per-probe script as a child process so a
// crash in one probe doesn't take the whole run down. Tees output to a log
// file and prints a one-screen summary at the end.

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const logPath = join(here, '.last-run.log');
mkdirSync(dirname(logPath), { recursive: true });

const probes = (process.argv[2] || 'all').toLowerCase().split(',');
const all = probes.includes('all');

const scripts = [
  ['Probe 1', 'probe1.mjs', all || probes.includes('probe1')],
  ['Probe 2a', 'probe2a.mjs', all || probes.includes('probe2a')],
  ['Probe 2b/3 pairing', 'probe2b-pair.mjs', all || probes.includes('probe2b') || probes.includes('probe3')],
];

const lines = [];
function tee(s) {
  process.stdout.write(s);
  lines.push(s);
}

async function runOne(name, file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(here, file)], {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d.toString();
      tee(d.toString());
    });
    child.stderr.on('data', (d) => {
      buf += d.toString();
      tee(d.toString());
    });
    child.on('exit', (code) => {
      // Parse the last "X/Y PASS" summary line
      const m = buf.match(/(\d+)\/(\d+) PASS\b(?!.*\d+\/\d+ PASS)/s);
      const pass = m ? Number(m[1]) : 0;
      const total = m ? Number(m[2]) : 0;
      resolve({ name, code, pass, total });
    });
  });
}

const results = [];
for (const [name, file, enabled] of scripts) {
  if (!enabled) continue;
  tee(`\n=== ${name} ===\n`);
  results.push(await runOne(name, file));
}

tee('\n--- SUMMARY ---\n');
let anyFail = false;
for (const r of results) {
  const ok = r.code === 0;
  if (!ok) anyFail = true;
  tee(`${ok ? 'PASS' : 'FAIL'}  ${r.name}: ${r.pass}/${r.total}\n`);
}
tee(`Log: ${logPath}\n`);
writeFileSync(logPath, lines.join(''));
process.exitCode = anyFail ? 1 : 0;
