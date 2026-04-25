import { useState, useCallback, useMemo } from 'react';

const CATEGORY_LABELS = {
  issue: { label: 'Issue', color: '#D9534F', bg: '#FEF2F2' },
  structural: { label: 'Structural', color: '#F0AD4E', bg: '#FFFBEB' },
  creative: { label: 'Creative', color: '#5BC0DE', bg: '#EFF6FF' },
};

/**
 * ResearcherSuggestionPanel — WoZ control surface for Probe 3's proactive AI.
 *
 * Receives `suggestions` (pre-authored, from `descriptions.json` of any
 * selected video) and renders them grouped by category with Deploy buttons.
 *
 * Also renders a "Compose ad-hoc suggestion" form so the researcher can push
 * suggestions for any selected video — including pipeline-uploaded footage
 * that has no pre-authored suggestions in its data file. This was added to
 * close B4 in the 2026-04-25 walkthrough findings: previously the proactive AI
 * only fired for the Lakeside sample, so any non-Lakeside video silently
 * disabled Probe 3's defining feature. Now the researcher always has a path
 * to deploy a suggestion, regardless of the underlying video.
 */
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

  // Compose form state — controlled inputs.
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeText, setComposeText] = useState('');
  const [composeCategory, setComposeCategory] = useState('creative');
  const [composeScene, setComposeScene] = useState('');

  const handleComposeDeploy = useCallback(() => {
    const text = composeText.trim();
    if (!text) return;
    const sceneNum = parseInt(composeScene, 10);
    const adhocSuggestion = {
      id: `adhoc-${Date.now()}`,
      category: composeCategory,
      text,
      relatedScene: Number.isFinite(sceneNum) ? sceneNum : null,
      _adhoc: true,
    };
    onDeploy?.(adhocSuggestion);
    setComposeText('');
    setComposeScene('');
    // Leave composeCategory as-is so a researcher pushing several similar
    // suggestions doesn't have to re-select each time.
  }, [composeText, composeCategory, composeScene, onDeploy]);

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
          {deployedCount} / {suggestions.length} pre-authored deployed
        </span>
      </div>

      {suggestions.length === 0 ? (
        <p className="text-sm text-gray-500 italic">
          No pre-authored suggestions for the selected video. Use the compose form below to deploy ad-hoc suggestions.
        </p>
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

      {/* Compose ad-hoc suggestion (B4) — always available so a researcher can
          push a suggestion against any selected video, including pipeline
          uploads that have no pre-authored data. */}
      <div className="mt-4 pt-4 border-t border-purple-200">
        <button
          onClick={() => setComposeOpen((v) => !v)}
          aria-expanded={composeOpen}
          className="w-full text-sm font-medium text-left text-purple-900 hover:text-purple-700 focus:outline-2 focus:outline-offset-2 focus:outline-purple-500"
        >
          {composeOpen ? '▾' : '▸'} Compose ad-hoc suggestion
        </button>

        {composeOpen && (
          <div className="mt-3 space-y-3">
            <div>
              <label
                htmlFor="adhoc-suggestion-text"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                Suggestion text
              </label>
              <textarea
                id="adhoc-suggestion-text"
                value={composeText}
                onChange={(e) => setComposeText(e.target.value)}
                rows={2}
                placeholder="e.g. Consider trimming this scene shorter to keep the pacing tight."
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-2 focus:outline-purple-500"
              />
            </div>

            <div className="flex gap-3">
              <fieldset className="flex-1">
                <legend className="block text-xs font-medium text-gray-700 mb-1">
                  Category
                </legend>
                <div className="flex gap-2" role="radiogroup" aria-label="Category">
                  {Object.entries(CATEGORY_LABELS).map(([key, cfg]) => (
                    <label
                      key={key}
                      className={`flex-1 px-2 py-1.5 rounded text-xs font-medium text-center cursor-pointer border-2 transition-colors ${
                        composeCategory === key ? 'text-white' : 'text-gray-700 bg-white'
                      }`}
                      style={
                        composeCategory === key
                          ? { backgroundColor: cfg.color, borderColor: cfg.color }
                          : { borderColor: '#E5E7EB' }
                      }
                    >
                      <input
                        type="radio"
                        name="adhoc-category"
                        value={key}
                        checked={composeCategory === key}
                        onChange={() => setComposeCategory(key)}
                        className="sr-only"
                      />
                      {cfg.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="w-24">
                <label
                  htmlFor="adhoc-scene"
                  className="block text-xs font-medium text-gray-700 mb-1"
                >
                  Scene #
                </label>
                <input
                  id="adhoc-scene"
                  type="number"
                  min={1}
                  value={composeScene}
                  onChange={(e) => setComposeScene(e.target.value)}
                  placeholder="1"
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-2 focus:outline-purple-500"
                />
              </div>
            </div>

            <button
              onClick={handleComposeDeploy}
              disabled={!composeText.trim()}
              className="w-full py-2 rounded text-sm font-bold text-white transition-colors hover:brightness-110 focus:outline-2 focus:outline-offset-2 focus:outline-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#9B59B6', minHeight: '40px' }}
            >
              Deploy ad-hoc suggestion
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
