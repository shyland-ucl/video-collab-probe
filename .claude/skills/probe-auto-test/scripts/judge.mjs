// Heuristic accessibility judge for interaction traces.
//
// Inspired by TaskAudit's "functiona11ity errors" taxonomy
// (Tan et al., 2025, https://arxiv.org/abs/2510.12972) and ScreenAudit's
// semantic-rather-than-syntactic philosophy
// (Salehnamadi et al., 2025, https://arxiv.org/abs/2504.02110).
//
// We don't run an LLM here — every check is a deterministic rule
// applied to the (before, action, after, events) tuple from
// lib-trace.runStep. That keeps the judge fast, explainable, and
// reviewable. If you want a richer semantic check, add an optional
// `--llm` mode later that posts the trace to Claude with a rubric.
//
// Severity tags (matching the docs/probe_a11y_findings_*.md convention):
//   B (Blocker)  — user cannot complete the task without sighted help.
//   M (Major)    — user can complete the task but with significant
//                  confusion or extra steps.
//   m (minor)    — polish; flag for awareness.

const TALKBACK_REREADS_AFTER_ACTIVATION = true; // documented Android behaviour

/**
 * @param {{step: string, expect?: object, before, after, events: any[], threw?: string}} record
 * @returns {{severity: 'B'|'M'|'m', code: string, message: string}[]}
 */
export function judgeStep(record) {
  const findings = [];
  if (record.threw) {
    findings.push({ severity: 'B', code: 'STEP_THREW',
      message: `Step "${record.step}" threw before any feedback could be observed: ${record.threw}` });
    return findings;
  }

  const announces = (record.events || []).filter((e) => e.kind === 'announce');
  const focusEvents = (record.events || []).filter((e) => e.kind === 'focus');
  const expect = record.expect || {};

  // ---- B-class: silent activation (no SR feedback at all) ----
  // If the user activated something and the focused element didn't
  // change AND no announce fired, the screen reader user has no
  // evidence anything happened. This is exactly the
  // "Detail level changed but TalkBack stayed silent" bug we hit.
  const focusChanged = !sameElement(record.before, record.after);
  if (expect.kind === 'activation' && !focusChanged && announces.length === 0) {
    findings.push({ severity: 'B', code: 'SILENT_ACTIVATION',
      message: `Step "${record.step}" produced no audible feedback (no focus change, no announce). Screen reader user has no signal that anything happened.` });
  }

  // ---- M-class: focus moved to body / off-page ----
  // After an action, the focused element should still be a real,
  // labelled element. If activeElement collapses to <body>, focus was
  // yanked — usually because the focused element became `disabled` or
  // was unmounted.
  if (focusChanged && record.after === null && record.before !== null) {
    findings.push({ severity: 'M', code: 'FOCUS_LOST_TO_BODY',
      message: `Step "${record.step}" lost focus to the body. Most likely cause: the focused element became disabled or was unmounted after activation.` });
  }

  // ---- M-class: announce only fired into polite region after a
  // state change that would also re-focus the activated control.
  // On Android TalkBack the polite update is dropped in favour of the
  // re-read — assertive is required for reliable feedback. ----
  if (TALKBACK_REREADS_AFTER_ACTIVATION
      && expect.kind === 'activation'
      && announces.length > 0
      && announces.every((a) => a.region === 'polite')) {
    findings.push({ severity: 'M', code: 'ANDROID_POLITE_DROP_RISK',
      message: `Step "${record.step}" only wrote to the polite live region. Android TalkBack often drops polite updates that arrive during a button-activation re-read. Use { assertive: true } or move focus.` });
  }

  // ---- M-class: expected text not heard ----
  // If the journey author specified expect.utterance, verify some
  // announce contained it (case-insensitive substring) OR the new
  // focused element's accessible name contains it.
  if (expect.utterance) {
    const want = String(expect.utterance).toLowerCase();
    const heard = [
      ...announces.map((a) => a.text || ''),
      record.after?.ariaLabel || '',
      record.after?.text || '',
    ].some((t) => t.toLowerCase().includes(want));
    if (!heard) {
      findings.push({ severity: 'M', code: 'EXPECTED_UTTERANCE_MISSING',
        message: `Step "${record.step}" expected "${expect.utterance}" in any announce or focused name, but neither was found.` });
    }
  }

  // ---- m-class: announce text duplicates the focused element name ----
  // A common over-announce pattern. If the just-focused element's
  // aria-label is fully contained in the announce, the SR user hears
  // the same content twice.
  const focusedName = (record.after?.ariaLabel || record.after?.text || '').toLowerCase().trim();
  if (focusedName && announces.length > 0) {
    const dup = announces.find((a) => (a.text || '').toLowerCase().includes(focusedName) && focusedName.length > 8);
    if (dup) {
      findings.push({ severity: 'm', code: 'ANNOUNCE_DUPLICATES_FOCUS',
        message: `Step "${record.step}" wrote "${dup.text.slice(0, 80)}..." to the live region while focus is on "${focusedName.slice(0, 60)}...". Likely double-read.` });
    }
  }

  // ---- m-class: focused element off-screen after action ----
  if (record.after && record.after.visible === false) {
    findings.push({ severity: 'm', code: 'FOCUS_OFFSCREEN',
      message: `Step "${record.step}" left focus on an element that is outside the viewport. Sighted helpers may not see it.` });
  }

  return findings;
}

