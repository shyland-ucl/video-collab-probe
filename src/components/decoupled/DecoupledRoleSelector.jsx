import ConditionHeader from '../shared/ConditionHeader.jsx';
import OnboardingBrief from '../shared/OnboardingBrief.jsx';

const COLORS = {
  navy: '#1F3864',
  blue: '#2B579A',
};

export default function DecoupledRoleSelector({
  condition,
  accentColor = '#9B59B6',
  onRoleSelect,
}) {
  return (
    <div className="min-h-screen bg-white">
      <ConditionHeader condition={condition} />
      <div className="max-w-lg mx-auto px-4">
        <OnboardingBrief
          pageTitle="Role Selection"
          description="Each person uses their own phone. Choose whether this device is for the creator or the helper. The creator has an audio and text interface optimised for screen readers. The helper has a visual interface with video editing tools. After both people select a role, the session will begin."
        />
        <h2 className="text-2xl font-bold text-center mt-6 mb-2" aria-hidden="true" style={{ color: COLORS.navy }}>
          Select Your Role
        </h2>
        <div className="flex gap-4">
          <button
            onClick={() => onRoleSelect('creator')}
            className="flex-1 py-6 rounded-xl border-2 text-center transition-colors hover:shadow-lg focus:outline-2 focus:outline-offset-2"
            style={{ borderColor: COLORS.blue }}
            aria-label="Select creator role — audio and text-optimised interface, primary playback control"
          >
            <div className="text-3xl mb-2" aria-hidden="true">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={COLORS.blue} strokeWidth="2" className="mx-auto">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
            </div>
            <div className="font-bold text-lg" style={{ color: COLORS.blue }}>Creator</div>
            <p className="text-xs text-gray-500 mt-1 px-3">
              Audio/text-optimised interface. Primary playback control.
            </p>
          </button>
          <button
            onClick={() => onRoleSelect('helper')}
            className="flex-1 py-6 rounded-xl border-2 text-center transition-colors hover:shadow-lg focus:outline-2 focus:outline-offset-2"
            style={{ borderColor: accentColor }}
            aria-label="Select helper role — visual-optimised interface, can request control or work independently"
          >
            <div className="text-3xl mb-2" aria-hidden="true">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2" className="mx-auto">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                <path d="M16 3l2 2-2 2" />
              </svg>
            </div>
            <div className="font-bold text-lg" style={{ color: accentColor }}>Helper</div>
            <p className="text-xs text-gray-500 mt-1 px-3">
              Visual-optimised interface. Can request control or work independently.
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
