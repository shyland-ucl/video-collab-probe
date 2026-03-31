import { useEffect, useRef } from 'react';
import { announce } from '../../utils/announcer.js';

const CONDITION_BRIEFS = {
  probe1: {
    title: 'AI Scene Explorer',
    color: '#2B579A',
    summary: 'Explore video scenes using AI-generated descriptions.',
  },
  probe2: {
    title: 'Smart Handover',
    color: '#5CB85C',
    summary: 'Mark scenes and hand over editing tasks to a sighted helper.',
  },
  probe2b: {
    title: 'Decoupled Coordination',
    color: '#5CB85C',
    summary: 'Work on separate phones with shared project updates.',
  },
  probe3: {
    title: 'Proactive AI Collaboration',
    color: '#9B59B6',
    summary: 'Edit across two phones while AI surfaces suggestions.',
  },
};

export default function OnboardingBrief({ condition, onDismiss, guide = null }) {
  const headingRef = useRef(null);

  const brief = guide || CONDITION_BRIEFS[condition];

  useEffect(() => {
    if (!brief) {
      onDismiss?.();
      return;
    }
    const timer = window.setTimeout(() => {
      headingRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [brief, onDismiss]);

  if (!brief) return null;

  const dismissLabel = brief.dismissLabel || 'Start';
  const titleId = `${condition || 'guide'}-onboarding-title`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto">
        <div className="px-6 py-5" style={{ backgroundColor: brief.color }}>
          <h2
            ref={headingRef}
            id={titleId}
            tabIndex={-1}
            className="text-white font-bold text-xl focus:outline-none"
          >
            {brief.title}
          </h2>
        </div>

        <div className="px-6 py-5">
          <p className="text-base text-gray-700">{brief.summary}</p>
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={() => {
              announce(`Starting ${brief.title}`);
              onDismiss?.();
            }}
            className="w-full py-4 rounded-xl text-white font-bold text-base transition-colors hover:brightness-110 focus:outline-2 focus:outline-offset-2 focus:outline-blue-600"
            style={{ backgroundColor: brief.color, minHeight: '48px' }}
          >
            {dismissLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
