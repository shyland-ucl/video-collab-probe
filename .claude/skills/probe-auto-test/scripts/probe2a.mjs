// Probe 2a — Smart Handover (co-located).
// Focused on the B2 walkthrough finding: "Edit by Myself" buttons (Trim,
// Split, Move Earlier/Later, Add Caption, Add Note) must produce visible
// editState mutations, not just fire log events. We detect mutations by
// reading the DOM count of clip cards / caption pills before vs. after.

import {
  BASE,
  withBrowser,
  seedSession,
  dismissOnboarding,
  importFirstSampleVideo,
  expandScene,
  makeRunner,
} from './lib.mjs';

await withBrowser(async ({ page }) => {
  const runner = makeRunner('Probe 2a');

  await seedSession(page);
  await page.goto(BASE + '/probe2');
  await page.waitForLoadState('networkidle');
  await dismissOnboarding(page);

  // Probe 2a now has a library phase too (the walkthrough finding "no
  // library phase" got resolved). Pick the first sample video like Probe 1.
  await runner.check('library phase is present and importable', async () => {
    const tile = page.getByRole('button', { name: /Morning Coffee Routine/i }).first();
    const hasTile = await tile.isVisible().catch(() => false);
    if (!hasTile) return { pass: false, detail: 'sample tile not visible' };
    await importFirstSampleVideo(page);
    return { pass: true, detail: 'imported Morning Coffee Routine' };
  });

  await runner.check('exploring phase mounts 5 scene blocks for the imported video', async () => {
    const count = await page.locator('button[aria-label*="Scene "][aria-label*=" of 5"]').count();
    return { pass: count === 5, detail: `found ${count} scene blocks` };
  });

  await runner.check('Play button text is "Play from here", aria-label is "Play scene 1"', async () => {
    await expandScene(page, 1);
    const btn = page.getByRole('button', { name: /^Play scene 1$/ }).first();
    const visible = (await btn.textContent())?.trim();
    const aria = await btn.getAttribute('aria-label');
    return {
      pass: visible === 'Play from here' && aria === 'Play scene 1',
      detail: `visible="${visible}" aria="${aria}"`,
    };
  });

  // Snapshot a small "edit-state fingerprint" by reading the DOM. We look at
  // the total count of buttons whose aria-label starts with "Scene " and " of "
  // — that's the clip count surfaced to the user. A Split should grow it; a
  // Delete (not tested here) would shrink it.
  async function clipFingerprint() {
    return page.evaluate(() => ({
      sceneCount: document.querySelectorAll('button[aria-label*="Scene "][aria-label*=" of "]').length,
      // Caption indicator: any pill / text that mentions a caption count.
      captionIndicators: Array.from(document.querySelectorAll('*'))
        .filter((el) => /caption/i.test(el.getAttribute?.('aria-label') || ''))
        .length,
    }));
  }

  await runner.check('Edit by Myself sub-panel opens', async () => {
    // The expanded scene exposes "Edit Myself" / "Edit by Myself" — match either.
    const edit = page
      .getByRole('button', { name: /Edit (by )?[Mm]yself|Edit Myself/ })
      .first();
    if (!(await edit.isVisible().catch(() => false))) {
      return { pass: false, detail: 'Edit Myself button not found in expanded scene' };
    }
    await edit.click();
    // After click, Trim / Split / Move buttons should be visible.
    const trimVisible = await page
      .getByRole('button', { name: /^Trim/ })
      .first()
      .isVisible()
      .catch(() => false);
    return { pass: trimVisible, detail: trimVisible ? 'Trim affordance present' : 'Trim affordance missing' };
  });

  await runner.check('Split actually adds a clip to editState (B2 regression)', async () => {
    const before = await clipFingerprint();
    const split = page.getByRole('button', { name: /^Split/ }).first();
    if (!(await split.isVisible().catch(() => false))) {
      return { pass: false, detail: 'Split button not visible — check that Edit Myself sub-panel is open' };
    }
    await split.click();
    // Give the state mutation a tick to render.
    await page.waitForTimeout(300);
    const after = await clipFingerprint();
    const grew = after.sceneCount > before.sceneCount;
    return {
      pass: grew,
      detail: `sceneCount before=${before.sceneCount} after=${after.sceneCount}`,
    };
  });

  await runner.check('Add Caption actually adds a caption (B2 regression)', async () => {
    const before = await clipFingerprint();
    const cap = page.getByRole('button', { name: /Add Caption/i }).first();
    if (!(await cap.isVisible().catch(() => false))) {
      return { pass: false, detail: 'Add Caption button not visible' };
    }
    await cap.click();
    // Some implementations open a text-input modal; type something + Save.
    const input = page.locator('input[type="text"]').last();
    if (await input.isVisible().catch(() => false)) {
      await input.fill('autotest caption');
      const save = page.getByRole('button', { name: /^Save$/ }).first();
      await save.click().catch(() => {});
    }
    await page.waitForTimeout(300);
    const after = await clipFingerprint();
    const grew = after.captionIndicators > before.captionIndicators;
    return {
      pass: grew,
      detail: `captionIndicators before=${before.captionIndicators} after=${after.captionIndicators}`,
    };
  });

  await runner.check('no React/runtime errors during the flow', async () => {
    const errs = page.errors.filter((e) => !/speechSynthesis|interrupted/i.test(e));
    return { pass: errs.length === 0, detail: errs[0] ? errs[0].slice(0, 200) : 'clean' };
  });

  const sum = runner.summary();
  process.exitCode = sum.fails.length === 0 ? 0 : 1;
});
