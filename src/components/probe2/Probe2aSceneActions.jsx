import { useState, useCallback } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { announce } from '../../utils/announcer.js';
import InlineVQAComposer from '../shared/InlineVQAComposer.jsx';
import DetailLevelSelector from '../shared/DetailLevelSelector.jsx';
import useSpeechRecognition from '../../hooks/useSpeechRecognition.js';
import { playEarcon } from '../../utils/earcon.js';

const TASK_CATEGORIES = ['Trim', 'Colour', 'Framing', 'Audio', 'Caption', 'General Review'];
const PRIORITIES = ['Must Do', 'Nice to Have', 'Just Check'];

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
}) {
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [showIntentLocker, setShowIntentLocker] = useState(false);
  const [showAskAI, setShowAskAI] = useState(false);
  const [showAskAIEdit, setShowAskAIEdit] = useState(false);
  const [aiEditPending, setAiEditPending] = useState(false);
  const [aiProposal, setAiProposal] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [intentText, setIntentText] = useState('');
  const [category, setCategory] = useState('General Review');
  const [priority, setPriority] = useState('Must Do');
  const { logEvent } = useEventLogger();
  const { isListening, toggleListening } = useSpeechRecognition({
    onResult: (transcript) => setIntentText(transcript),
    announcement: 'Listening for your instruction.',
  });

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

  const handleHandover = useCallback(() => {
    if (!intentText.trim()) {
      announce('Please describe what you need help with.');
      return;
    }
    playEarcon(660, 150);
    logEvent(EventTypes.INTENT_LOCKED, Actors.CREATOR, {
      segmentId: scene.id,
      instruction: intentText,
      category,
      priority,
    });
    if (onHandover) {
      onHandover({
        segmentId: scene.id,
        segmentName: scene.name,
        instruction: intentText,
        category,
        priority,
      });
    }
    setShowIntentLocker(false);
    setIntentText('');
  }, [scene, intentText, category, priority, logEvent, onHandover]);

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
        {isSegmentPlaying ? 'Pause Segment' : 'Play Segment'}
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
            {thinking && <p className="text-xs text-gray-400 italic mt-1" role="status">Thinking...</p>}
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
          <div className="mt-2 p-3 bg-gray-50 rounded-lg space-y-2">
            <button
              onClick={handleKeepDiscard}
              className={`w-full py-2 text-sm rounded font-medium transition-colors ${
                isKept ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-red-100 text-red-800 hover:bg-red-200'
              }`}
              style={{ minHeight: '44px' }}
              aria-label={isKept ? 'Mark scene for removal' : 'Keep scene'}
            >
              {isKept ? 'Keep (tap to discard)' : 'Discarded (tap to keep)'}
            </button>
            {['Trim', 'Split', 'Move', 'Add Caption', 'Add Note'].map((action) => (
              <button
                key={action}
                onClick={() => handleSelfEdit(action.toLowerCase().replace(' ', '_'))}
                className="w-full py-2 text-sm rounded bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
                style={{ minHeight: '44px' }}
              >
                {action}
              </button>
            ))}
          </div>
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
            {aiEditPending && <p className="text-xs text-gray-400 italic mt-1" role="status">AI is working...</p>}
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
          <div className="mt-2 p-3 bg-green-50 rounded-lg border border-green-200 space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                What do you need help with?
              </label>
              <div className="flex gap-2">
                <button
                  onClick={toggleListening}
                  aria-label={isListening ? 'Stop listening' : 'Voice input'}
                  className={`flex items-center justify-center rounded ${
                    isListening ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                  style={{ minHeight: '44px', minWidth: '44px' }}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
                    <rect x="7" y="1" width="4" height="10" rx="2" />
                    <path d="M4 8a5 5 0 0 0 10 0" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <line x1="9" y1="14" x2="9" y2="17" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </button>
                <input
                  type="text"
                  value={intentText}
                  onChange={(e) => setIntentText(e.target.value)}
                  placeholder="Describe what you need..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-2 focus:outline-blue-500"
                  style={{ minHeight: '44px' }}
                  aria-label="Instruction for helper"
                />
              </div>
            </div>
            <div>
              <span className="text-xs font-medium text-gray-600 block mb-1" id="cat-label-2a">Task category</span>
              <div className="flex flex-wrap gap-1" role="group" aria-labelledby="cat-label-2a">
                {TASK_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    aria-pressed={category === cat}
                    className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                      category === cat ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    style={{ minHeight: '36px' }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs font-medium text-gray-600 block mb-1" id="pri-label-2a">Priority</span>
              <div className="flex gap-1" role="group" aria-labelledby="pri-label-2a">
                {PRIORITIES.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    aria-pressed={priority === p}
                    className={`flex-1 px-2 py-1.5 text-xs rounded transition-colors ${
                      priority === p ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    style={{ minHeight: '36px' }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleHandover}
              disabled={!intentText.trim()}
              className="w-full py-3 text-sm font-bold rounded text-white transition-colors disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
              style={{ backgroundColor: '#D9534F', minHeight: '48px' }}
            >
              Hand Over
            </button>
          </div>
        )}
      </div>
    </>
  );
}
