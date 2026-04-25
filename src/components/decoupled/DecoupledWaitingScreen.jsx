import { useEffect, useState } from 'react';
import ConditionHeader from '../shared/ConditionHeader.jsx';
import OnboardingBrief from '../shared/OnboardingBrief.jsx';
import { announce } from '../../utils/announcer.js';

const COLORS = {
  navy: '#1F3864',
};

const TROUBLE_TIMEOUT_MS = 10000;

/**
 * Waiting-for-pair screen for decoupled probes (2b, 3).
 *
 * If pairing doesn't complete within TROUBLE_TIMEOUT_MS, surface a
 * "Trouble connecting?" banner with a refresh button so participants can
 * self-recover from stuck pairing without needing the researcher to step in.
 * See docs/walkthrough_findings_2026-04-25_spotcheck.md NF1 for the failure
 * mode this addresses (zombie WebSocket slots leaving both sides on this
 * screen indefinitely).
 */
export default function DecoupledWaitingScreen({
  condition,
  accentColor = '#9B59B6',
  role,
  modeLabel,
}) {
  const [showTrouble, setShowTrouble] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setShowTrouble(true);
      announce(
        'Connection is taking longer than expected. You can refresh this page to try again.'
      );
    }, TROUBLE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  const handleRefresh = () => {
    window.location.reload();
  };

  const otherRole = role === 'creator' ? 'helper' : 'creator';

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-lg mx-auto px-4">
        <OnboardingBrief
          pageTitle="Waiting for Connection"
          description={`You are the ${role}. Waiting for the ${otherRole} to connect. Ask them to open this same page on their phone and select their role. The session will start automatically once both people are connected.`}
        />
        <ConditionHeader condition={condition} modeLabel={modeLabel} />
        <div className="mt-12 text-center">
          <div
            className="w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center animate-pulse"
            style={{ backgroundColor: `${accentColor}20` }}
            aria-hidden="true"
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
            Waiting for {otherRole}...
          </h2>
          <p className="text-base text-gray-600">
            Ask the other person to open this page and select their role.
          </p>

          {showTrouble && (
            <div
              role="alert"
              className="mt-8 mx-auto max-w-sm p-4 rounded-lg border-2"
              style={{ borderColor: accentColor, backgroundColor: `${accentColor}10` }}
            >
              <p className="text-base font-medium mb-3" style={{ color: COLORS.navy }}>
                Trouble connecting?
              </p>
              <p className="text-sm text-gray-700 mb-4">
                If the other person has already opened the page, this device may
                be stuck. Tap the button below to refresh and try again.
              </p>
              <button
                onClick={handleRefresh}
                className="w-full py-3 rounded-lg text-white font-bold text-base focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
                style={{ backgroundColor: accentColor, minHeight: '48px' }}
                aria-label="Refresh this page to retry connecting"
              >
                Refresh page
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
