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

  await runner.check('Play button visible text and aria-label are both "Play from here"', async () => {
    await expandScene(page, 1);
    const btn = page.getByRole('button', { name: /^Play from here$/ }).first();
    const visible = (await btn.textContent())?.trim();
    const aria = await btn.getAttribute('aria-label');
    return {
      pass: visible === 'Play from here' && aria === 'Play from here',
      detail: `visible="${visible}" aria="${aria}"`,
    };
  });

  // Snapshot a small "edit-state fingerprint" by reading the DOM.
  //  - splitClipCount: parsed from the visible "This scene currently has N
  //    clip(s)." text inside the Split section. SceneBlock headers come from
  //    `segments` (static project data), NOT from editState.clips, so a
  //    successful split does NOT grow header count — it grows the clip
  //    count badge inside the open Split section.
  //  - captionRows: <li> rows under the "Existing captions on scene N" list
  //    (only present when captions exist; the section's toggle button is
  //    NOT counted — it's always there and would mask additions).
  async function clipFingerprint() {
    return page.evaluate(() => {
      const badges = document.querySelectorAll('[data-clip-count-for]');
      // Sum across all visible badges (only the open Split section actually
      // renders one, so this is effectively the open scene's clip count).
      let total = 0;
      badges.forEach((el) => {
        const m = (el.textContent || '').match(/has (\d+) clip/);
        if (m) total += parseInt(m[1], 10);
      });
      return {
        splitClipCount: total,
        captionRows: document.querySelectorAll('ul[aria-label^="Existing captions"] li').length,
      };
    });
  }

  await runner.check('Edit by Myself sub-panel opens', async () => {
    const edit = page
      .getByRole('button', { name: /Edit (by )?[Mm]yself|Edit Myself/ })
      .first();
    if (!(await edit.isVisible().catch(() => false))) {
      return { pass: false, detail: 'Edit Myself button not found in expanded scene' };
    }
    await edit.click();
    // After Lan's M4 a11y refactor, Trim/Split/Move/Caption/Note are
    // *Section toggles* with aria-label "{Verb}, expand controls". Match
    // by that suffix to disambiguate the toggle from the action button
    // inside (e.g. "Split here").
    const trimToggle = await page
      .locator('button[aria-label="Trim, expand controls"]')
      .first()
      .isVisible()
      .catch(() => false);
    return { pass: trimToggle, detail: trimToggle ? 'Trim toggle present' : 'Trim toggle missing' };
  });

  await runner.check('Split actually adds a clip to editState (B2 regression)', async () => {
    // 1. Open the Split section first so its clip-count badge renders. The
    //    badge is what we use as a fingerprint — it reads directly from
    //    editState.clips, so it grows on a real split.
    const splitToggle = page.locator('button[aria-label="Split, expand controls"]').first();
    if (!(await splitToggle.isVisible().catch(() => false))) {
      return { pass: false, detail: 'Split section toggle not visible — Edit Myself probably not open' };
    }
    await splitToggle.click();
    await page.locator('[data-clip-count-for]').first().waitFor({ timeout: 2000 });
    const before = await clipFingerprint();
    // 2. Click the actual action button — visible label is "Split here".
    const splitAction = page.getByRole('button', { name: /^Split here$/ }).first();
    await splitAction.waitFor({ timeout: 2000 });
    await splitAction.click();
    await page.waitForTimeout(300);
    const after = await clipFingerprint();
    const grew = after.splitClipCount > before.splitClipCount;
    return {
      pass: grew,
      detail: `splitClipCount before=${before.splitClipCount} after=${after.splitClipCount}`,
    };
  });

  await runner.check('Add Caption actually adds a caption (B2 regression)', async () => {
    const before = await clipFingerprint();
    // 1. Open the Add caption section.
    const capToggle = page.locator('button[aria-label="Add caption, expand controls"]').first();
    if (!(await capToggle.isVisible().catch(() => false))) {
      return { pass: false, detail: 'Add caption toggle not visible' };
    }
    await capToggle.click();
    // 2. The composer is a <textarea>, not an <input>. Fill it.
    const textarea = page.locator('textarea[id^="caption-input-"]').first();
    await textarea.waitFor({ timeout: 2000 });
    await textarea.fill('autotest caption');
    // 3. Submit. Visible label is "Add caption" — disambiguate from the
    //    section toggle by matching the EXACT name.
    const submit = page.getByRole('button', { name: /^Add caption$/ }).first();
    await submit.click();
    await page.waitForTimeout(300);
    const after = await clipFingerprint();
    const grew = after.captionRows > before.captionRows;
    return {
      pass: grew,
      detail: `captionRows before=${before.captionRows} after=${after.captionRows}`,
    };
  });

  await runner.check('no React/runtime errors during the flow', async () => {
    const errs = page.errors.filter((e) => !/speechSynthesis|interrupted/i.test(e));
    return { pass: errs.length === 0, detail: errs[0] ? errs[0].slice(0, 200) : 'clean' };
  });

  const sum = runner.summary();
  process.exitCode = sum.fails.length === 0 ? 0 : 1;
});
