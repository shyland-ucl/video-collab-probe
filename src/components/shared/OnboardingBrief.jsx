import { useEffect, useMemo, useRef } from 'react';
import { announce } from '../../utils/announcer.js';

const CONDITION_BRIEFS = {
  probe1: {
    title: 'AI Scene Explorer',
    color: '#2B579A',
    summary: 'Choose your videos, then explore scenes with AI descriptions.',
    steps: [
      { icon: '1', text: 'Select videos from your library and create a project.' },
      { icon: '2', text: 'Browse scenes with Previous and Next.' },
      { icon: '3', text: 'Use Less or More to change the description detail.' },
      { icon: '4', text: 'Use Play, Ask, Mark, or Edit when you need them.' },
    ],
  },
  probe2: {
    title: 'Smart Handover',
    color: '#5CB85C',
    summary: 'Work with a sighted helper by marking scenes and handing over tasks.',
    steps: [
      { icon: '1', text: 'Explore scenes and mark the ones that need helper input.' },
      { icon: '2', text: 'Record a voice note to explain what you need.' },
      { icon: '3', text: 'Start a handover when you want the helper to take over.' },
      { icon: '4', text: 'The helper edits, then returns the device with a summary.' },
    ],
  },
  probe2b: {
    title: 'Decoupled Coordination',
    color: '#5CB85C',
    summary: 'You and your helper work on separate phones with shared project updates.',
    steps: [
      { icon: '1', text: 'Choose whether this phone is for the creator or the helper.' },
      { icon: '2', text: 'The shared project carries over between devices.' },
      { icon: '3', text: 'Route work to the helper or ask AI for help.' },
      { icon: '4', text: 'Project updates sync between both devices.' },
    ],
  },
  probe3: {
    title: 'Proactive AI Collaboration',
    color: '#9B59B6',
    summary: 'Work across two phones while AI can surface suggestions during editing.',
    steps: [
      { icon: '1', text: 'Choose whether this phone is for the creator or the helper.' },
      { icon: '2', text: 'The creator can edit, ask AI, or ask the helper.' },
      { icon: '3', text: 'AI suggestions may appear while the creator explores scenes.' },
      { icon: '4', text: 'The helper can review routed tasks and AI observations.' },
    ],
  },
};

function formatDuration(seconds) {
  const totalSeconds = Math.max(0, Math.round(seconds || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  if (minutes > 0 && remainingSeconds > 0) {
    return `${minutes} min ${remainingSeconds} sec`;
  }

  if (minutes > 0) {
    return `${minutes} min`;
  }

  return `${totalSeconds} sec`;
}

function buildProjectTourBrief(projectStats) {
  const {
    videoCount = 0,
    totalDuration = 0,
    clipCount = 0,
    clipLengthSeconds = null,
  } = projectStats || {};

  const videoLabel = videoCount === 1 ? 'video' : 'videos';
  const clipLabel = clipCount === 1 ? 'clip' : 'clips';
  const clipLengthLabel = clipLengthSeconds
    ? `${clipCount} ${clipLengthSeconds}-second ${clipLabel}`
    : `${clipCount} ${clipLabel}`;

  return {
    title: 'Editing Page',
    color: '#2B579A',
    summary: `${videoCount} ${videoLabel}, ${formatDuration(totalDuration)} total, ${clipLengthLabel} ready to explore.`,
    sectionTitle: 'Guide Tour',
    steps: [
      { icon: '1', text: 'Use Previous and Next to move through scenes one by one.' },
      { icon: '2', text: 'Tap Less or More to change the description detail.' },
      { icon: '3', text: 'Use Play to hear the current scene from its start.' },
      { icon: '4', text: 'The scene card tells you the scene number, time range, and current description.' },
    ],
    dismissLabel: 'Start exploring',
  };
}

export default function OnboardingBrief({ condition, onDismiss, projectStats = null, guide = null }) {
  const headingRef = useRef(null);
  const dialogRef = useRef(null);

  const brief = useMemo(() => {
    if (guide) return guide;
    if (condition === 'probe1' && projectStats) {
      return buildProjectTourBrief(projectStats);
    }
    return CONDITION_BRIEFS[condition];
  }, [condition, guide, projectStats]);

  useEffect(() => {
    if (!brief) {
      onDismiss?.();
      return;
    }

    if (dialogRef.current) {
      dialogRef.current.scrollTop = 0;
    }

    const timer = window.setTimeout(() => {
      headingRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [brief, onDismiss]);

  if (!brief) return null;

  const dismissLabel = brief.dismissLabel || "Got it, let's start";
  const titleId = `${condition || 'guide'}-onboarding-title`;
  const summaryId = `${condition || 'guide'}-onboarding-summary`;
  const stepsId = `${condition || 'guide'}-onboarding-steps`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={`${summaryId} ${stepsId}`}
    >
      <div
        ref={dialogRef}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto overflow-y-auto max-h-[90vh]"
        role="document"
      >
        <div
          className="px-6 py-5"
          style={{ backgroundColor: brief.color }}
        >
          <h2
            ref={headingRef}
            id={titleId}
            tabIndex={-1}
            className="text-white font-bold text-xl focus:outline-none"
          >
            {brief.title}
          </h2>
          <p id={summaryId} className="text-white/90 text-sm mt-1">
            {brief.summary}
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            {brief.sectionTitle || 'Guide Tour'}
          </h3>
          <ol id={stepsId} className="space-y-3">
            {brief.steps.map((step, index) => (
              <li key={`${step.icon}-${index}`} className="flex items-start gap-3">
                <span
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                  style={{ backgroundColor: brief.color }}
                  aria-hidden="true"
                >
                  {step.icon}
                </span>
                <span className="text-sm text-gray-700 pt-1 leading-relaxed">
                  <span className="sr-only">{`Step ${index + 1}. `}</span>
                  {step.text}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={() => {
              announce(`Starting ${brief.title}`);
              onDismiss?.();
            }}
            className="w-full py-4 rounded-xl text-white font-bold text-base transition-colors hover:brightness-110 focus:outline-2 focus:outline-offset-2 focus:outline-blue-600"
            style={{ backgroundColor: brief.color, minHeight: '48px' }}
            aria-label={`${dismissLabel}, ${brief.title}`}
          >
            {dismissLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
