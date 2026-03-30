import { useState, useCallback, useMemo } from 'react';

const CATEGORY_LABELS = {
  issue: { label: 'Issue', color: '#D9534F', bg: '#FEF2F2' },
  structural: { label: 'Structural', color: '#F0AD4E', bg: '#FFFBEB' },
  creative: { label: 'Creative', color: '#5BC0DE', bg: '#EFF6FF' },
};

export default function ResearcherSuggestionPanel({
  suggestions = [],
  onDeploy,
  deployedSuggestions = {},
}) {
  const grouped = useMemo(() => {
    const groups = { issue: [], structural: [], creative: [] };
    suggestions.forEach((s) => {
      if (groups[s.category]) groups[s.category].push(s);
    });
    return groups;
  }, [suggestions]);

  const deployedCount = Object.keys(deployedSuggestions).length;

  return (
    <div
      className="border-2 rounded-lg p-4 shadow-sm"
      style={{ borderColor: '#9B59B6', backgroundColor: '#FAF5FF' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: '#9B59B6' }}
          aria-hidden="true"
        />
        <h3 className="font-bold text-sm" style={{ color: '#1F3864' }}>
          AI Suggestion Panel
        </h3>
        <span className="ml-auto text-xs text-gray-500">
          {deployedCount} / {suggestions.length} deployed
        </span>
      </div>

      {suggestions.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No suggestions available for this video.</p>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([category, items]) => {
            if (items.length === 0) return null;
            const catConfig = CATEGORY_LABELS[category];
            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: catConfig.color }}
                  >
                    {catConfig.label}
                  </span>
                  <span className="text-xs text-gray-400">({items.length})</span>
                </div>
                <div className="space-y-2">
                  {items.map((sug) => {
                    const deployed = deployedSuggestions[sug.id];
                    const relatedScenes = Array.isArray(sug.relatedScene)
                      ? sug.relatedScene.join(', ')
                      : sug.relatedScene;

                    return (
                      <div
                        key={sug.id}
                        className="p-3 rounded-lg border"
                        style={{
                          backgroundColor: deployed ? '#F3F4F6' : catConfig.bg,
                          borderColor: deployed ? '#D1D5DB' : `${catConfig.color}40`,
                        }}
                      >
                        <p className="text-sm text-gray-800 mb-1">{sug.text}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>Scene {relatedScenes}</span>
                          {deployed ? (
                            <span className="ml-auto flex items-center gap-1 text-green-600 font-medium">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              Deployed {deployed.response ? `- ${deployed.response}` : ''}
                            </span>
                          ) : (
                            <button
                              onClick={() => onDeploy?.(sug)}
                              className="ml-auto px-3 py-1.5 rounded text-xs font-bold text-white transition-colors hover:brightness-110 focus:outline-2 focus:outline-offset-1 focus:outline-purple-500"
                              style={{ backgroundColor: '#9B59B6', minHeight: '32px' }}
                              aria-label={`Deploy suggestion: ${sug.text.substring(0, 40)}...`}
                            >
                              Deploy
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
