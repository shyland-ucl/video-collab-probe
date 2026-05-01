import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readProject, writeProject } from '../services/projectStore.js';
import { generateDescriptions } from '../services/geminiDescriptions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// Generate descriptions for all segments
router.post('/:projectId/generate_descriptions', async (req, res) => {
  try {
    const workspace = req.app.locals.workspace;
    const { projectId } = req.params;
    const project = await readProject(workspace, projectId);

    if (!project.status.segmented) {
      return res.status(400).json({ error: 'Project must be segmented before generating descriptions.' });
    }

    const projectDir = path.join(workspace, projectId);

    // Load prompt template = shared style block + description-specific task.
    // Keeping these split lets Live VQA reuse the same style rules.
    const promptsDir = path.join(__dirname, '..', 'prompts');
    const [sharedStyle, descPrompt] = await Promise.all([
      fs.readFile(path.join(promptsDir, '_shared_style.txt'), 'utf-8'),
      fs.readFile(path.join(promptsDir, 'description_generation.txt'), 'utf-8'),
    ]);
    const promptTemplate = `${sharedStyle.trim()}\n\n${descPrompt.trim()}\n`;

    console.log(`[${projectId}] Starting description generation for ${project.segments.length} segments...`);

    const result = await generateDescriptions(
      projectDir,
      project.segments,
      promptTemplate,
      (current, total) => {
        console.log(`[${projectId}] Descriptions: ${current}/${total}`);
      }
    );

    project.status.descriptions_generated = true;
    if (result.failed === 0 && project.status.reviewed) {
      project.status.ready_for_probe = true;
    }
    await writeProject(workspace, projectId, project);

    res.json(result);
  } catch (err) {
    console.error('Description generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update a single segment's descriptions (manual edit)
router.put('/:projectId/segments/:segmentId/descriptions', async (req, res) => {
  try {
    const workspace = req.app.locals.workspace;
    const { projectId, segmentId } = req.params;
    const { level_1, level_2, level_3 } = req.body;

    const project = await readProject(workspace, projectId);
    const seg = project.segments.find(s => s.id === segmentId);

    if (!seg) {
      return res.status(404).json({ error: `Segment '${segmentId}' not found.` });
    }

    if (level_1 !== undefined) seg.descriptions.level_1 = level_1;
    if (level_2 !== undefined) seg.descriptions.level_2 = level_2;
    if (level_3 !== undefined) seg.descriptions.level_3 = level_3;
    seg.manually_edited = true;

    await writeProject(workspace, projectId, project);
    res.json(seg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
