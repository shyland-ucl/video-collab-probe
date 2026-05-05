import { useCallback } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { announce } from '../../utils/announcer.js';
import Probe2bSceneActions from '../probe2/Probe2bSceneActions.jsx';

const CATEGORY_COLORS = {
  issue: { bg: 'bg-red-50', border: 'border-red-300', badge: 'bg-red-100 text-red-800' },
  structural: { bg: 'bg-orange-50', border: 'border-orange-300', badge: 'bg-orange-100 text-orange-800' },
  creative: { bg: 'bg-cyan-50', border: 'border-cyan-300', badge: 'bg-cyan-100 text-cyan-800' },
};

function SuggestionItem({ suggestion, onRouteSelf, onRouteAI, onRouteHelper, onDismiss, helperName, resolution }) {
  const colors = CATEGORY_COLORS[suggestion.category] || CATEGORY_COLORS.creative;
  // Day 1 fix #7 + #8: AI button only appears when the suggestion has a
  // fix_template the override buffer can execute. Without a template the
  // suggestion routes to helper or self only — preserves Lan's triadic
  // design intent that some suggestions can't bypass the helper.
  const aiFixable = !!suggestion.fix_template;
  const fixLabel = suggestion.fix_template?.label;

  // Day 1 fix #8: when a routing decision has been made, render the
  // resolution badge instead of the four buttons. Keeps the suggestion
  // visible (instead of vanishing) so the triadic record stays intact.
  if (resolution) {
    const badgeColor = {
      ai: 'bg-purple-100 text-purple-800 border-purple-300',
      self: 'bg-blue-100 text-blue-800 border-blue-300',
      helper: 'bg-orange-100 text-orange-800 border-orange-300',
      dismissed: 'bg-gray-100 text-gray-700 border-gray-300',
    }[resolution.routedTo] || 'bg-gray-100 text-gray-700 border-gray-300';
    const outcomeColor = {
      pending: 'text-amber-700',
      applied: 'text-green-700',
      failed: 'text-red-700',
    }[resolution.outcomeStatus] || 'text-gray-600';
    const routedLabel = {
      ai: 'Routed to AI',
      self: 'Doing it myself',
      helper: `Routed to ${helperName}`,
      dismissed: 'Dismissed',
    }[resolution.routedTo] || 'Resolved';
    return (
      <div
        className={`p-3 rounded-lg border-2 ${colors.bg} ${colors.border} opacity-90`}
        role="status"
        aria-label={`Suggestion: ${suggestion.text}. ${routedLabel}. Status: ${resolution.outcomeStatus || 'pending'}.`}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors.badge}`}>
            {suggestion.category}
          </span>
          {suggestion.relatedScene !== undefined && (
            <span className="text-xs text-gray-500">
              Scene {Array.isArray(suggestion.relatedScene)
                ? suggestion.relatedScene.map((s) => s + 1).join(' & ')
                : suggestion.relatedScene + 1}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-800 mb-2">{suggestion.text}</p>
        <div className={`flex items-center gap-2 text-xs px-2 py-1 rounded border ${badgeColor}`}>
          <span className="font-bold">{routedLabel}</span>
          {resolution.routedTo !== 'dismissed' && (
            <span className={`font-medium ${outcomeColor}`}>
              · {resolution.outcomeStatus === 'applied' ? 'applied'
                : resolution.outcomeStatus === 'failed' ? 'failed'
                : 'pending'}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`p-3 rounded-lg border-2 ${colors.bg} ${colors.border}`}
      role="alert"
      aria-label={`AI suggestion: ${suggestion.text}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors.badge}`}>
          {suggestion.category}
        </span>
        {suggestion.relatedScene !== undefined && (
          <span className="text-xs text-gray-500">
            Scene {Array.isArray(suggestion.relatedScene)
              ? suggestion.relatedScene.map((s) => s + 1).join(' & ')
              : suggestion.relatedScene + 1}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-800 mb-3">{suggestion.text}</p>

      {/* Forced routing — creator must choose a channel */}
      <div className="space-y-2">
        <button
          onClick={() => onRouteSelf(suggestion)}
          className="w-full py-2 text-sm font-medium rounded bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ minHeight: '44px' }}
        >
          I'll Do It
        </button>
        {aiFixable && (
          <button
            onClick={() => onRouteAI(suggestion)}
            className="w-full py-2 text-sm font-medium rounded bg-purple-100 text-purple-800 hover:bg-purple-200 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
            style={{ minHeight: '44px' }}
            aria-label={fixLabel ? `Ask AI to fix: ${fixLabel}` : 'Ask AI to fix'}
          >
            Ask AI to Fix{fixLabel ? ` (${fixLabel})` : ''}
          </button>
        )}
        <button
          onClick={() => onRouteHelper(suggestion)}
          className="w-full py-2 text-sm font-medium rounded bg-orange-100 text-orange-800 hover:bg-orange-200 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ minHeight: '44px' }}
        >
          Ask {helperName} to fix
        </button>
        <button
          onClick={() => onDismiss(suggestion)}
          className="w-full py-2 text-sm font-medium rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ minHeight: '44px' }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default function Probe3SceneActions({
  scene,
  index,
  suggestions = [],
  helperName = 'helper',
  onSuggestionRoute,
  onSuggestionDismiss,
  currentLevel,
  onLevelChange,
  accentColor = '#9B59B6',
  // Day 1 fix #8: { [suggestionId]: { routedTo, outcomeStatus, timestamp } }
  // map. When a suggestion appears in this map, the SuggestionItem renders
  // its resolution badge instead of the action buttons.
  suggestionResolutions = {},
  ...probe2bProps
}) {
  const { logEvent } = useEventLogger();

  const handleRouteSelf = useCallback(
    (suggestion) => {
      logEvent(EventTypes.SUGGESTION_ROUTE_SELF, Actors.CREATOR, {
        suggestionId: suggestion.id,
        category: suggestion.category,
      });
      if (onSuggestionRoute) onSuggestionRoute(suggestion, 'self');
      announce('Suggestion routed to yourself.');
    },
    [logEvent, onSuggestionRoute]
  );

  const handleRouteAI = useCallback(
    (suggestion) => {
      logEvent(EventTypes.SUGGESTION_ROUTE_AI, Actors.CREATOR, {
        suggestionId: suggestion.id,
        category: suggestion.category,
      });
      if (onSuggestionRoute) onSuggestionRoute(suggestion, 'ai');
      announce('Suggestion routed to AI.');
    },
    [logEvent, onSuggestionRoute]
  );

  const handleRouteHelper = useCallback(
    (suggestion) => {
      logEvent(EventTypes.SUGGESTION_ROUTE_HELPER, Actors.CREATOR, {
        suggestionId: suggestion.id,
        category: suggestion.category,
      });
      if (onSuggestionRoute) onSuggestionRoute(suggestion, 'helper');
      announce(`Suggestion sent to ${helperName}.`);
    },
    [logEvent, onSuggestionRoute, helperName]
  );

  const handleDismiss = useCallback(
    (suggestion) => {
      logEvent(EventTypes.SUGGESTION_DISMISSED, Actors.CREATOR, {
        suggestionId: suggestion.id,
        category: suggestion.category,
      });
      if (onSuggestionDismiss) onSuggestionDismiss(suggestion);
      announce('Suggestion dismissed.');
    },
    [logEvent, onSuggestionDismiss]
  );

  // Filter suggestions relevant to this scene
  const sceneSuggestions = suggestions.filter((s) => {
    const related = s.relatedScene;
    if (Array.isArray(related)) return related.includes(index);
    return related === index;
  });

  return (
    <>
      {/* Suggestions for this scene */}
      {sceneSuggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-purple-600">AI Suggestions</p>
          {sceneSuggestions.map((suggestion) => (
            <SuggestionItem
              key={suggestion.id}
              suggestion={suggestion}
              onRouteSelf={handleRouteSelf}
              onRouteAI={handleRouteAI}
              onRouteHelper={handleRouteHelper}
              onDismiss={handleDismiss}
              helperName={helperName}
              resolution={suggestionResolutions[suggestion.id] || null}
            />
          ))}
        </div>
      )}

      {/* All Probe 2b actions */}
      <Probe2bSceneActions
        scene={scene}
        index={index}
        helperName={helperName}
        currentLevel={currentLevel}
        onLevelChange={onLevelChange}
        accentColor={accentColor}
        {...probe2bProps}
      />
    </>
  );
}
