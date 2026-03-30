import JSZip from 'jszip';
import { saveAs } from 'file-saver';

/**
 * Exports session data as a structured ZIP file.
 * Separates events by condition and creates specialised logs for each phase.
 */
export async function exportSessionData(events, sessionMetadata) {
  const zip = new JSZip();

  // Include phase transition timestamps in metadata
  try {
    const stored = localStorage.getItem('sessionConfig');
    if (stored) {
      const config = JSON.parse(stored);
      if (config.phaseTransitionTimestamp) {
        sessionMetadata = {
          ...sessionMetadata,
          phaseTransitionTimestamp: config.phaseTransitionTimestamp,
        };
      }
    }
  } catch { /* ignore */ }

  zip.file('session_metadata.json', JSON.stringify(sessionMetadata, null, 2));
  zip.file('all_events.json', JSON.stringify(events, null, 2));

  const conditions = ['probe1', 'probe2a', 'probe2b', 'probe3'];
  for (const condition of conditions) {
    const conditionEvents = events.filter((e) => e.condition === condition);
    if (conditionEvents.length === 0) continue;

    const folder = zip.folder(condition);
    folder.file('event_log.json', JSON.stringify(conditionEvents, null, 2));

    if (condition === 'probe1') {
      const descEvents = conditionEvents.filter((e) =>
        ['DESCRIPTION_VIEWED', 'DESCRIPTION_SPOKEN', 'DESCRIPTION_LEVEL_CHANGE', 'DESCRIPTION_FLAGGED'].includes(e.eventType)
      );
      folder.file('description_interactions.json', JSON.stringify(descEvents, null, 2));

      const vqaEvents = conditionEvents.filter((e) =>
        ['VQA_QUESTION', 'VQA_ANSWER'].includes(e.eventType)
      );
      folder.file('vqa_log.json', JSON.stringify(vqaEvents, null, 2));

      const fallbackEvents = conditionEvents.filter((e) => e.eventType === 'HELPER_FALLBACK');
      if (fallbackEvents.length > 0) {
        folder.file('helper_fallback_log.json', JSON.stringify(fallbackEvents, null, 2));
      }
    }

    if (condition === 'probe2a') {
      const handoverEvents = conditionEvents.filter((e) =>
        e.eventType.startsWith('HANDOVER') || e.eventType === 'INTENT_LOCKED' || e.eventType === 'HELPER_ACTION'
      );
      folder.file('handover_log.json', JSON.stringify(handoverEvents, null, 2));

      const voiceNoteEvents = conditionEvents.filter((e) =>
        ['RECORD_VOICE_NOTE', 'PLAY_VOICE_NOTE', 'DELETE_MARK'].includes(e.eventType)
      );
      if (voiceNoteEvents.length > 0) {
        folder.file('voice_notes_log.json', JSON.stringify(voiceNoteEvents, null, 2));
      }

      const taskEvents = conditionEvents.filter((e) => e.eventType === 'COMPLETE_TASK');
      if (taskEvents.length > 0) {
        folder.file('task_completion_log.json', JSON.stringify(taskEvents, null, 2));
      }
    }

    if (condition === 'probe2b') {
      const taskRouteEvents = conditionEvents.filter((e) =>
        ['TASK_ROUTE_SELF', 'TASK_ROUTE_AI', 'TASK_ROUTE_HELPER', 'HELPER_TASK_RECEIVED', 'HELPER_TASK_STATUS', 'AI_EDIT_RESPONSE'].includes(e.eventType)
      );
      folder.file('task_routing_log.json', JSON.stringify(taskRouteEvents, null, 2));

      const syncEvents = conditionEvents.filter((e) =>
        ['DEVICE_CONNECTED', 'DEVICE_DISCONNECTED', 'SYNC_EVENT'].includes(e.eventType)
      );
      folder.file('sync_log.json', JSON.stringify(syncEvents, null, 2));

      const aiEditEvents = conditionEvents.filter((e) =>
        ['AI_EDIT_RESPONSE', 'AI_EDIT_APPLIED', 'AI_EDIT_REVIEWED', 'AI_EDIT_UNDONE'].includes(e.eventType)
      );
      if (aiEditEvents.length > 0) {
        folder.file('ai_edit_log.json', JSON.stringify(aiEditEvents, null, 2));
      }
    }

    if (condition === 'probe3') {
      // Suggestion chain log
      const suggestionEvents = conditionEvents.filter((e) =>
        ['SUGGESTION_DEPLOYED', 'SUGGESTION_DISMISSED', 'SUGGESTION_NOTED', 'SUGGESTION_ROUTED', 'HELPER_SUGGESTION_RESPONSE', 'SUGGESTION_CHAIN_COMPLETE'].includes(e.eventType)
      );
      folder.file('suggestion_chain_log.json', JSON.stringify(suggestionEvents, null, 2));

      const taskRouteEvents = conditionEvents.filter((e) =>
        ['TASK_ROUTE_SELF', 'TASK_ROUTE_AI', 'TASK_ROUTE_HELPER', 'HELPER_TASK_RECEIVED', 'HELPER_TASK_STATUS', 'AI_EDIT_RESPONSE'].includes(e.eventType)
      );
      folder.file('task_routing_log.json', JSON.stringify(taskRouteEvents, null, 2));

      const syncEvents = conditionEvents.filter((e) =>
        ['DEVICE_CONNECTED', 'DEVICE_DISCONNECTED', 'SYNC_EVENT'].includes(e.eventType)
      );
      folder.file('sync_log.json', JSON.stringify(syncEvents, null, 2));

      const aiEditEvents = conditionEvents.filter((e) =>
        ['AI_EDIT_RESPONSE', 'AI_EDIT_APPLIED', 'AI_EDIT_REVIEWED', 'AI_EDIT_UNDONE'].includes(e.eventType)
      );
      if (aiEditEvents.length > 0) {
        folder.file('ai_edit_log.json', JSON.stringify(aiEditEvents, null, 2));
      }
    }
  }

  // Also export events with old 'probe2' condition (backwards compat)
  const legacyProbe2 = events.filter((e) => e.condition === 'probe2');
  if (legacyProbe2.length > 0) {
    const folder = zip.folder('probe2_legacy');
    folder.file('event_log.json', JSON.stringify(legacyProbe2, null, 2));
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  saveAs(blob, `session_export_${timestamp}.zip`);
}
