import ConditionHeader from '../shared/ConditionHeader.jsx';
import OnboardingBrief from '../shared/OnboardingBrief.jsx';

const COLORS = {
  navy: '#1F3864',
};

export default function DecoupledWaitingScreen({
  condition,
  accentColor = '#9B59B6',
  role,
  modeLabel,
  showOnboarding,
  onDismissOnboarding,
}) {
  return (
    <div className="min-h-screen bg-white">
      {showOnboarding && (
        <OnboardingBrief condition={condition} onDismiss={onDismissOnboarding} />
      )}
      <ConditionHeader condition={condition} modeLabel={modeLabel} />
      <div className="max-w-lg mx-auto mt-16 px-4 text-center">
        <div
          className="w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center animate-pulse"
          style={{ backgroundColor: `${accentColor}20` }}
        >
          <svg
            width="32" height="32" viewBox="0 0 24 24" fill="none"
            stroke={accentColor} strokeWidth="2"
            className="animate-spin" style={{ animationDuration: '3s' }}
          >
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: COLORS.navy }}>
          Waiting for {role === 'creator' ? 'helper' : 'creator'}...
        </h2>
        <p className="text-gray-500 text-sm">
          Ask the other person to open this page and select their role.
        </p>
      </div>
    </div>
  );
}
