import { useState, useCallback } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { exportSessionData } from '../../services/dataExport.js';

/**
 * Button that exports all session event data as a structured ZIP file.
 * Uses the EventLogger context to access the current events array.
 */
export default function DataExportButton() {
  const { events, sessionStart } = useEventLogger();
  const [exported, setExported] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);

    try {
      const stored = localStorage.getItem('sessionConfig');
      const config = stored ? JSON.parse(stored) : {};

      const sessionMetadata = {
        sessionId: config.sessionId || 'unknown',
        dyadId: config.dyadId || 'unknown',
        conditionOrder: config.conditionOrder || [],
        sessionStart: new Date(sessionStart).toISOString(),
        exportedAt: new Date().toISOString(),
        totalEvents: events.length,
      };

      await exportSessionData(events, sessionMetadata);
      setExported(true);
      setTimeout(() => setExported(false), 2500);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [events, sessionStart, exporting]);

  return (
    <button
      onClick={handleExport}
      disabled={exporting || events.length === 0}
      className="inline-flex items-center gap-2 px-4 py-2 rounded text-white text-sm font-medium transition-colors disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-green-600"
      style={{ backgroundColor: exported ? '#27AE60' : '#2ECC71' }}
      aria-label="Export session data as ZIP file"
    >
      {/* Download icon */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      {exporting ? 'Exporting...' : exported ? 'Exported!' : 'Export Data'}
    </button>
  );
}
