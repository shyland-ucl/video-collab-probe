const CATEGORY_COLORS = {
  issue: '#D9534F',
  structural: '#F0AD4E',
  creative: '#5BC0DE',
};

export default function SuggestionHistory({ notedSuggestions = [], onClose }) {
  if (notedSuggestions.length === 0) return null;

  return (
    <div
      className="border-2 rounded-xl overflow-hidden bg-white mt-3"
      style={{ borderColor: '#2B579A40' }}
      role="region"
      aria-label="Saved suggestions"
    >
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#EBF5FB] border-b border-[#BDD7EE]">
        <span className="text-xs font-bold tracking-wide text-[#2B579A] uppercase">
          Saved Suggestions ({notedSuggestions.length})
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-700 focus:outline-2 focus:outline-blue-500"
            style={{ minHeight: '44px', minWidth: '44px' }}
            aria-label="Close suggestion history"
          >
            Close
          </button>
        )}
      </div>
      <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
        {notedSuggestions.map((sug) => {
          const catColor = CATEGORY_COLORS[sug.category] || '#9B59B6';
          const relatedScenes = Array.isArray(sug.relatedScene)
            ? sug.relatedScene.join(', ')
            : sug.relatedScene;

          return (
            <div key={sug.id} className="px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="px-1.5 py-0.5 rounded text-xs font-bold text-white"
                  style={{ backgroundColor: catColor }}
                >
                  {sug.category}
                </span>
                <span className="text-xs text-gray-400">Scene {relatedScenes}</span>
                {sug.helperResponse && (
                  <span className="ml-auto text-xs font-medium text-green-600">
                    Helper: {sug.helperResponse}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-700">{sug.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
