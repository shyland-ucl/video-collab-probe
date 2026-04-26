// Accessibility-tree dump for each probe state, in TalkBack reading order.
//
// For each interesting state across Probes 1 / 2a / 2b / 3 we capture:
//   - The page heading hierarchy (h1 → h2 → h3 …)
//   - Landmark / region structure
//   - The flat in-DOM-order list of accessible elements (tag + role + name)
//   - Live-region (`#sr-announcer`) messages observed during the flow
//
// Then we post-process the captures to flag:
//   - Duplicate accessible names within the same state
//   - Long aria-labels (>120 chars) that bury the actionable verb
//   - Buttons whose visible text and aria-label diverge
//
// Output: docs/probe_a11y_report_<YYYY-MM-DD>.md

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  BASE,
  withBrowser,
  seedSession,
  dismissOnboarding,
  importFirstSampleVideo,
  expandScene,
} from './lib.mjs';

const today = new Date().toISOString().slice(0, 10);
const out = `docs/probe_a11y_report_${today}.md`;
mkdirSync(dirname(out), { recursive: true });

// Inject before any navigation: a MutationObserver that records every
// announcement written to #sr-announcer, so we can reconstruct the live-region
// stream a TalkBack user would hear.
async function attachAnnounceLogger(page) {
  await page.addInitScript(() => {
    window.__annLog = [];
    let attached = false;
    function tryAttach() {
      const ann = document.getElementById('sr-announcer');
      if (!ann) {
        setTimeout(tryAttach, 100);
        return;
      }
      attached = true;
      const obs = new MutationObserver(() => {
        const t = (ann.textContent || '').trim();
        if (t) window.__annLog.push({ t, at: performance.now() });
      });
      obs.observe(ann, { childList: true, subtree: true, characterData: true });
    }
    tryAttach();
  });
}

// Capture the current page's accessibility-tree-ish view in DOM order.
// We mirror what TalkBack does: walk the DOM, skip aria-hidden subtrees,
// surface elements with a role / accessible name / heading / live region.
async function captureState(page, label) {
  const data = await page.evaluate(() => {
    function isHiddenViaAria(el) {
      let cur = el;
      while (cur) {
        if (cur.getAttribute && cur.getAttribute('aria-hidden') === 'true') return true;
        if (cur.hasAttribute && cur.hasAttribute('inert')) return true;
        cur = cur.parentElement;
      }
      return false;
    }
    function isVisible(el) {
      if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    }
    function accessibleName(el) {
      const aria = (el.getAttribute('aria-label') || '').trim();
      if (aria) return { name: aria, source: 'aria-label' };
      const lb = el.getAttribute('aria-labelledby');
      if (lb) {
        const txt = lb
          .split(/\s+/)
          .map((id) => (document.getElementById(id)?.textContent || '').trim())
          .filter(Boolean)
          .join(' ');
        if (txt) return { name: txt, source: 'aria-labelledby' };
      }
      // Visible text content as fallback (TalkBack uses this for plain buttons,
      // links, and headings — but NOT for landmark / list containers).
      return {
        name: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 240),
        source: 'textContent',
      };
    }
    function effectiveRole(el) {
      const r = el.getAttribute('role');
      if (r) return r;
      const tag = el.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) return tag;
      if (tag === 'button') return 'button';
      if (tag === 'a' && el.hasAttribute('href')) return 'link';
      if (tag === 'input') return `input[type=${el.type || 'text'}]`;
      if (tag === 'select') return 'combobox';
      if (tag === 'textarea') return 'textbox';
      if (tag === 'main') return 'main';
      if (tag === 'nav') return 'navigation';
      if (tag === 'header') return 'banner';
      if (tag === 'section') return 'region';
      return null;
    }
    const interesting = new Set([
      'button',
      'link',
      'main',
      'navigation',
      'banner',
      'region',
      'list',
      'listitem',
      'log',
      'status',
      'alert',
      'dialog',
      'group',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'combobox',
      'textbox',
    ]);

    const all = Array.from(document.body.querySelectorAll('*'));
    const items = [];
    for (const el of all) {
      if (isHiddenViaAria(el)) continue;
      if (!isVisible(el)) continue;
      const role = effectiveRole(el);
      const live = el.getAttribute('aria-live');
      const isInputish = role && (role === 'button' || role === 'link' || role.startsWith('input') || role === 'textbox' || role === 'combobox');
      // Keep: anything with a role we treat as interesting, anything with a
      // live region, anything with an explicit aria-label, any heading.
      if (
        !(role && (interesting.has(role) || role.startsWith('input'))) &&
        !live &&
        !el.hasAttribute('aria-label')
      ) {
        continue;
      }
      const { name, source } = accessibleName(el);
      // Container roles with only-textContent names are NOT what TalkBack
      // reads aloud — TalkBack just announces the role ("region", "list", etc.)
      // and then proceeds inside. Skip them unless they have an explicit aria
      // label / labelledby. This keeps the report aligned with what a user
      // actually hears.
      const containerRoles = new Set(['main', 'navigation', 'banner', 'region', 'list', 'listitem', 'group']);
      if (containerRoles.has(role) && source === 'textContent') {
        // Still emit the role marker so structure is visible, but blank the
        // name so it doesn't get treated as TalkBack-spoken text.
        items.push({
          tag: el.tagName.toLowerCase(),
          role,
          name: '',
          nameSource: source,
          ariaLabel: el.getAttribute('aria-label'),
          ariaLive: live,
          ariaExpanded: el.getAttribute('aria-expanded'),
          ariaPressed: el.getAttribute('aria-pressed'),
          ariaModal: el.getAttribute('aria-modal'),
          focusable: false,
          text: '',
        });
        continue;
      }
      // Skip empty-name decorative elements (region with no label and no
      // useful textContent).
      if (!name && !live) continue;
      items.push({
        tag: el.tagName.toLowerCase(),
        role,
        name,
        nameSource: source,
        ariaLabel: el.getAttribute('aria-label'),
        ariaLive: live,
        ariaExpanded: el.getAttribute('aria-expanded'),
        ariaPressed: el.getAttribute('aria-pressed'),
        ariaModal: el.getAttribute('aria-modal'),
        focusable:
          ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) ||
          (el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1'),
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
      });
    }
    const announceLog = (window.__annLog || []).map((a) => a.t);
    // Reset the log for the next capture so each state shows only what fired during it.
    window.__annLog = [];
    return { items, announceLog };
  });
  return { label, ...data };
}

