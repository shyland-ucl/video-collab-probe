// TaskAudit-style end-to-end accessibility journey runner.
//
// Drives the four most BLV-critical user journeys for Probe 1 through
// real Playwright interactions, captures the (focus, announce, dom)
// evidence at every step via lib-trace, scores it via judge, and emits
// docs/probe_task_audit_<date>.md.
//
// To extend: add a new journey object to JOURNEYS. Each step is
// { name, action(ctx), expect? } — see judge.mjs for the
// expect.kind / expect.utterance contract.
//
// Run:  BASE=http://localhost:5173 node .claude/skills/probe-auto-test/scripts/task-audit.mjs

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  BASE,
  withBrowser,
  seedSession,
  dismissOnboarding,
  importFirstSampleVideo,
  expandScene,
} from './lib.mjs';
import { runJourney } from './lib-trace.mjs';
import { judgeTrace, renderReport } from './judge.mjs';

const JOURNEYS = {
  probe1: [
    {
      name: 'expand scene 1',
      expect: { kind: 'activation', utterance: 'walking to kitchen' },
      action: async ({ page }) => {
        await expandScene(page, 1);
      },
    },
    {
      name: 'switch to Detailed via More detail',
      expect: { kind: 'activation', utterance: 'detailed' },
      action: async ({ page }) => {
        await page.locator('button[aria-label="More detail"]').first().click();
      },
    },
    {
      name: 'switch to Technical via More detail',
      expect: { kind: 'activation', utterance: 'technical' },
      action: async ({ page }) => {
        await page.locator('button[aria-label="More detail"]').first().click();
      },
    },
    {
      name: 'try More detail at the maximum (should refuse politely)',
      expect: { kind: 'activation', utterance: 'maximum' },
      action: async ({ page }) => {
        await page.locator('button[aria-label="More detail"]').first().click();
      },
    },
    {
      name: 'open Ask AI panel',
      expect: { kind: 'activation', utterance: 'voice input' },
      action: async ({ page }) => {
        await page.getByRole('button', { name: /^Ask AI$/ }).first().click();
      },
    },
    {
      name: 'play scene 1 from the start',
      expect: { kind: 'activation' },
      action: async ({ page }) => {
        // The toggle's accessible name flips to "Close Ask AI" (visible
        // text only, no aria-label) when the panel is open.
        const close = page.getByRole('button', { name: /^Close Ask AI$/ }).first();
        if (await close.count()) await close.click();
        await page.locator('button[aria-label="Play from here"]').first().click();
      },
    },
    {
      name: 'pause playback (should hear what scene we are on)',
      expect: { kind: 'activation', utterance: 'paused on scene' },
      action: async ({ page }) => {
        // Wait briefly so currentTime advances inside the scene.
        await page.waitForTimeout(800);
        const pauseBtn = page.locator('button[aria-label="Pause from here"]').first();
        if (await pauseBtn.count()) await pauseBtn.click();
      },
    },
  ],
};

async function main() {
  const probesArg = process.argv[2] || 'probe1';
  const probes = probesArg.split(',').map((s) => s.trim()).filter(Boolean);
  let allFindings = [];
  const sections = [];

  for (const probe of probes) {
    if (!JOURNEYS[probe]) {
      console.error(`No journey defined for ${probe}. Known: ${Object.keys(JOURNEYS).join(', ')}`);
      process.exitCode = 2;
      continue;
    }
    console.log(`\n=== ${probe} ===`);
    await withBrowser(async ({ page }) => {
      await seedSession(page);
      await page.goto(BASE + '/' + probe);
      await page.waitForLoadState('networkidle');
      await dismissOnboarding(page);
      await importFirstSampleVideo(page);

      const trace = await runJourney(page, JOURNEYS[probe]);
      const findings = judgeTrace(trace);
      allFindings = allFindings.concat(findings.map((f) => ({ probe, ...f })));
      sections.push(renderReport({ probe, trace, findings }));

      const counts = { B: 0, M: 0, m: 0 };
      for (const f of findings) counts[f.severity]++;
      console.log(`${probe}: ${trace.length} steps · findings B=${counts.B} M=${counts.M} m=${counts.m}`);
      for (const f of findings) {
        console.log(`  [${f.severity}] ${f.code} @ "${f.step}" — ${f.message}`);
      }
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const outPath = path.join(process.cwd(), 'docs', `probe_task_audit_${today}.md`);
  await fs.writeFile(outPath, sections.join('\n\n---\n\n'), 'utf8');
  console.log(`\nReport written: ${path.relative(process.cwd(), outPath)}`);

  const blockers = allFindings.filter((f) => f.severity === 'B').length;
  if (blockers > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
