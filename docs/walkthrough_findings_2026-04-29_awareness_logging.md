# Awareness Logging — AWARENESS_VIEWED Instrumentation (2026-04-29)

## Summary
Wired up the previously-defined-but-never-emitted `AWARENESS_VIEWED` event
(`src/utils/eventTypes.js:135`) so RQ2 can distinguish *availability* of
the awareness layer from *engagement* with it. Each individual awareness
entry on Probes 2b and 3 now fires `AWARENESS_VIEWED` when the participant
focuses or taps it, debounced per element-instance.

The previous behaviour — auto-firing once on scene-block expand — was
removed: it captured availability, not engagement. Availability is already
captured by `EDIT_STATE_UPDATE` broadcasts.

## Where instrumentation lives
- **`src/components/shared/SceneBlock.jsx`** — the awareness section
  (helper activity status, action log entries, task status badge). Each
  entry is independently focusable (`tabIndex={0}`, `role="article"` on
  log entries) and fires on focus + tap.
- **`src/components/probe3/ActivityFeed.jsx`** — every task / suggestion /
  AI-edit item, plus every line in the Creator Activity ribbon at the
  bottom.
- **`src/components/probe3/WorkspaceAwareness.jsx`** — every activity row
  (component is currently defined but not mounted; instrumentation is in
  place for when it is).

`SceneBlock` does **not** import `EventLoggerContext`. It accepts an
`onAwarenessViewed` callback prop so the page (which knows the viewing
role) controls actor attribution. `SceneBlockList`, `ActivityFeed`,
`WorkspaceAwareness`, and `DecoupledHelperDevice` all forward the prop.

## Page wiring
Both `Probe2bPage.jsx` and `Probe3Page.jsx` define a single
`handleAwarenessViewed` callback that resolves the viewer role from page
state and calls `logEvent(EventTypes.AWARENESS_VIEWED, viewerActor,
payload)`.

- Creator branch → passes `handleAwarenessViewed` to `SceneBlockList`.
- Helper branch → passes `handleAwarenessViewed` to `DecoupledHelperDevice`,
  which forwards it to `ActivityFeed`. (`HelperDevice` in Probe 3 spreads
  props through to `DecoupledHelperDevice`, so the same wiring covers
  both probes' helper devices.)

## Payload schema
The standard `actor` field is the **viewer's** role (the device emitting
the event). The original entry's actor lives inside the payload as
`entry_actor`.

| Field | Values / type | Applies to |
|---|---|---|
| `element` | `'action_log_entry'` \| `'helper_activity'` \| `'task_status'` \| `'activity_feed_entry'` \| `'workspace_awareness'` | all |
| `scene_id` | string (segment id) | when the signal sits on a scene |
| `entry_actor` | `'CREATOR'` \| `'HELPER'` \| `'AI'` | `action_log_entry`, `activity_feed_entry`, `workspace_awareness` |
| `entry_description` | string, truncated to 120 chars | `action_log_entry`, `activity_feed_entry`, `workspace_awareness` |
| `task_status_value` | `'Sent'` \| `'Seen'` \| `'In Progress'` \| `'Done'` | `task_status` |
| `trigger` | `'focus'` \| `'tap'` | all |

`ActivityFeed` items map to `entry_actor` based on visible label:
`helper_task` → `'CREATOR'` (the visible "From Creator" tag);
`suggestion_task` and `ai_edit` → `'AI'`.

## Debounce
Each instrumented component owns a `useRef(new Map())` keyed by a stable
identifier (`${scene_id}:${element}:${index}:${trigger}` for SceneBlock,
analogous in the others) with a 1500 ms cooldown. A TalkBack swipe
sweeping back and forth across the same entry will produce a few
well-spaced events, not a flood. Focus and tap have separate cooldown
entries so a tap immediately after focus still registers.

## What was *not* changed
- The event type name remains `AWARENESS_VIEWED`. No new event types
  were added.
- `EDIT_STATE_UPDATE` broadcasts (which carry availability) are
  untouched.
- The auto-fire-on-render behaviour was deliberately removed; the spec
  is explicit that engagement, not availability, is what we want.
- Wrapper containers (e.g. the awareness `<div>`, the activity-feed root)
  do not have listeners. Only individual entries do, so element-level
  engagement is captured cleanly.
- The visible "Play from here"/"Pause" wording, focus restoration, and
  `announce()` patterns from `feedback_scene_block_a11y.md` are
  preserved.

## Verification — pilot checklist
For the human researcher running the Friday pilot:

- [ ] Probe 2b creator (TalkBack on): swipe to an action-log entry under
  an expanded scene → an `AWARENESS_VIEWED` event appears in the
  researcher dashboard with `actor: 'CREATOR'`, `element:
  'action_log_entry'`, `entry_actor: 'HELPER'`, `trigger: 'focus'`.
- [ ] Probe 2b creator: tap the same entry → second event with
  `trigger: 'tap'`. Tap it twice within 1.5 s → only one event logged
  (debounce).
- [ ] Probe 2b creator: focus and then tap the helper activity
  status → events with `element: 'helper_activity'`.
- [ ] Probe 2b creator: focus and then tap the task status badge →
  events with `element: 'task_status'` and `task_status_value` set.
- [ ] Probe 2b helper: with a creator-sent task in the activity feed,
  focus and tap it → events with `actor: 'HELPER'`, `element:
  'activity_feed_entry'`, `entry_actor: 'CREATOR'`.
- [ ] Probe 3 creator: same checks as Probe 2b for the SceneBlock
  awareness section.
- [ ] Probe 3 helper: AI-routed and task feed items both fire
  `activity_feed_entry` events with the correct `entry_actor`.
- [ ] No `AWARENESS_VIEWED` events appear from simply expanding a scene
  block (no auto-fire).

## Caveats
- The action-log row is currently inside an outer `<button>` (the scene
  header is a button at `SceneBlock.jsx:118`). React allows nesting of
  focusable elements via `tabIndex={0}`, but if a future regression
  surfaces around bubbled clicks (e.g. tapping an action-log entry also
  triggers the scene-header button), the fix is to add
  `e.stopPropagation()` inside the entry's `onClick`. Current testing
  on desktop did not surface this, but TalkBack semantics may differ.
- `WorkspaceAwareness` is not mounted by any page yet. The
  instrumentation is in place so that when it *is* mounted, it will
  emit events without further wiring.
- The activity-feed item's outer `onClick` will also fire when a user
  taps the inner action buttons (Mark Done, Review, etc.) due to event
  bubbling. This is intentional: tapping a button on an entry counts
  as engagement with the entry. If the analyst wants to separate
  engagement-with-entry from engagement-with-action, they can filter on
  the existing per-action events (`HELPER_TASK_STATUS`, `AI_EDIT_REVIEWED`,
  etc.) which still fire alongside.
