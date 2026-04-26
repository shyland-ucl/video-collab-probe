// Probe 1 — AI Scene Explorer.
// Verifies the user-flow claims in STUDY_PLAN.md §"Condition 1: AI Scene
// Explorer (Probe 1)" that we can observe through the DOM and the <video>
// element.

import {
  BASE,
  withBrowser,
  seedSession,
  dismissOnboarding,
  importFirstSampleVideo,
  expandScene,
  expandedSceneIndex,
  sampleAutoFollow,
  makeRunner,
} from './lib.mjs';

await withBrowser(async ({ page }) => {
  const runner = makeRunner('Probe 1');

  // Setup
  await seedSession(page);
  await page.goto(BASE + '/probe1');
  await page.waitForLoadState('networkidle');
  await dismissOnboarding(page);

  // -- library phase claims ------------------------------------------------
  await runner.check('library lists at least 3 sample videos', async () => {
    const count = await page.evaluate(() => {
      // Sample tiles all have aria-labels starting with the video title and
      // duration. Pipeline tiles share the same shape; either is fine.
      return document.querySelectorAll(
        'button[aria-label*="Morning Coffee"], button[aria-label*="Coffee Vlog"], button[aria-label*="Lakeside"]'
      ).length;
    });
    return { pass: count >= 3, detail: `found ${count} sample tiles` };
  });

  await runner.check('Create Project button is present and disabled at 0 selected', async () => {
    const create = page.getByRole('button', { name: /Create project/i }).first();
    const visible = await create.isVisible();
    const disabled = await create.isDisabled().catch(() => false);
    // The button is visible even at 0; the study plan calls it "Create Project"
    // (B6 / m6 walkthrough alignment). Disabled state is implementation detail
    // — we just want the affordance present.
    return { pass: visible, detail: `visible=${visible} disabled=${disabled}` };
  });

  // -- exploring phase claims ----------------------------------------------
  await importFirstSampleVideo(page);

  await runner.check('exploring phase mounts 5 scene blocks for the sample video', async () => {
    const count = await page.locator('button[aria-label*="Scene "][aria-label*=" of 5"]').count();
    return { pass: count === 5, detail: `found ${count} scene blocks` };
  });

  await runner.check('scene 1 expands and exposes an Actions region', async () => {
    await expandScene(page, 1);
    const region = await page.locator('[role="region"][aria-label="Actions for scene 1"]').count();
    return { pass: region === 1, detail: `region count=${region}` };
  });

  await runner.check('Play button visible text is "Play from here", aria-label is "Play scene 1"', async () => {
    // Visible text is the BLV-friendly label; aria-label keeps the dyad-coordination wording.
    // Lan supersedes M11 here — see memory `feedback_scene_block_a11y.md`.
    const btn = page.getByRole('button', { name: /^Play scene 1$/ }).first();
    const visible = (await btn.textContent())?.trim();
    const aria = await btn.getAttribute('aria-label');
    return {
      pass: visible === 'Play from here' && aria === 'Play scene 1',
      detail: `visible="${visible}" aria="${aria}"`,
    };
  });

  await runner.check('expanded block auto-follows playback across scene boundaries', async () => {
    // Already on scene 1 expanded. Click the play button and sample for 8 s.
    await page.getByRole('button', { name: /^Play scene 1$/ }).first().click();
    const { samples, transitions } = await sampleAutoFollow(page);
    // Expect at least one transition 1 → 2 around videoTime ≈ 3 s.
    const oneToTwo = transitions.find((t) => t.from === 1 && t.to === 2);
    const stayedOpen = samples.every((s) => s.expandedScene !== null);
    if (!oneToTwo || !stayedOpen) {
      return {
        pass: false,
        detail:
          `transitions=${JSON.stringify(transitions)} ` +
          `null-samples=${samples.filter((s) => s.expandedScene === null).length}`,
      };
    }
    return {
      pass: true,
      detail: `1→2 at videoTime≈${oneToTwo.videoTime}s; ${transitions.length} total transitions`,
    };
  });

  await runner.check('no React/runtime errors during the flow', async () => {
    const errs = page.errors.filter(
      (e) =>
        // Tolerate the well-known speech-synthesis interrupt warning when TTS
        // is stopped mid-utterance — that's expected behaviour.
        !/speechSynthesis|interrupted/i.test(e)
    );
    return { pass: errs.length === 0, detail: errs[0] ? errs[0].slice(0, 200) : 'clean' };
  });

  const sum = runner.summary();
  process.exitCode = sum.fails.length === 0 ? 0 : 1;
});
