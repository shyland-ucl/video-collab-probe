import { useEffect, useCallback } from 'react';
import { announce } from '../../utils/announcer.js';
import ttsService from '../../services/ttsService.js';

const CATEGORY_COLORS = {
  issue: '#D9534F',
  structural: '#F0AD4E',
  creative: '#5BC0DE',
};

export default function SuggestionCard({ suggestion, onDismiss, onNote, onRouteToHelper }) {
  if (!suggestion) return null;

  const relatedScenes = Array.isArray(suggestion.relatedScene)
    ? suggestion.relatedScene.join(', ')
    : suggestion.relatedScene;

  const catColor = CATEGORY_COLORS[suggestion.category] || '#9B59B6';

  // Announce and read aloud when suggestion appears
  useEffect(() => {
    const text = `AI observation: ${suggestion.text}. Related scene ${relatedScenes}.`;
    announce(text);
    ttsService.speak(suggestion.text);

    // Keyboard shortcut: S to dismiss
    const handleKeyDown = (e) => {
      if (e.key === 's' || e.key === 'S') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          onDismiss?.();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      ttsService.stop();
    };
  }, [suggestion.id]);

  return (
    <div
      className="rounded-2xl overflow-hidden shadow-lg"
      style={{
        border: `2px solid ${catColor}40`,
        backgroundColor: '#FFFFFF',
        animation: 'slideDown 0.3s ease-out',
      }}
      role="region"
      aria-label="AI suggestion"
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-2"
        style={{ backgroundColor: `${catColor}15` }}
      >
        <span className="text-sm" aria-hidden="true">AI</span>
        <span
          className="px-2 py-0.5 rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: catColor }}
        >
          {suggestion.category}
        </span>
        <span className="ml-auto text-xs text-gray-500">Scene {relatedScenes}</span>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <p className="text-sm text-gray-800 leading-relaxed">{suggestion.text}</p>
      </div>

      {/* Action buttons */}
      <div className="px-4 pb-4 flex gap-2">
        <button
          onClick={onRouteToHelper}
          className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-colors hover:brightness-110 focus:outline-2 focus:outline-offset-2 focus:outline-orange-500"
          style={{ backgroundColor: '#E67E22', minHeight: '48px' }}
          aria-label="Ask helper to check this suggestion"
        >
          Ask Helper to Check
        </button>
        <button
          onClick={onNote}
          className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-colors hover:brightness-110 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ backgroundColor: '#2B579A', minHeight: '48px' }}
          aria-label="Note this suggestion for later"
        >
          Note for Later
        </button>
        <button
          onClick={onDismiss}
          className="py-3 px-4 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 transition-colors hover:bg-gray-200 focus:outline-2 focus:outline-offset-2 focus:outline-gray-500"
          style={{ minHeight: '48px' }}
          aria-label="Dismiss suggestion (press S)"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
