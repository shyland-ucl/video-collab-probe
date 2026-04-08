import { announce } from '../../utils/announcer.js';

const LEVELS = [
  { value: 1, label: 'Overview' },
  { value: 2, label: 'Detailed' },
  { value: 3, label: 'Technical' },
];

export default function DetailLevelSelector({ currentLevel, onLevelChange }) {
  const handleChange = (level) => {
    onLevelChange(level);
    const label = LEVELS.find((l) => l.value === level)?.label;
    announce(`Description detail changed to ${label}.`);
  };

  return (
    <div>
      <span className="text-xs font-medium text-gray-600 block mb-1.5" id="detail-level-label">
        Detail level
      </span>
      <div className="flex gap-2" role="radiogroup" aria-labelledby="detail-level-label">
        {LEVELS.map((level) => (
          <button
            key={level.value}
            role="radio"
            aria-checked={currentLevel === level.value}
            onClick={() => handleChange(level.value)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500 ${
              currentLevel === level.value
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            style={{ minHeight: '44px' }}
          >
            {level.label}
          </button>
        ))}
      </div>
    </div>
  );
}
