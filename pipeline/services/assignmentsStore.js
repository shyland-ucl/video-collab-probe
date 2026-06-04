import fs from 'fs/promises';
import path from 'path';

/**
 * Server-side dyad → project-id assignments. Replaces the
 * per-origin-localStorage approach so a researcher dashboard on one
 * origin (laptop localhost) and probe pages on another origin (LAN IP /
 * tunnel) share the same assignment table.
 *
 * Stored at `<workspace>/assignments.json`. Schema:
 *   { "D01": ["projectId1", "projectId2"], "D02": [...] }
 */

const FILE = 'assignments.json';

export async function readAssignments(workspace) {
  try {
    const raw = await fs.readFile(path.join(workspace, FILE), 'utf-8');
    const parsed = JSON.parse(raw);
    return validate(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function writeAssignments(workspace, assignments) {
  if (!validate(assignments)) {
    throw new Error('Invalid assignments shape: expected { dyadId: [projectId, ...] }');
  }
  await fs.mkdir(workspace, { recursive: true });
  const filePath = path.join(workspace, FILE);
  // Back up the previous table before overwriting (the API replaces the whole
  // map, so a wholesale/concurrent overwrite could otherwise lose assignments
  // with no recovery path).
  try {
    await fs.copyFile(filePath, `${filePath}.bak`);
  } catch { /* no existing file to back up */ }
  // Atomic write: temp file + rename, so a crash mid-write can't leave a
  // truncated/corrupt assignments.json.
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(assignments, null, 2));
  await fs.rename(tmpPath, filePath);
}

function validate(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  for (const [key, value] of Object.entries(obj)) {
    if (typeof key !== 'string') return false;
    if (!Array.isArray(value)) return false;
    if (!value.every((v) => typeof v === 'string')) return false;
  }
  return true;
}
