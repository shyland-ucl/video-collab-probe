import { useState, useCallback } from 'react';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { announce } from '../../utils/announcer.js';
import {
  splitClip,
  moveClip,
  addCaption,
  deleteClip,
  getClipForScene,
  getCaptionsForScene,
} from '../../utils/sceneEditOps.js';

/**
 * Scene-block-scoped self-edit panel for BLV creators. Shared by Probe 2a and
 * Probe 2b creator pages so the affordances stay identical between conditions.
 *
 * Operations: Remove, Split (at playhead or midpoint), Move earlier/later,
 * Add caption, Undo. Trim/Add note are intentionally absent — Trim needs
 * sub-second visual scrubbing; Add note has no consumer in 2a/2b.
 */
export default function EditByMyselfPanel({
  scene,
  index,
  currentTime,
  editState,
  onEditChange,
  onEditSelf,
  isKept,
  onKeepDiscardClick,
  onUndoEdit,
  canUndoEdit,
  logEvent,
}) {
  const [openSection, setOpenSection] = useState(null);
  const [captionText, setCaptionText] = useState('');

  const clip = getClipForScene(editState, scene.id);
  const captions = getCaptionsForScene(editState, scene.id);
  const editsAvailable = !!editState && !!clip && typeof onEditChange === 'function';
  const clipCountForScene = (editState?.clips || []).filter(
    (c) => c.id === scene.id || (typeof c.id === 'string' && c.id.startsWith(`${scene.id}-split-`))
  ).length || 1;

  const apply = useCallback((mutator, eventName, payload) => {
    if (!editsAvailable) return;
    const next = mutator(editState);
    if (next === editState) return;
    onEditChange(next.clips, next.captions, next.sources, next.textOverlays);
    if (logEvent) {
      logEvent(EventTypes.EDIT_ACTION, Actors.CREATOR, { action: eventName, segmentId: scene.id, ...payload });
    }
    if (onEditSelf) onEditSelf(scene, eventName);
  }, [editsAvailable, editState, onEditChange, logEvent, onEditSelf, scene]);

  return (
    <div className="mt-2 p-3 bg-gray-50 rounded-lg space-y-2">
      {/* Remove deletes the clip from editState (not a soft kept-flag), so
          the change broadcasts to the peer via EDIT_STATE_UPDATE and the
          helper's timeline + playback both lose the clip. Restoration is
          via the Undo button at the bottom of this panel. */}
      <button
        onClick={() => {
          apply((s) => deleteClip(s, scene.id), 'remove', {});
          announce(`Scene ${index + 1} removed from the edit.`);
        }}
        disabled={!editsAvailable}
        className="w-full py-3 text-sm rounded font-medium bg-red-100 text-red-800 hover:bg-red-200 disabled:opacity-50 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
        style={{ minHeight: '48px' }}
        aria-label={`Remove scene ${index + 1} from the edit. Use Undo to bring it back.`}
      >
        Remove this scene
      </button>

      {!editsAvailable && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2" role="status">
          Editing tools become available once the project is loaded.
        </p>
      )}

      <div role="group" aria-label={`Edit operations for scene ${index + 1}`} className="space-y-2">
        <Section
          label={`Split${clipCountForScene > 1 ? ` (${clipCountForScene} clips)` : ''}`}
          open={openSection === 'split'}
          onToggle={() => setOpenSection((v) => (v === 'split' ? null : 'split'))}
          ariaPrefix="Split"
        >
          <p className="text-sm text-gray-600 mb-2">
            Splits this scene into two clips at the current playback time, or at
            the midpoint if the video isn't playing. Pair with Remove to drop
            part of a scene.
          </p>
          <p
            className="text-xs text-gray-500 mb-2"
            data-clip-count-for={scene.id}
            aria-label={`This scene currently has ${clipCountForScene} clip${clipCountForScene === 1 ? '' : 's'}.`}
          >
            This scene currently has {clipCountForScene} clip{clipCountForScene === 1 ? '' : 's'}.
          </p>
          <button
            onClick={() => {
              const at = (clip && currentTime > clip.startTime && currentTime < clip.endTime) ? currentTime : null;
              apply((s) => splitClip(s, scene.id, at), 'split', { splitAt: at ?? 'midpoint' });
              announce(`Scene ${index + 1} split into two clips.`);
            }}
            disabled={!editsAvailable}
            className="w-full py-2 text-sm font-medium rounded bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
            style={{ minHeight: '44px' }}
          >
            Split here
          </button>
        </Section>

        <Section
          label="Move"
          open={openSection === 'move'}
          onToggle={() => setOpenSection((v) => (v === 'move' ? null : 'move'))}
          ariaPrefix="Move"
        >
          <p className="text-sm text-gray-600 mb-2">Reorder this clip in the timeline.</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { apply((s) => moveClip(s, scene.id, 'up'), 'move_earlier', {}); announce(`Scene ${index + 1} moved earlier.`); }}
              disabled={!editsAvailable || index === 0}
              className="py-2 text-sm font-medium rounded bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
              style={{ minHeight: '44px' }}
              aria-label={`Move scene ${index + 1} earlier`}
            >
              Move earlier
            </button>
            <button
              onClick={() => { apply((s) => moveClip(s, scene.id, 'down'), 'move_later', {}); announce(`Scene ${index + 1} moved later.`); }}
              disabled={!editsAvailable}
              className="py-2 text-sm font-medium rounded bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
              style={{ minHeight: '44px' }}
              aria-label={`Move scene ${index + 1} later`}
            >
              Move later
            </button>
          </div>
        </Section>

        <Section
          label={`Add caption${captions.length ? ` (${captions.length})` : ''}`}
          open={openSection === 'caption'}
          onToggle={() => setOpenSection((v) => (v === 'caption' ? null : 'caption'))}
          ariaPrefix="Add caption"
        >
          {captions.length > 0 && (
            <ul className="mb-2 text-sm text-gray-700 space-y-1" aria-label={`Existing captions on scene ${index + 1}`}>
              {captions.map((c) => (
                <li key={c.id} className="bg-white border border-gray-200 rounded px-2 py-1">{c.text}</li>
              ))}
            </ul>
          )}
          <label htmlFor={`caption-input-${scene.id}`} className="sr-only">Caption text</label>
          <textarea
            id={`caption-input-${scene.id}`}
            value={captionText}
            onChange={(e) => setCaptionText(e.target.value)}
            rows={2}
            placeholder="Caption text"
            className="w-full px-3 py-2 text-base border border-gray-300 rounded focus:outline-2 focus:outline-blue-500"
          />
          <button
            onClick={() => {
              apply((s) => addCaption(s, scene.id, captionText), 'add_caption', { text: captionText.trim() });
              announce(`Caption added to scene ${index + 1}.`);
              setCaptionText('');
            }}
            disabled={!editsAvailable || !captionText.trim()}
            className="w-full mt-2 py-2 text-sm font-medium rounded bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
            style={{ minHeight: '44px' }}
          >
            Add caption
          </button>
        </Section>
      </div>

      <button
        onClick={() => {
          if (typeof onUndoEdit === 'function') onUndoEdit();
        }}
        disabled={!canUndoEdit}
        className="w-full py-2 text-sm font-medium rounded bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
        style={{ minHeight: '44px' }}
        aria-label="Undo last edit"
      >
        Undo last edit
      </button>
    </div>
  );
}

function Section({ label, open, onToggle, ariaPrefix, children }) {
  return (
    <div className="border border-gray-200 rounded-md bg-white overflow-hidden">
      <button
        onClick={onToggle}
        aria-label={`${ariaPrefix}, ${open ? 'collapse' : 'expand'} controls`}
        className="w-full px-3 py-2 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
        style={{ minHeight: '44px' }}
      >
        {open ? '▾' : '▸'} {label}
      </button>
      {open && <div className="px-3 py-2 border-t border-gray-200">{children}</div>}
    </div>
  );
}