// ---------------------------------------------------------------------------
// Drivers — one per probe, returning an array of captured states.
// ---------------------------------------------------------------------------

async function driveProbe1(page) {
  const states = [];
  await page.goto(BASE + '/probe1');
  await page.waitForLoadState('networkidle');
  await dismissOnboarding(page);
  states.push(await captureState(page, 'Probe 1 — library phase'));

  await importFirstSampleVideo(page);
  await dismissOnboarding(page);
  await page.waitForTimeout(300);
  states.push(await captureState(page, 'Probe 1 — exploring (no scene expanded)'));

  await expandScene(page, 1);
  await page.waitForTimeout(300);
  states.push(await captureState(page, 'Probe 1 — exploring (scene 1 expanded)'));

  // Open Ask AI sub-panel
  const askAI = page.getByRole('button', { name: /^Ask AI$/ }).first();
  if (await askAI.isVisible().catch(() => false)) {
    await askAI.click();
    await page.waitForTimeout(300);
    states.push(await captureState(page, 'Probe 1 — exploring (scene 1 expanded + Ask AI open)'));
  }
  return states;
}

async function driveProbe2a(page) {
  const states = [];
  await page.goto(BASE + '/probe2');
  await page.waitForLoadState('networkidle');
  await dismissOnboarding(page);
  states.push(await captureState(page, 'Probe 2a — library phase'));

  await importFirstSampleVideo(page);
  await dismissOnboarding(page);
  await page.waitForTimeout(300);
  states.push(await captureState(page, 'Probe 2a — exploring (no scene expanded)'));

  await expandScene(page, 1);
  await page.waitForTimeout(300);
  states.push(await captureState(page, 'Probe 2a — exploring (scene 1 expanded)'));

  // Open Edit by Myself sub-panel if present
  const editSelf = page
    .getByRole('button', { name: /Edit (by )?[Mm]yself|Edit Myself/ })
    .first();
  if (await editSelf.isVisible().catch(() => false)) {
    await editSelf.click();
    await page.waitForTimeout(300);
    states.push(await captureState(page, 'Probe 2a — exploring (scene 1 expanded + Edit by Myself open)'));
  }
  return states;
}

async function driveProbe2bRoleSelect(page) {
  // Single-client view of the role selector + waiting screen — pairing isn't
  // the focus here, structure is.
  await page.goto(BASE + '/probe2b');
  await page.waitForLoadState('networkidle');
  await dismissOnboarding(page);
  const s1 = await captureState(page, 'Probe 2b — role selector');

  // Click into Creator role to capture the waiting screen
  const creatorBtn = page.getByRole('button', { name: /^Creator$/ }).first();
  if (await creatorBtn.isVisible().catch(() => false)) {
    await creatorBtn.click();
    await page.waitForTimeout(500);
  }
  const s2 = await captureState(page, 'Probe 2b — creator waiting for helper');
  return [s1, s2];
}

async function driveProbe3RoleSelect(page) {
  await page.goto(BASE + '/probe3');
  await page.waitForLoadState('networkidle');
  await dismissOnboarding(page);
  const s1 = await captureState(page, 'Probe 3 — role selector');

  const creatorBtn = page.getByRole('button', { name: /^Creator$/ }).first();
  if (await creatorBtn.isVisible().catch(() => false)) {
    await creatorBtn.click();
    await page.waitForTimeout(500);
  }
  const s2 = await captureState(page, 'Probe 3 — creator waiting for helper');
  return [s1, s2];
}

// ---------------------------------------------------------------------------
// Analysis — flag duplicates / long labels / visible-aria mismatches.
// ---------------------------------------------------------------------------

