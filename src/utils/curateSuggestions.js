/**
 * Probe 3 v2 — narrow a full suggestion bank down to a small,
 * focused set for participant review.
 *
 * Rules:
 *   1. Cap total at `maxCount` (default 3).
 *   2. Each surfaced suggestion attaches to exactly one scene.
 *   3. No two surfaced suggestions share a scene — keeps the per-scene
 *      view uncluttered and avoids the "everything has the same
 *      observation" feel of the unfiltered bank on long static videos.
 *   4. Priority order: issue > structural > creative (technical fixes
 *      first, since they tend to be the most actionable for editors).
 *
 * The original bank from `project.json` is unchanged — this function
 * returns a curated copy. Each curated suggestion has its
 * `relatedScene` field narrowed from a possible array down to the
 * single scene it was assigned to.
 */
const PRIORITY = { issue: 0, structural: 1, creative: 2 };

export function curateSuggestions(allSuggestions, maxCount = 3) {
  if (!Array.isArray(allSuggestions) || allSuggestions.length === 0) return [];

  const sorted = [...allSuggestions].sort((a, b) => {
    const pa = PRIORITY[a.category] ?? 99;
    const pb = PRIORITY[b.category] ?? 99;
    return pa - pb;
  });

  const usedScenes = new Set();
  const curated = [];

  for (const sug of sorted) {
    if (curated.length >= maxCount) break;
    const targets = Array.isArray(sug.relatedScene)
      ? sug.relatedScene
      : (sug.relatedScene == null ? [] : [sug.relatedScene]);
    const availableScene = targets.find((s) => s != null && !usedScenes.has(s));
    if (availableScene === undefined) continue;
    usedScenes.add(availableScene);
    curated.push({ ...sug, relatedScene: availableScene });
  }

  return curated;
}
