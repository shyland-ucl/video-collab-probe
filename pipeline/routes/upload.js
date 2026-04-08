import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { createProject, writeProject } from '../services/projectStore.js';
import { getVideoMeta, segmentVideo } from '../services/segmentation.js';

const router = Router();

const MAX_SIZE_MB = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '500', 10);

// Validate project ID: alphanumeric + underscore/hyphen, max 64 chars
function isValidProjectId(id) {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id);
}

// Configure multer for temp storage
const upload = multer({
  dest: path.join(process.env.TEMP || '/tmp', 'pipeline-uploads'),
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.mp4') {
      cb(new Error('Only .mp4 files are accepted'));
      return;
    }
    cb(null, true);
  },
});

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { project_id, segment_length } = req.body;
    const workspace = req.app.locals.workspace;

    if (!project_id || !isValidProjectId(project_id)) {
      return res.status(400).json({
        error: 'Invalid project_id. Use alphanumeric, underscore, or hyphen (max 64 chars).',
      });
    }

    const segLen = parseInt(segment_length || '3', 10);
    if (segLen !== 3 && segLen !== 5) {
      return res.status(400).json({ error: 'segment_length must be 3 or 5.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    // Check if project already exists
    const projectDir = path.join(workspace, project_id);
    try {
      await fs.access(projectDir);
      return res.status(409).json({ error: `Project '${project_id}' already exists.` });
    } catch {
      // Good — project doesn't exist yet
    }

    // Create project structure
    const project = await createProject(workspace, project_id, req.file.originalname, segLen);

    // Move uploaded file to project/original/source.mp4
    const destPath = path.join(projectDir, 'original', 'source.mp4');
    await fs.rename(req.file.path, destPath);

    // Get video metadata
    const meta = await getVideoMeta(destPath);
    project.source.duration_seconds = meta.duration;
    project.source.width = meta.width;
    project.source.height = meta.height;
    project.source.fps = meta.fps;
    project.source.size_bytes = meta.size;
    project.status.uploaded = true;
    await writeProject(workspace, project_id, project);

    // Run segmentation
    const segments = await segmentVideo(
      projectDir,
      destPath,
      segLen,
      meta.duration,
      (current, total) => {
        // Progress callback — could be sent via SSE in future
        console.log(`[${project_id}] Segmenting: ${current}/${total}`);
      }
    );

    project.segments = segments;
    project.segmentation.segmented_at = new Date().toISOString();
    project.status.segmented = true;
    await writeProject(workspace, project_id, project);

    res.json({ project_id, status: project.status, segments_count: segments.length });
  } catch (err) {
    console.error('Upload error:', err);
    // Clean up temp file if it exists
    if (req.file?.path) {
      try { await fs.unlink(req.file.path); } catch {}
    }
    res.status(500).json({ error: err.message });
  }
});

export default router;