function analyseState(state) {
  const findings = [];
  // Duplicate accessible names within a state — likely surfaced twice to
  // TalkBack (e.g. button text + nearby live region with the same content).
  const counts = new Map();
  for (const it of state.items) {
    const k = (it.name || '').trim();
    if (!k) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  for (const [k, n] of counts) {
    if (n > 1) findings.push({ kind: 'duplicate_name', name: k, count: n });
  }
  // Long aria-labels — TalkBack will read the full string before the action.
  for (const it of state.items) {
    if (it.ariaLabel && it.ariaLabel.length > 120) {
      findings.push({ kind: 'long_aria', name: it.ariaLabel.slice(0, 80) + '…', length: it.ariaLabel.length });
    }
  }
  // Visible text vs aria-label divergence on buttons — known dyad-coordination
  // hazard (see walkthrough M11). Surface but don't flag as a defect since the
  // current convention deliberately diverges (Lan's preference).
  for (const it of state.items) {
    if (it.role !== 'button') continue;
    if (!it.ariaLabel) continue;
    const visible = (it.text || '').trim();
    const aria = it.ariaLabel.trim();
    if (visible && aria && visible !== aria && !aria.includes(visible)) {
      findings.push({ kind: 'visible_aria_diverge', visible, aria });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const allStates = [];

await withBrowser(async ({ page }) => {
  await attachAnnounceLogger(page);
  await seedSession(page);
  for (const s of await driveProbe1(page)) allStates.push(s);
});

await withBrowser(async ({ page }) => {
  await attachAnnounceLogger(page);
  await seedSession(page);
  for (const s of await driveProbe2a(page)) allStates.push(s);
});

await withBrowser(async ({ page }) => {
  await attachAnnounceLogger(page);
  await seedSession(page);
  for (const s of await driveProbe2bRoleSelect(page)) allStates.push(s);
});

await withBrowser(async ({ page }) => {
  await attachAnnounceLogger(page);
  await seedSession(page);
  for (const s of await driveProbe3RoleSelect(page)) allStates.push(s);
});

// ---------------------------------------------------------------------------
// Render Markdown report.
// ---------------------------------------------------------------------------

function fmtItem(it) {
  const role = it.role ? `[${it.role}]` : '';
  const expanded = it.ariaExpanded ? ` aria-expanded=${it.ariaExpanded}` : '';
  const live = it.ariaLive ? ` aria-live=${it.ariaLive}` : '';
  const focus = it.focusable ? '' : ' (not-focusable)';
  if (!it.name) return `${role}${expanded}${live}${focus}`;
  return `${role}${expanded}${live}${focus} "${it.name.replace(/"/g, '\\"')}"`;
}

const lines = [];
lines.push(`# Probe TalkBack reading-order audit — ${today}`);
lines.push('');
lines.push(
  'Generated by `.claude/skills/probe-auto-test/scripts/a11y-report.mjs`. ' +
    'For each probe state we walk the DOM in TalkBack reading order, skip ' +
    'subtrees with `aria-hidden="true"` or `inert`, and list every element ' +
    'TalkBack would announce, in order. The "Live-region stream" sub-section ' +
    'records the messages written to `#sr-announcer` during the transition ' +
    'into that state — TalkBack interleaves these with focus-change reads.',
);
lines.push('');
lines.push('Severity tags used in the analysis:');
lines.push('- **DUP** — same accessible name surfaced more than once in a state.');
lines.push('- **LONG** — aria-label longer than 120 characters; the actionable verb gets buried.');
lines.push('- **DIV** — button visible text diverges from its aria-label without containing it (worth verifying intent).');
lines.push('');

for (const state of allStates) {
  lines.push(`## ${state.label}`);
  lines.push('');
  lines.push('### TalkBack reading order');
  lines.push('');
  let layer = 0;
  for (let i = 0; i < state.items.length; i++) {
    const it = state.items[i];
    const heading = it.role && /^h[1-6]$/.test(it.role);
    if (heading) layer = Number(it.role[1]);
    const indent = '  '.repeat(Math.max(0, layer - 1));
    lines.push(`${indent}${i + 1}. ${fmtItem(it)}`);
  }
  lines.push('');
  if (state.announceLog.length) {
    lines.push('### Live-region stream (announce() during transition)');
    lines.push('');
    for (const a of state.announceLog) {
      lines.push(`- "${a.replace(/"/g, '\\"')}"`);
    }
    lines.push('');
  }
  const findings = analyseState(state);
  if (findings.length) {
    lines.push('### Findings');
    lines.push('');
    for (const f of findings) {
      if (f.kind === 'duplicate_name') {
        lines.push(`- **DUP** "${f.name}" appears ${f.count}× — TalkBack will read it ${f.count}× as the user moves through.`);
      } else if (f.kind === 'long_aria') {
        lines.push(`- **LONG** aria-label is ${f.length} chars: "${f.name}"`);
      } else if (f.kind === 'visible_aria_diverge') {
        lines.push(`- **DIV** visible text "${f.visible}" vs aria-label "${f.aria}"`);
      }
    }
    lines.push('');
  } else {
    lines.push('### Findings');
    lines.push('');
    lines.push('_No structural redundancies flagged._');
    lines.push('');
  }
}

writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`Report written: ${out}  (${allStates.length} states)`);
