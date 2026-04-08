import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { readProject } from '../services/projectStore.js';

const router = Router();

/**
 * Transform project segments into the probe app's description format.
 * Matches the structure in /public/data/descriptions.json.
 */
function transformForProbe(project) {
  const COLORS = [
    '#E74C3C', '#F0AD4E', '#5BC0DE', '#5CB85C', '#D9534F',
    '#337AB7', '#9B59B6', '#E67E22', '#1ABC9C', '#34495E',
    '#E91E63', '#00BCD4', '#8BC34A', '#FF9800', '#795548',
  ];

  return {
    video: {
      id: project.project_id,
      title: project.project_id.replace(/[_-]/g, ' '),
      src: `/workspace/${project.project_id}/original/source.mp4`,
      duration: project.source.duration_seconds,
      segments: project.segments.map((seg, i) => ({
        id: seg.id.replace('_', '-'),
        start_time: seg.start_seconds,
        end_time: seg.end_seconds,
        name: seg.label,
        color: COLORS[i % COLORS.length],
        descriptions: {
          level_1: seg.descriptions.level_1 || '',
          level_2: seg.descriptions.level_2 || '',
          level_3: seg.descriptions.level_3 || '',
        },
        vqa_prepared: {},
        ai_edits_prepared: {},
      })),
    },
  };
}

// Export project data in probe app format
router.get('/:projectId/export', async (req, res) => {
  try {
    const workspace = req.app.locals.workspace;
    const { projectId } = req.params;
    const project = await readProject(workspace, projectId);

    const probeData = transformForProbe(project);

    // Also write to disk
    const exportPath = path.join(workspace, projectId, 'export_for_probe.json');
    await fs.writeFile(exportPath, JSON.stringify(probeData, null, 2));

    res.json(probeData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
