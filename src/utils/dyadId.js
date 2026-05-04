/**
 * Dyad ID normalisation. The protocol uses D01..D10, but participants
 * (and researchers in a hurry) sometimes type "2", "D2", "02", or "D02"
 * for the same dyad. We can't ask them to retype mid-session, so we
 * normalise both the typed value and the assignment-table keys to a
 * canonical form before comparing.
 *
 * Canonical form: uppercase, strip leading "D", strip leading zeros.
 *   "D02" → "2", "d2" → "2", "02" → "2", "2" → "2"
 *
 * Stays safe for non-numeric IDs: "DA" → "A" (the A remains, so it
 * won't collide with "B").
 */
export function normalizeDyadId(value) {
  if (value == null) return '';
  const trimmed = String(value).trim().toUpperCase();
  if (!trimmed) return '';
  const noPrefix = trimmed.startsWith('D') ? trimmed.slice(1) : trimmed;
  const noLeadingZeros = noPrefix.replace(/^0+/, '');
  // Preserve "0" itself if someone really meant zero
  return noLeadingZeros || (noPrefix === '' ? '' : '0');
}

/**
 * Find the assignment array for a given dyadId, normalising both sides.
 * Returns [] if no match.
 */
export function findAssignmentsForDyad(assignments, dyadId) {
  if (!assignments || !dyadId) return [];
  const target = normalizeDyadId(dyadId);
  if (!target) return [];
  for (const [key, value] of Object.entries(assignments)) {
    if (normalizeDyadId(key) === target) return value || [];
  }
  return [];
}