function sameElement(a, b) {
  if (a === null && b === null) return true;
  if (!a || !b) return false;
  return a.tag === b.tag && a.ariaLabel === b.ariaLabel && a.text === b.text;
}

/** Aggregate findings across a whole trace. */
export function judgeTrace(trace) {
  const all = [];
  for (const record of trace) {
    for (const f of judgeStep(record)) {
      all.push({ step: record.step, ...f });
    }
  }
  return all;
}

/** Render a trace + findings as a markdown report. */
export function renderReport({ probe, trace, findings }) {
  const lines = [];
  lines.push(`# Task-audit report — ${probe}`);
  lines.push('');
  lines.push(`Generated by \`.claude/skills/probe-auto-test/scripts/task-audit.mjs\`.`);
  lines.push('');
  lines.push('Methodology adapted from ScreenAudit (arXiv:2504.02110) and');
  lines.push('TaskAudit (arXiv:2510.12972). Each step records the focused');
  lines.push('element before/after the action plus every live-region write');
  lines.push('that landed in between. The judge flags "functiona11ity');
  lines.push('errors" — accessibility gaps that only manifest *during*');
  lines.push('interaction and would be invisible to a static AT-tree dump.');
  lines.push('');
  lines.push('## Findings');
  lines.push('');
  if (findings.length === 0) {
    lines.push('_No findings._');
  } else {
    const order = { B: 0, M: 1, m: 2 };
    const sorted = [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
    for (const f of sorted) {
      lines.push(`- **${f.severity} \`${f.code}\`** — ${f.message}`);
    }
  }
  lines.push('');
  lines.push('## Trace');
  lines.push('');
  for (const r of trace) {
    lines.push(`### ${r.step}`);
    if (r.expect) lines.push(`- expect: ${JSON.stringify(r.expect)}`);
    lines.push(`- before: ${r.before ? `${r.before.tag} \`${r.before.ariaLabel || r.before.text || ''}\`` : '(none)'}`);
    lines.push(`- after:  ${r.after ? `${r.after.tag} \`${r.after.ariaLabel || r.after.text || ''}\`` : '(none)'}`);
    if (r.events?.length) {
      lines.push(`- events:`);
      for (const e of r.events) {
        if (e.kind === 'announce') lines.push(`  - announce[${e.region}]: "${(e.text || '').slice(0, 160)}"`);
        else if (e.kind === 'focus') lines.push(`  - focus → ${e.tag} \`${e.ariaLabel || e.text || ''}\``);
      }
    } else {
      lines.push(`- events: (none)`);
    }
    if (r.threw) lines.push(`- threw: ${r.threw}`);
    lines.push('');
  }
  return lines.join('\n');
}
