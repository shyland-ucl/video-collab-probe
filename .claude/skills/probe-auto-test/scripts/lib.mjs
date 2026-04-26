// Shared helpers for the probe-auto-test skill. All Playwright glue lives
// here so the per-probe scripts read like the study plan, not like
// browser plumbing.

import { chromium } from 'playwright';

export const BASE = process.env.BASE || 'http://localhost:5174';

export async function launch({ headless = true } = {}) {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  // Surface React/runtime errors so a check can fail fast on a hydration crash
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') page.errors.push('console: ' + msg.text());
  });
  return { browser, context, page };
}

// Seed sessionConfig so SessionSetup doesn't gate routing. Idempotent.
export async function seedSession(page, { dyadId = 'autotest' } = {}) {
  await page.goto(BASE + '/');
  await page.evaluate(({ dyadId }) => {
    localStorage.setItem(
      'sessionConfig',
      JSON.stringify({
        sessionId: 'auto-' + Date.now(),
        dyadId,
        conditionOrder: ['probe1', 'probe2a', 'probe2b', 'probe3'],
        completedConditions: [],
      })
    );
  }, { dyadId });
}

// Dismiss the OnboardingBrief overlay if it's present. The brief is permanent
// inline on some probes (intentional, see walkthrough M3) so this is best-effort.
export async function dismissOnboarding(page) {
  for (const name of ['Got it', 'Begin', 'Start', 'Continue', 'Close', 'Dismiss']) {
    const b = page.getByRole('button', { name: new RegExp('^' + name + '$', 'i') }).first();
    if (await b.isVisible().catch(() => false)) {
      await b.click().catch(() => {});
      return name;
    }
  }
  return null;
}

// Pick the first sample video tile in the library and create the project.
// Throws if either step is missing — that itself is a regression worth knowing.
export async function importFirstSampleVideo(page) {
  const tile = page.getByRole('button', { name: /Morning Coffee Routine/i }).first();
  await tile.waitFor({ timeout: 5000 });
  await tile.click();
  const create = page.getByRole('button', { name: /Create project/i }).first();
  await create.waitFor({ timeout: 3000 });
  await create.click();
  // Wait for the first scene block to land (proof the exploring phase mounted)
  await page.getByRole('button', { name: /Scene 1 of/i }).first().waitFor({ timeout: 5000 });
}

// Expand scene N (1-indexed) and return when the actions region is mounted.
export async function expandScene(page, n) {
  const block = page.getByRole('button', { name: new RegExp(`Scene ${n} of`, 'i') }).first();
  await block.waitFor({ timeout: 3000 });
  await block.click();
  // The expanded block exposes a region with role="region" labelled "Actions for scene N"
  await page
    .locator(`[role="region"][aria-label="Actions for scene ${n}"]`)
    .waitFor({ timeout: 3000 });
}

// Read which 1-indexed scene is currently expanded (null if none).
export async function expandedSceneIndex(page) {
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button[aria-expanded="true"]'));
    for (const b of buttons) {
      const m = (b.getAttribute('aria-label') || '').match(/Scene (\d+) of/);
      if (m) return Number(m[1]);
    }
    return null;
  });
}

export async function videoCurrentTime(page) {
  return page.evaluate(() => {
    const v = Array.from(document.querySelectorAll('video')).find((el) => !el.paused) ||
              document.querySelector('video');
    return v ? Number(v.currentTime.toFixed(2)) : null;
  });
}

// Sample (expanded scene index, video currentTime) every `intervalMs` for
// `durationMs`. Returns the array of samples plus detected transitions in
// expanded scene index.
export async function sampleAutoFollow(page, { intervalMs = 500, durationMs = 8000 } = {}) {
  const samples = [];
  const steps = Math.ceil(durationMs / intervalMs);
  for (let i = 0; i < steps; i++) {
    samples.push({
      ts: (i * intervalMs) / 1000,
      videoTime: await videoCurrentTime(page),
      expandedScene: await expandedSceneIndex(page),
    });
    await page.waitForTimeout(intervalMs);
  }
  const transitions = [];
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].expandedScene !== samples[i - 1].expandedScene) {
      transitions.push({
        wallTime: samples[i].ts,
        videoTime: samples[i].videoTime,
        from: samples[i - 1].expandedScene,
        to: samples[i].expandedScene,
      });
    }
  }
  return { samples, transitions };
}

// Tiny test harness so per-probe scripts are declarative.
// Each `check(name, fn)` runs `fn`, expects it to return { pass: boolean, detail?: string }.
// Reports one [PASS]/[FAIL] line per check. Exits the script with non-zero
// if any check failed.
export function makeRunner(probeName) {
  const results = [];
  return {
    async check(name, fn) {
      let res;
      try {
        res = await fn();
      } catch (e) {
        res = { pass: false, detail: 'threw: ' + (e?.message || String(e)) };
      }
      const tag = res.pass ? 'PASS' : 'FAIL';
      console.log(`[${tag}] ${probeName} :: ${name}` + (res.detail ? ` — ${res.detail}` : ''));
      results.push({ name, ...res });
    },
    summary() {
      const pass = results.filter((r) => r.pass).length;
      const total = results.length;
      console.log(`---\n${probeName}: ${pass}/${total} PASS`);
      return { probeName, pass, total, fails: results.filter((r) => !r.pass) };
    },
  };
}

export async function withBrowser(fn) {
  const { browser, context, page } = await launch();
  try {
    return await fn({ browser, context, page });
  } finally {
    await browser.close();
  }
}
