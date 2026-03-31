import { useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const ALL_CONDITIONS = {
  probe1: { label: 'Probe 1', path: '/probe1' },
  probe2a: { label: 'Probe 2a', path: '/probe2' },
  probe2b: { label: 'Probe 2b', path: '/probe2b' },
  probe3: { label: 'Probe 3', path: '/probe3' },
};

const FIXED_ORDER = ['probe1', 'probe2a', 'probe2b', 'probe3'];

/**
 * Bottom navigation bar for condition pages.
 * Shows all four phases as steps with previous/next buttons.
 */
export default function ConditionNav({ currentCondition }) {
  const navigate = useNavigate();

  const completedSet = useMemo(() => {
    try {
      const stored = localStorage.getItem('sessionConfig');
      if (stored) {
        const config = JSON.parse(stored);
        return new Set(config.completedConditions || []);
      }
    } catch {
      // ignore
    }
    return new Set();
  }, []);

  const currentIndex = FIXED_ORDER.indexOf(currentCondition);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < FIXED_ORDER.length - 1;

  const handlePrev = useCallback(() => {
    if (!hasPrev) return;
    const prevCond = FIXED_ORDER[currentIndex - 1];
    navigate(ALL_CONDITIONS[prevCond].path);
  }, [hasPrev, currentIndex, navigate]);

  const handleNext = useCallback(() => {
    if (!hasNext) return;
    // Mark current condition as completed
    try {
      const stored = localStorage.getItem('sessionConfig');
      if (stored) {
        const config = JSON.parse(stored);
        if (!config.completedConditions) config.completedConditions = [];
        if (!config.completedConditions.includes(currentCondition)) {
          config.completedConditions.push(currentCondition);
        }
        localStorage.setItem('sessionConfig', JSON.stringify(config));
      }
    } catch {
      // ignore
    }
    const nextCond = FIXED_ORDER[currentIndex + 1];
    navigate(ALL_CONDITIONS[nextCond].path);
  }, [hasNext, currentIndex, navigate, currentCondition]);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40"
      aria-hidden="true"
      tabIndex={-1}
    >
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
        {/* Previous button */}
        <button
          onClick={handlePrev}
          disabled={!hasPrev}
          tabIndex={-1}
          className="px-4 py-2 rounded text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ color: '#1F3864' }}
        >
          &larr; Previous
        </button>

        {/* Condition steps */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {FIXED_ORDER.map((condKey) => {
            const info = ALL_CONDITIONS[condKey];
            if (!info) return null;
            const isCurrent = condKey === currentCondition;
            const isCompleted = completedSet.has(condKey);

            return (
              <Link
                key={condKey}
                to={info.path}
                tabIndex={-1}
                className={[
                  'flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors',
                  'focus:outline-2 focus:outline-offset-1 focus:outline-blue-500',
                  isCurrent
                    ? 'bg-blue-900 text-white'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100',
                ].join(' ')}
              >
                {isCompleted && (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                <span>{info.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Next button */}
        <button
          onClick={handleNext}
          disabled={!hasNext}
          tabIndex={-1}
          className="px-4 py-2 rounded text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ color: '#1F3864' }}
        >
          Next &rarr;
        </button>
      </div>
    </nav>
  );
}
