import { useState, useCallback } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { announce } from '../../utils/announcer.js';
import InlineVQAComposer from '../shared/InlineVQAComposer.jsx';
import DetailLevelSelector from '../shared/DetailLevelSelector.jsx';
import TaskRouterPanel from '../shared/TaskRouterPanel.jsx';
import { playEarcon } from '../../utils/earcon.js';
import {
  trimClipStart,
  trimClipEnd,
  splitClip,
  moveClip,
  addCaption,
  addNote,
  getClipForScene,
  getCaptionsForScene,
  getNotesForScene,
} from '../../utils/sceneEditOps.js';

export default function Probe2aSceneActions({
  scene,
  index,
  playerRef,
  currentTime,
  isPlaying,
  onSeek,
  onPlay,
  onPause,
  onAskAI,
  onAskAIEdit,
  onHandover,
  onEditSelf,
  isKept = true,
  onToggleKeep,
  currentLevel,
  onLevelChange,
  accentColor = '#5CB85C',
  // B2: edit ops require live editState + a setter callback so the buttons
  // can produce visible mutations instead of being placeholders.
  editState = null,
  onEditChange,
}) {
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [showIntentLocker, setShowIntentLocker] = useState(false);
  const [showAskAI, setShowAskAI] = useState(false);
  const [showAskAIEdit, setShowAskAIEdit] = useState(false);
  const [aiEditPending, setAiEditPending] = useState(false);
  const [aiProposal, setAiProposal] = useState(null);
  const [thinking, setThinking] = useState(false);
  const { logEvent } = useEventLogger();

  const handlePlaySegment = useCallback(() => {
    if (onSeek) onSeek(scene.start_time);
    if (onPlay) onPlay();
    announce(`Playing scene ${index + 1}.`);
  }, [scene, index, onSeek, onPlay]);

  const handlePauseSegment = useCallback(() => {
    if (onPause) onPause();
  }, [onPause]);

  const isSegmentPlaying =
    isPlaying && currentTime >= scene.start_time && currentTime < scene.end_time;

  // VQA
  const handleAskAI = useCallback(
    async (question) => {
      setThinking(true);
      logEvent(EventTypes.VQA_QUESTION, Actors.CREATOR, { question, segmentId: scene.id });
      if (onAskAI) await onAskAI(question, scene);
      setThinking(false);
    },
    [scene, onAskAI, logEvent]
  );

  // AI edit
  const handleAskAIEdit = useCallback(
    async (instruction) => {
      setAiEditPending(true);
      logEvent(EventTypes.TASK_ROUTE_AI, Actors.CREATOR, { instruction, segmentId: scene.id });
      if (onAskAIEdit) {
        const proposal = await onAskAIEdit(instruction, scene);
        setAiProposal(proposal);
      }
      setAiEditPending(false);
    },
    [scene, onAskAIEdit, logEvent]
  );

  const handleAcceptAIEdit = useCallback(() => {
    logEvent(EventTypes.AI_EDIT_ACCEPTED, Actors.CREATOR, { segmentId: scene.id, proposal: aiProposal });
    if (onEditSelf && aiProposal?.operation) onEditSelf(scene, aiProposal.operation);
    setAiProposal(null);
    announce('AI edit accepted.');
  }, [scene, aiProposal, logEvent, onEditSelf]);

  const handleCancelAIEdit = useCallback(() => {
    logEvent(EventTypes.AI_EDIT_CANCELLED, Actors.CREATOR, { segmentId: scene.id });
    setAiProposal(null);
    announce('AI edit cancelled.');
  }, [scene, logEvent]);

  // Self-edit actions
  const handleKeepDiscard = useCallback(() => {
    const newKept = !isKept;
    logEvent(newKept ? EventTypes.KEEP_SCENE : EventTypes.DISCARD_SCENE, Actors.CREATOR, { segmentId: scene.id });
    if (onToggleKeep) onToggleKeep(scene.id);
    announce(newKept ? `Scene ${index + 1} kept.` : `Scene ${index + 1} marked for removal.`);
  }, [scene, index, isKept, logEvent, onToggleKeep]);

  const handleSelfEdit = useCallback(
    (action) => {
      logEvent(EventTypes.EDIT_ACTION, Actors.CREATOR, { action, segmentId: scene.id, currentTime });
      if (onEditSelf) onEditSelf(scene, action);
      announce(`${action} on scene ${index + 1}.`);
    },
    [scene, index, currentTime, logEvent, onEditSelf]
  );

  return (
    <>
      {/* Detail level selector */}
      <DetailLevelSelector currentLevel={currentLevel} onLevelChange={onLevelChange} />

      {/* Play / Pause */}
      <button
        onClick={isSegmentPlaying ? handlePauseSegment : handlePlaySegment}
        className="w-full py-3 text-sm font-medium rounded bg-gray-100 hover:bg-gray-200 text-gray-800 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
        style={{ minHeight: '48px' }}
        aria-label={isSegmentPlaying ? `Pause scene ${index + 1}` : `Play scene ${index + 1}`}
      >
        {isSegmentPlaying ? 'Pause' : 'Play from here'}
      </button>

      {/* Ask AI (VQA) — toggle */}
      <div>
        <button
          onClick={() => setShowAskAI(!showAskAI)}
          aria-expanded={showAskAI}
          className="w-full py-3 text-sm font-medium rounded bg-gray-100 hover:bg-gray-200 text-gray-800 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ minHeight: '48px' }}
        >
          {showAskAI ? 'Close Ask AI' : 'Ask AI about Scene'}
        </button>
        {showAskAI && (
          <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <InlineVQAComposer onSubmit={handleAskAI} disabled={thinking} accentColor={accentColor} />
            {thinking && <p className="text-sm text-gray-700 italic mt-1" role="status">Thinking...</p>}
          </div>
        )}
      </div>

      {/* Edit by myself */}
      <div>
        <button
          onClick={() => setShowEditPanel(!showEditPanel)}
          aria-expanded={showEditPanel}
          className="w-full py-3 text-sm font-medium rounded bg-gray-100 hover:bg-gray-200 text-gray-800 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ minHeight: '48px' }}
        >
          {showEditPanel ? 'Hide Edit Options' : 'Edit by Myself'}
        </button>
        {showEditPanel && (
          <EditByMyselfPanel
            scene={scene}
            index={index}
            currentTime={currentTime}
            editState={editState}
            onEditChange={onEditChange}
            onEditSelf={onEditSelf}
            isKept={isKept}
            onKeepDiscardClick={handleKeepDiscard}
            logEvent={logEvent}
          />
        )}
      </div>

      {/* Ask AI to edit — toggle */}
      <div>
        <button
          onClick={() => setShowAskAIEdit(!showAskAIEdit)}
          aria-expanded={showAskAIEdit}
          className="w-full py-3 text-sm font-medium rounded bg-gray-100 hover:bg-gray-200 text-gray-800 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ minHeight: '48px' }}
        >
          {showAskAIEdit ? 'Close AI Edit' : 'Ask AI to Edit'}
        </button>
        {showAskAIEdit && (
          <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <InlineVQAComposer onSubmit={handleAskAIEdit} disabled={aiEditPending} accentColor={accentColor} />
            {aiEditPending && <p className="text-sm text-gray-700 italic mt-1" role="status">AI is working...</p>}
            {aiProposal && (
              <div className="mt-2 p-3 border-2 rounded-lg bg-yellow-50 border-yellow-300" role="alert">
                <p className="text-sm font-medium text-yellow-800 mb-2">
                  AI proposes: {aiProposal.description || aiProposal.text}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleAcceptAIEdit}
                    className="flex-1 py-2 text-sm font-medium rounded bg-green-600 text-white hover:bg-green-700 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
                    style={{ minHeight: '44px' }}
                    aria-label="Accept AI edit proposal"
                  >
                    Accept
                  </button>
                  <button
                    onClick={handleCancelAIEdit}
                    className="flex-1 py-2 text-sm font-medium rounded bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
                    style={{ minHeight: '44px' }}
                    aria-label="Cancel AI edit proposal"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Ask Helper (Intent Locker) */}
      <div>
        <button
          onClick={() => setShowIntentLocker(!showIntentLocker)}
          aria-expanded={showIntentLocker}
          className="w-full py-3 text-sm font-medium rounded text-white transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ backgroundColor: accentColor, minHeight: '48px' }}
        >
          {showIntentLocker ? 'Cancel Handover' : 'Ask Helper'}
        </button>
        {showIntentLocker && (
          <TaskRouterPanel
            idPrefix="intent-2a"
            submitLabel="Hand Over"
            accentColor="#D9534F"
            onSubmit={({ instruction, category, priority }) => {
              playEarcon(660, 150);
              logEvent(EventTypes.INTENT_LOCKED, Actors.CREATOR, {
                segmentId: scene.id, instruction, category, priority,
              });
              if (onHandover) {
                onHandover({ segmentId: scene.id, segmentName: scene.name, instruction, category, priority });
              }
              setShowIntentLocker(false);
            }}
          />
        )}
      </div>
    </>
  );
}

/**
 * EditByMyselfPanel — real (non-placeholder) self-edit operations for B2.
 * Renders Keep/Discard at the top (passes through to parent), then five
 * collapsible sub-panels for Trim, Split, Move, Add Caption, Add Note. Each
 * mutates editState via onEditChange (which broadcasts to the helper in
 * Probe 2a's handover flow once the device is handed over).
 */
function EditByMyselfPanel({
  scene,
  index,
  currentTime,
  editState,
  onEditChange,
  onEditSelf,
  isKept,
  onKeepDiscardClick,
  logEvent,
}) {
  const [openSection, setOpenSection] = useState(null);
  const [captionText, setCaptionText] = useState('');
  const [noteText, setNoteText] = useState('');

  const clip = getClipForScene(editState, scene.id);
  const captions = getCaptionsForScene(editState, scene.id);
  const notes = getNotesForScene(editState, scene.id);
  const editsAvailable = !!editState && !!clip && typeof onEditChange === 'function';

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

  const trimStart = clip?.trimStart || 0;
  const trimEnd = clip?.trimEnd || 0;

  return (
    <div className="mt-2 p-3 bg-gray-50 rounded-lg space-y-2">
      <button
        onClick={onKeepDiscardClick}
        className={`w-full py-2 text-sm rounded font-medium transition-colors ${
          isKept ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-red-100 text-red-800 hover:bg-red-200'
        }`}
        style={{ minHeight: '44px' }}
        aria-label={isKept ? `Scene ${index + 1}: kept. Tap to discard` : `Scene ${index + 1}: discarded. Tap to keep`}
        aria-pressed={!isKept}
      >
        {isKept ? 'Keep (tap to discard)' : 'Discarded (tap to keep)'}
      </button>

      {!editsAvailable && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2" role="status">
          Editing tools become available once the project is loaded.
        </p>
      )}

      {/* Trim */}
      <Section
        label="Trim"
        open={openSection === 'trim'}
        onToggle={() => setOpenSection((v) => (v === 'trim' ? null : 'trim'))}
        ariaPrefix={`Trim scene ${index + 1}`}
      >
        <p className="text-sm text-gray-600 mb-2">
          Trimmed from start: {trimStart.toFixed(1)}s · from end: {trimEnd.toFixed(1)}s
        </p>
        <div className="grid grid-cols-2 gap-2">
          <TrimButton onClick={() => apply((s) => trimClipStart(s, scene.id, +1), 'trim_start_more', { trimStart: trimStart + 0.5 })} disabled={!editsAvailable} label="Trim start +0.5s" />
          <TrimButton onClick={() => apply((s) => trimClipStart(s, scene.id, -1), 'trim_start_less', { trimStart: Math.max(0, trimStart - 0.5) })} disabled={!editsAvailable || trimStart === 0} label="Trim start −0.5s" />
          <TrimButton onClick={() => apply((s) => trimClipEnd(s, scene.id, +1), 'trim_end_more', { trimEnd: trimEnd + 0.5 })} disabled={!editsAvailable} label="Trim end +0.5s" />
          <TrimButton onClick={() => apply((s) => trimClipEnd(s, scene.id, -1), 'trim_end_less', { trimEnd: Math.max(0, trimEnd - 0.5) })} disabled={!editsAvailable || trimEnd === 0} label="Trim end −0.5s" />
        </div>
      </Section>

      {/* Split */}
      <Section
        label="Split"
        open={openSection === 'split'}
        onToggle={() => setOpenSection((v) => (v === 'split' ? null : 'split'))}
        ariaPrefix={`Split scene ${index + 1}`}
      >
        <p className="text-sm text-gray-600 mb-2">
          Splits this scene into two clips at the current playback time, or at
          the midpoint if the video isn't playing.
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

      {/* Move */}
      <Section
        label="Move"
        open={openSection === 'move'}
        onToggle={() => setOpenSection((v) => (v === 'move' ? null : 'move'))}
        ariaPrefix={`Move scene ${index + 1}`}
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

      {/* Add Caption */}
      <Section
        label={`Add caption${captions.length ? ` (${captions.length})` : ''}`}
        open={openSection === 'caption'}
        onToggle={() => setOpenSection((v) => (v === 'caption' ? null : 'caption'))}
        ariaPrefix={`Add caption to scene ${index + 1}`}
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

      {/* Add Note */}
      <Section
        label={`Add note${notes.length ? ` (${notes.length})` : ''}`}
        open={openSection === 'note'}
        onToggle={() => setOpenSection((v) => (v === 'note' ? null : 'note'))}
        ariaPrefix={`Add note to scene ${index + 1}`}
      >
        {notes.length > 0 && (
          <ul className="mb-2 text-sm text-gray-700 space-y-1" aria-label={`Existing notes on scene ${index + 1}`}>
            {notes.map((n) => (
              <li key={n.id} className="bg-white border border-gray-200 rounded px-2 py-1">{n.text}</li>
            ))}
          </ul>
        )}
        <label htmlFor={`note-input-${scene.id}`} className="sr-only">Note text (only you and the helper see this)</label>
        <textarea
          id={`note-input-${scene.id}`}
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={2}
          placeholder="Note text (only you and the helper see this)"
          className="w-full px-3 py-2 text-base border border-gray-300 rounded focus:outline-2 focus:outline-blue-500"
        />
        <button
          onClick={() => {
            apply((s) => addNote(s, scene.id, noteText), 'add_note', { text: noteText.trim() });
            announce(`Note added to scene ${index + 1}.`);
            setNoteText('');
          }}
          disabled={!editsAvailable || !noteText.trim()}
          className="w-full mt-2 py-2 text-sm font-medium rounded bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ minHeight: '44px' }}
        >
          Add note
        </button>
      </Section>
    </div>
  );
}

function Section({ label, open, onToggle, ariaPrefix, children }) {
  return (
    <div className="border border-gray-200 rounded-md bg-white overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={open}
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

function TrimButton({ onClick, disabled, label }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="py-2 text-sm font-medium rounded bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
      style={{ minHeight: '44px' }}
      aria-label={label}
    >
      {label}
    </button>
  );
}
