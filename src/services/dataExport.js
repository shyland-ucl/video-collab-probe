import JSZip from 'jszip';
import { saveAs } from 'file-saver';

/**
 * Exports session data as a structured ZIP file.
 * Separates events by condition and creates specialised logs for each probe.
 */
export async function exportSessionData(events, sessionMetadata) {
  const zip = new JSZip();

  zip.file('session_metadata.json', JSON.stringify(sessionMetadata, null, 2));

  // Full event log
  zip.file('all_events.json', JSON.stringify(events, null, 2));

  const conditions = ['baseline', 'probe1', 'probe2', 'probe3'];
  for (const condition of conditions) {
    const conditionEvents = events.filter((e) => e.condition === condition);
    if (conditionEvents.length === 0) continue;

    const folder = zip.folder(condition);
    folder.file('event_log.json', JSON.stringify(conditionEvents, null, 2));

    if (condition === 'probe1') {
      const descEvents = conditionEvents.filter((e) =>
        [
          'DESCRIPTION_VIEWED',
          'DESCRIPTION_SPOKEN',
          'DESCRIPTION_LEVEL_CHANGE',
          'DESCRIPTION_FLAGGED',
        ].includes(e.eventType)
      );
      folder.file('description_interactions.json', JSON.stringify(descEvents, null, 2));

      const vqaEvents = conditionEvents.filter((e) =>
        ['VQA_QUESTION', 'VQA_ANSWER'].includes(e.eventType)
      );
      folder.file('vqa_log.json', JSON.stringify(vqaEvents, null, 2));
    }

    if (condition === 'probe2') {
      const handoverEvents = conditionEvents.filter(
        (e) =>
          e.eventType.startsWith('HANDOVER') ||
          e.eventType === 'INTENT_LOCKED' ||
          e.eventType === 'HELPER_ACTION'
      );
      folder.file('handover_log.json', JSON.stringify(handoverEvents, null, 2));
    }

    if (condition === 'probe3') {
      const syncEvents = conditionEvents.filter((e) =>
        [
          'DEVICE_CONNECTED',
          'DEVICE_DISCONNECTED',
          'SYNC_EVENT',
          'INDEPENDENT_MODE_TOGGLE',
        ].includes(e.eventType)
      );
      folder.file('sync_log.json', JSON.stringify(syncEvents, null, 2));
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  saveAs(blob, `session_export_${timestamp}.zip`);
}
