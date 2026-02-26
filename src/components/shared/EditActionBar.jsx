import { useCallback } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';

const actions = [
  { id: 'trim_start', label: 'Trim Start' },
  { id: 'trim_end', label: 'Trim End' },
  { id: 'add_caption', label: 'Add Caption' },
  { id: 'add_audio_description', label: 'Add Audio Description' },
  { id: 'mark_for_review', label: 'Mark for Review' },
];

export default function EditActionBar() {
  const { logEvent } = useEventLogger();

  const handleAction = useCallback((actionId) => {
    logEvent(EventTypes.EDIT_ACTION, Actors.CREATOR, { action: actionId });
  }, [logEvent]);

  return (
    <div role="toolbar" aria-label="Edit actions" className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <button
          key={action.id}
          onClick={() => handleAction(action.id)}
          className="px-3 py-2 text-sm font-medium rounded border-2 transition-colors focus:outline-2 focus:outline-offset-2"
          style={{
            borderColor: '#2B579A',
            color: '#2B579A',
            backgroundColor: 'transparent',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#2B579A';
            e.currentTarget.style.color = '#FFFFFF';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#2B579A';
          }}
          aria-label={action.label}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
