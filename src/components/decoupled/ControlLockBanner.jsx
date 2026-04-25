import { useCallback } from 'react';

/**
 * Visible control-lock banner for decoupled probes (2b, 3).
 *
 * Implements M6 from the 2026-04-25 walkthrough findings: previously both
 * creator and helper could mutate editState concurrently, with last-write-
 * wins clobbering each other. The role descriptions claimed the helper
 * "can request control" but no such affordance existed.
 *
 * This banner surfaces who currently holds control of the project edits
 * and provides a "Take control" button so either side can become the
 * active editor. Control changes are broadcast via WebSocket so both
 * devices see the same state.
 *
 * The banner is informational *and* gating: handleEditChange in
 * Probe2bPage / Probe3Page refuses to broadcast EDIT_STATE_UPDATE when the
 * caller is not the current control owner, so even if both sides have
 * editor UIs visible, only one side's mutations propagate. The non-owner
 * sees a brief explanatory announcement when they try to edit.
 */
export default function ControlLockBanner({
  role,
  controlOwner,
  onTakeControl,
  accentColor = '#5CB85C',
}) {
  const hasControl = controlOwner === role;
  const otherRole = role === 'creator' ? 'helper' : 'creator';
  const ownerName = controlOwner === role ? 'You' : (controlOwner || otherRole);

  const handleTake = useCallback(() => {
    if (hasControl) return;
    onTakeControl?.();
  }, [hasControl, onTakeControl]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-3 mb-2 px-3 py-2 rounded-lg border-2 flex items-center gap-3"
      style={{
        borderColor: hasControl ? accentColor : '#9CA3AF',
        backgroundColor: hasControl ? `${accentColor}15` : '#F3F4F6',
      }}
    >
      <span
        className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: hasControl ? accentColor : '#9CA3AF' }}
        aria-hidden="true"
      />
      <p className="text-sm font-medium text-gray-800 flex-1">
        {hasControl
          ? 'You have control of the edits.'
          : `${ownerName === 'You' ? 'You' : ownerName.charAt(0).toUpperCase() + ownerName.slice(1)} has control of the edits.`}
      </p>
      {!hasControl && (
        <button
          onClick={handleTake}
          className="px-3 py-1.5 rounded text-sm font-bold text-white focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ backgroundColor: accentColor, minHeight: '36px' }}
          aria-label="Take control of the edits"
        >
          Take control
        </button>
      )}
    </div>
  );
}
