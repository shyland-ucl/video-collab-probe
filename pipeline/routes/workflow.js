import { Router } from 'express';
import { runFootageWorkflow } from '../services/geminiWorkflow.js';

const router = Router();

router.post('/:projectId/run_workflow', async (req, res) => {
  try {
    const workspace = req.app.locals.workspace;
    const { projectId } = req.params;
    const {
      creator_goals,
      creatorGoals,
      review_descriptions,
      generate_suggestions,
      generate_missing_descriptions,
    } = req.body || {};

    const result = await runFootageWorkflow(workspace, projectId, {
      creatorGoals: creatorGoals || creator_goals || [],
      reviewDescriptions: review_descriptions !== false,
      generateSuggestions: generate_suggestions !== false,
      generateMissingDescriptions: generate_missing_descriptions !== false,
    });

    res.json(result);
  } catch (err) {
    console.error('Footage workflow error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
