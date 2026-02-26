import { useState, useCallback } from 'react';

const SUGGESTION_TEMPLATES = [
  'check the framing',
  'verify the trimming point',
  'review the caption placement',
  'adjust the color grading',
  'check the audio levels',
  'review the transition timing',
];

export default function ResearcherHandoverPanel({ onTriggerSuggestion, currentMode }) {
  const [customSuggestion, setCustomSuggestion] = useState('');

  const handleTemplateTrigger = useCallback((template) => {
    onTriggerSuggestion(template);
  }, [onTriggerSuggestion]);

  const handleCustomTrigger = useCallback(() => {
    const text = customSuggestion.trim();
    if (!text) return;
    onTriggerSuggestion(text);
    setCustomSuggestion('');
  }, [customSuggestion, onTriggerSuggestion]);

  return (
    <div
      className="border-2 rounded-lg p-4 shadow-sm"
      style={{ borderColor: '#F0AD4E', backgroundColor: '#FFFBF0' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: '#F0AD4E' }}
          aria-hidden="true"
        />
        <h3 className="font-bold text-sm" style={{ color: '#1F3864' }}>
          Handover Suggestions (WoZ)
        </h3>
        <span
          className="ml-auto px-2 py-0.5 rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: currentMode === 'creator' ? '#2B579A' : '#E67E22' }}
        >
          {currentMode === 'creator' ? 'Creator Mode' : 'Helper Mode'}
        </span>
      </div>

      {/* Template suggestions */}
      <div className="mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Suggestion Templates
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTION_TEMPLATES.map((template) => (
            <button
              key={template}
              onClick={() => handleTemplateTrigger(template)}
              className="px-3 py-1.5 rounded border border-gray-200 bg-white text-sm text-gray-700 hover:bg-orange-50 hover:border-orange-300 transition-colors focus:outline-2 focus:outline-offset-1 focus:outline-orange-500"
              aria-label={`Trigger suggestion: ${template}`}
            >
              {template}
            </button>
          ))}
        </div>
      </div>

      {/* Custom suggestion */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Custom Suggestion
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={customSuggestion}
            onChange={(e) => setCustomSuggestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCustomTrigger();
            }}
            placeholder="Type a custom suggestion..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-2 focus:outline-orange-500"
            aria-label="Custom suggestion text"
          />
          <button
            onClick={handleCustomTrigger}
            disabled={!customSuggestion.trim()}
            className="px-4 py-2 rounded text-white text-sm font-medium transition-colors disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-orange-500"
            style={{ backgroundColor: '#E67E22' }}
            aria-label="Trigger custom suggestion"
          >
            Trigger
          </button>
        </div>
      </div>
    </div>
  );
}
