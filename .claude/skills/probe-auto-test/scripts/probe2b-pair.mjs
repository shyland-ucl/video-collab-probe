// Probe 2b — Decoupled Coordination, two-client pairing smoke test.
// Drives a Creator and a Helper in two separate browser contexts and
// verifies that both leave the "Waiting for ..." screen once paired through
// the WS relay. Probe 3 reuses the same pairing handshake; the script also
// exercises that path so a regression in either probe surfaces here.

import { chromium } from 'playwright';
import { BASE, makeRunner } from './lib.mjs';

async function pair(probePath) {
  const browser = await chromium.launch({ headless: true });
  const ctxA = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  });
  const ctxB = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  for (const p of [a, b]) {
    p.errors = [];
    p.on('pageerror', (e) => p.errors.push(String(e)));
    p.on('console', (m) => {
      if (m.type() === 'error') p.errors.push('console: ' + m.text());
    });
    await p.goto(BASE + '/');
    await p.evaluate(() => {
      localStorage.setItem(
        'sessionConfig',
        JSON.stringify({
          sessionId: 'pair-' + Date.now(),
          dyadId: 'pair',
          conditionOrder: ['probe1', 'probe2a', 'probe2b', 'probe3'],
          completedConditions: [],
        })
      );
    });
  }
  // Use ?role= deep-links to skip the role selector. NF2 regression check:
  // if didAutoConnect was reverted, both sides will hang on Waiting forever.
  await a.goto(BASE + probePath + '?role=creator');
  await b.goto(BASE + probePath + '?role=helper');
  return { browser, a, b };
}

async function leftWaitingScreen(page, timeoutMs = 8000) {
  // Both Creator and Helper sit on a "Waiting for ..." screen until paired.
  // Once paired they navigate into a library / role-specific UI; the
  // simplest check is that the "Waiting" copy disappears.
  try {
    await page.waitForFunction(
      () => !/Waiting for/i.test(document.body.innerText || ''),
      null,
      { timeout: timeoutMs }
    );
    return true;
  } catch {
    return false;
  }
}

const runner = makeRunner('Probe 2b/3 pairing');

for (const [label, path] of [
  ['Probe 2b WS pairing completes', '/probe2b'],
  ['Probe 3 WS pairing completes', '/probe3'],
]) {
  await runner.check(label, async () => {
    const { browser, a, b } = await pair(path);
    try {
      const [aOk, bOk] = await Promise.all([leftWaitingScreen(a), leftWaitingScreen(b)]);
      return {
        pass: aOk && bOk,
        detail: `creator-paired=${aOk} helper-paired=${bOk}`,
      };
    } finally {
      await browser.close();
    }
  });
}

const sum = runner.summary();
process.exitCode = sum.fails.length === 0 ? 0 : 1;
