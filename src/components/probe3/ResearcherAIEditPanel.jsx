import { useState, useCallback, useMemo, useEffect } from 'react';
import { draftAIEditResponse } from '../../services/geminiService.js';

const ACTIONS = [
  { key: 'trim_start', label: 'Trim Start' },
  { key: 'split', label: 'Split' },
  { key: 'delete', label: 'Delete' },
  { key: 'reorder', label: 'Reorder' },
  { key: 'add_caption', label: 'Add Caption' },
];

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'to',
  'of', 'in', 'on', 'at', 'for', 'with', 'this', 'that', 'it', 'i', 'you',
  'can', 'do', 'does', 'please', 'could', 'would', 'should', 'me', 'my',
  'video', 'clip', 'scene', 'one', 'two', 'first', 'last',
]);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Score a prepared-response entry against the instruction. The score counts
 * keyword overlap between the instruction and {key, response, partial}.
 */
function scorePrepared(instruction, key, val) {
  const tokens = tokenize(instruction);
  if (tokens.length === 0) return 0;
  const haystack = `${key} ${val?.response || ''} ${val?.partial || ''}`.toLowerCase();
  let hits = 0;
  for (const t of tokens) if (haystack.includes(t)) hits++;
  return hits;
}

export default function ResearcherAIEditPanel({ segment, pendingRequest, onSendResponse, onApplyEdit }) {
  const [customResponse, setCustomResponse] = useState('');
  const [selectedAction, setSelectedAction] = useState(null);
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState(null);
  const [showAllPrepared, setShowAllPrepared] = useState(false);

  // Reset selection when a new request arrives so the panel is fresh.
  useEffect(() => {
    if (pendingRequest) {
      setCustomResponse('');
      setSelectedAction(null);
      setDraftError(null);
      setShowAllPrepared(false);
    }
  }, [pendingRequest?.timestamp]);

  const preparedEntries = useMemo(() => {
    return Object.entries(segment?.ai_edits_prepared || {});
  }, [segment]);

  // Rank prepared by keyword overlap with the pending request. When nothing
  // matches we fall back to showing all so the researcher always has options.
  const { rankedPrepared, hasMatches } = useMemo(() => {
    const instruction = pendingRequest?.instruction || '';
    if (!instruction || preparedEntries.length === 0) {
      return { rankedPrepared: preparedEntries, hasMatches: false };
    }
    const scored = preparedEntries
      .map(([k, v]) => ({ key: k, val: v, score: scorePrepared(instruction, k, v) }))
      .sort((a, b) => b.score - a.score);
    const matched = scored.filter((s) => s.score > 0);
    if (matched.length > 0) {
      return {
        rankedPrepared: matched.map((s) => [s.key, s.val]),
        hasMatches: true,
      };
    }
    return { rankedPrepared: preparedEntries, hasMatches: false };
  }, [preparedEntries, pendingRequest?.instruction]);

  const visiblePrepared = showAllPrepared ? preparedEntries : rankedPrepared;

  const populateFromPrepared = useCallback((key, responseText) => {
    setCustomResponse(responseText || '');
    setSelectedAction(key);
    setDraftError(null);
  }, []);

  const handleDraftWithGemini = useCallback(async () => {
    if (!pendingRequest?.instruction) return;
    setDrafting(true);
    setDraftError(null);
    try {
      const desc = segment?.descriptions?.level_2 || segment?.descriptions?.level_1 || '';
      const draft = await draftAIEditResponse(pendingRequest.instruction, desc);
      setCustomResponse(draft.description);
      setSelectedAction(draft.action);
    } catch (err) {
      setDraftError(err?.message || 'Gemini draft failed');
    } finally {
      setDrafting(false);
    }
  }, [pendingRequest, segment]);

  const handleSend = useCallback(() => {
    const text = customResponse.trim();
    if (!text || sending) return;
    setSending(true);
    // Artificial 2–3 s delay so the response feels like AI thinking.
    const delay = 2000 + Math.random() * 1000;
    setTimeout(() => {
      onSendResponse?.(text, selectedAction || 'success');
      if (selectedAction) onApplyEdit?.(selectedAction);
      setCustomResponse('');
      setSelectedAction(null);
      setSending(false);
    }, delay);
  }, [customResponse, selectedAction, sending, onSendResponse, onApplyEdit]);

  return (
    <div className="space-y-4">
      {/* Pending request */}
      {pendingRequest ? (
        <div className="p-3 bg-purple-50 border border-purple-300 rounded">
          <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1">
            Pending request
          </p>
          <p className="text-sm font-medium text-gray-800">"{pendingRequest.instruction}"</p>
          {pendingRequest.segment && (
            <p className="text-xs text-gray-500 mt-1">
              Segment: {pendingRequest.segment}
              {typeof pendingRequest.videoTime === 'number' && ` · ${pendingRequest.videoTime.toFixed(1)}s`}
            </p>
          )}
        </div>
      ) : (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded">
          <p className="text-sm text-gray-400 italic">No pending request. Compose a response below to send proactively.</p>
        </div>
      )}

      {/* Prepared responses (filtered by question keywords) */}
      {preparedEntries.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {pendingRequest && hasMatches ? 'Suggested prepared responses' : 'Prepared responses'}
            </p>
            {pendingRequest && hasMatches && rankedPrepared.length < preparedEntries.length && (
              <button
                type="button"
                onClick={() => setShowAllPrepared((v) => !v)}
                className="text-xs text-blue-600 hover:underline focus:outline-2 focus:outline-blue-500"
              >
                {showAllPrepared ? 'Show suggested only' : `Show all (${preparedEntries.length})`}
              </button>
            )}
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {visiblePrepared.map(([editType, data]) => (
              <div key={editType} className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => populateFromPrepared(editType, data.response)}
                  className="w-full text-left px-3 py-2 rounded border border-gray-200 bg-white text-sm hover:bg-green-50 hover:border-green-300 transition-colors focus:outline-2 focus:outline-offset-1 focus:outline-green-500"
                  title={data.response}
                  aria-label={`Use prepared response for ${editType}: ${data.response}`}
                >
                  <span className="font-medium text-green-700 text-xs">OK · {editType.replace(/_/g, ' ')}</span>
                  <span className="text-gray-600 text-xs block">{data.response}</span>
                </button>
                {data.partial && (
                  <button
                    type="button"
                    onClick={() => populateFromPrepared(editType, data.partial)}
                    className="w-full text-left px-3 py-2 rounded border border-gray-200 bg-white text-sm hover:bg-amber-50 hover:border-amber-300 transition-colors focus:outline-2 focus:outline-offset-1 focus:outline-amber-500"
                    title={data.partial}
                    aria-label={`Use partial response for ${editType}: ${data.partial}`}
                  >
                    <span className="font-medium text-amber-700 text-xs">Partial · {editType.replace(/_/g, ' ')}</span>
                    <span className="text-gray-600 text-xs block">{data.partial}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Draft with Gemini */}
      {pendingRequest && (
        <div>
          <button
            type="button"
            onClick={handleDraftWithGemini}
            disabled={drafting}
            className="w-full px-3 py-2 rounded text-sm font-medium text-white transition-colors disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-purple-500"
            style={{ backgroundColor: '#6D28D9' }}
            aria-label="Draft a response with Gemini"
          >
            {drafting ? 'Drafting with Gemini…' : '✨ Draft with Gemini'}
          </button>
          {draftError && (
            <p className="text-xs text-red-600 mt-1" role="alert">Gemini draft failed: {draftError}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            Populates the response box; never sends automatically.
          </p>
        </div>
      )}

      {/* Custom response */}
      <div>
        <label htmlFor="ai-edit-response" className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
          Response to send
        </label>
        <textarea
          id="ai-edit-response"
          value={customResponse}
          onChange={(e) => setCustomResponse(e.target.value)}
          placeholder="Click a prepared response above, draft with Gemini, or type your own."
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-2 focus:outline-purple-500 resize-y"
          aria-label="AI edit response text"
        />
      </div>

      {/* Action chips — single-select, auto-set when a prepared response is chosen */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Suggested action <span className="font-normal text-gray-400">(applied alongside the response)</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ACTIONS.map((a) => {
            const active = selectedAction === a.key;
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => setSelectedAction(active ? null : a.key)}
                className={[
                  'px-3 py-1.5 rounded border text-sm transition-colors',
                  'focus:outline-2 focus:outline-offset-1 focus:outline-blue-500',
                  active
                    ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-blue-50 hover:border-blue-300',
                ].join(' ')}
                aria-pressed={active}
              >
                {a.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Send */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSend}
          disabled={!customResponse.trim() || sending}
          className="flex-1 px-4 py-2 rounded text-white text-sm font-bold transition-colors disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-purple-500"
          style={{ backgroundColor: '#9B59B6', minHeight: '44px' }}
          aria-label="Send AI response to participant"
        >
          {sending ? 'Sending…' : 'Send response'}
        </button>
        <button
          type="button"
          onClick={() => { setCustomResponse(''); setSelectedAction(null); }}
          disabled={sending || (!customResponse && !selectedAction)}
          className="px-3 py-2 rounded text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 focus:outline-2 focus:outline-offset-2"
          aria-label="Clear response"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
