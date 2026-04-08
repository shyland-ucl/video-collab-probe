import { Router } from 'express';
import path from 'path';
import { readProject, writeProject, listProjects } from '../services/projectStore.js';
import { resegment } from '../services/segmentation.js';

const router = Router();

// List all projects
router.get('/', async (req, res) => {
  try {
    const projects = await listProjects(req.app.locals.workspace);
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get a single project
router.get('/:projectId', async (req, res) => {
  try {
    const project = await readProject(req.app.locals.workspace, req.params.projectId);
    res.json(project);
  } catch (err) {
    res.status(404).json({ error: `Project '${req.params.projectId}' not found.` });
  }
});

// Update segments (from review UI)
router.put('/:projectId/segments', async (req, res) => {
  try {
    const workspace = req.app.locals.workspace;
    const { projectId } = req.params;
    const { segments } = req.body;

    if (!Array.isArray(segments)) {
      return res.status(400).json({ error: 'segments must be an array.' });
    }

    const project = await readProject(workspace, projectId);
    const projectDir = path.join(workspace, projectId);
    const sourceFile = path.join(projectDir, 'original', 'source.mp4');

    // Determine which segments changed boundaries
    const oldMap = new Map(project.segments.map(s => [s.id, s]));
    const changedSegments = segments.filter(s => {
      const old = oldMap.get(s.id);
      return !old || old.start_seconds !== s.start_seconds || old.end_seconds !== s.end_seconds;
    });

    // Re-extract changed segments
    if (changedSegments.length > 0) {
      await resegment(projectDir, sourceFile, changedSegments);
    }

    project.segments = segments;
    project.segmentation.manually_adjusted = true;
    project.status.reviewed = true;
    // Reset description status since segments changed
    if (changedSegments.length > 0) {
      project.status.descriptions_generated = false;
      project.status.ready_for_probe = false;
    }
    await writeProject(workspace, projectId, project);

    res.json(project);
  } catch (err) {
    console.error('Segment update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Mark project as reviewed (without segment changes)
router.post('/:projectId/mark-reviewed', async (req, res) => {
  try {
    const workspace = req.app.locals.workspace;
    const project = await readProject(workspace, req.params.projectId);
    project.status.reviewed = true;
    await writeProject(workspace, req.params.projectId, project);
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
