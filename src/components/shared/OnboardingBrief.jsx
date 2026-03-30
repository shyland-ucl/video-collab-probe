import { useState } from 'react';
import { announce } from '../../utils/announcer.js';

const CONDITION_BRIEFS = {
  probe1: {
    title: 'AI Scene Explorer',
    color: '#2B579A',
    steps: [
      { icon: '1', text: 'Select videos from your library and create a project' },
      { icon: '2', text: 'Browse scenes by swiping or using Previous/Next buttons' },
      { icon: '3', text: 'Tap Less Detail or More Detail to change description level, or Ask to ask about a scene' },
      { icon: '4', text: 'Use Mark, Edit, and Play to interact with your video' },
    ],
    summary: 'Choose your videos, then explore scenes with AI descriptions. Ask questions, mark moments, and edit your timeline.',
  },
  probe2: {
    title: 'Smart Handover',
    color: '#5CB85C',
    steps: [
      { icon: '1', text: 'Start as the Creator — explore and mark scenes that need a sighted helper\'s input' },
      { icon: '2', text: 'Record voice notes on marked scenes to explain what you need' },
      { icon: '3', text: 'Press H to hand the device to your helper with your task list' },
      { icon: '4', text: 'Your helper completes tasks and returns the device with a summary' },
    ],
    summary: 'Collaborate with your sighted helper by marking scenes and handing over tasks.',
  },
  probe2b: {
    title: 'Decoupled Coordination',
    color: '#5CB85C',
    steps: [
      { icon: '1', text: 'You and your helper each use your own phone' },
      { icon: '2', text: 'Your project from Phase 2a carries over — same video, same edits' },
      { icon: '3', text: 'Route tasks to your helper or ask AI for help' },
      { icon: '4', text: 'Your helper can respond to tasks or work independently on their device' },
    ],
    summary: 'Continue your project on separate devices with reactive task routing.',
  },
  probe3: {
    title: 'Proactive AI Collaboration',
    color: '#9B59B6',
    steps: [
      { icon: '1', text: 'You and your helper each use your own phone' },
      { icon: '2', text: 'As the Creator, your playback controls sync to the helper\'s screen' },
      { icon: '3', text: 'AI may suggest observations — dismiss, save, or route to your helper' },
      { icon: '4', text: 'Route tasks to your helper or ask AI, and review helper responses' },
    ],
    summary: 'Work together on separate devices with AI-driven suggestions.',
  },
};

export default function OnboardingBrief({ condition, onDismiss }) {
  const brief = CONDITION_BRIEFS[condition];
  if (!brief) {
    onDismiss?.();
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Introduction to ${brief.title}`}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto overflow-hidden"
        role="document"
      >
        {/* Header */}
        <div
          className="px-6 py-5"
          style={{ backgroundColor: brief.color }}
        >
          <h2 className="text-white font-bold text-xl">
            {brief.title}
          </h2>
          <p className="text-white/80 text-sm mt-1">
            {brief.summary}
          </p>
        </div>

        {/* Steps */}
        <div className="px-6 py-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            How it works
          </h3>
          <ol className="space-y-3" aria-label="Steps for this condition">
            {brief.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                  style={{ backgroundColor: brief.color }}
                  aria-hidden="true"
                >
                  {step.icon}
                </span>
                <span className="text-sm text-gray-700 pt-1 leading-relaxed">
                  {step.text}
                </span>
              </li>
            ))}
          </ol>
        </div>

        {/* Dismiss button */}
        <div className="px-6 pb-6">
          <button
            onClick={() => {
              announce(`Starting ${brief.title}`);
              onDismiss?.();
            }}
            className="w-full py-4 rounded-xl text-white font-bold text-base transition-colors hover:brightness-110 focus:outline-2 focus:outline-offset-2 focus:outline-blue-600"
            style={{ backgroundColor: brief.color, minHeight: '48px' }}
            aria-label={`Got it, start ${brief.title}`}
            autoFocus
          >
            Got it, let's start
          </button>
        </div>
      </div>
    </div>
  );
}
