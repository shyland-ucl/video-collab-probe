import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { createProject, readProject, writeProject, listProjects, deleteProject } from './pipeline/services/projectStore.js';
import { getVideoMeta, segmentVideo, resegment } from './pipeline/services/segmentation.js';
import { generateDescriptions, generateVideoMeta } from './pipeline/services/geminiDescriptions.js';
import { readAssignments, writeAssignments } from './pipeline/services/assignmentsStore.js';
import workflowRouter from './pipeline/routes/workflow.js';
import { isValidProjectId, isValidSegmentId, validateIdParam } from './pipeline/services/validate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env file so GEMINI_API_KEY works without VITE_ prefix
function loadEnvFile(dir) {
  try {
    const envFile = readFileSync(path.join(dir, '.env'), 'utf-8');
    for (const line of envFile.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
    console.log(`[pipeline] Loaded .env from ${dir}`);
  } catch {
    // No .env file at this path
  }
}
loadEnvFile(__dirname);
loadEnvFile(process.cwd());

/**
 * Vite plugin that mounts the footage pipeline API on the dev server.
 * All pipeline routes are served under /api/pipeline/* so there's
 * no need for a separate server process.
 */
export default function pipelinePlugin() {
  const WORKSPACE = process.env.FOOTAGE_WORKSPACE || path.join(__dirname, 'footage_workspace');
  const MAX_SIZE_MB = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '500', 10);

  return {
    name: 'pipeline-api',
    configureServer(server) {
      // Use a full Express app (not Router) so res.status()/res.json() work
      // inside Vite's Connect-based middleware stack.
      const app = express();
      app.locals.workspace = WORKSPACE;
      app.use(express.json());

      // Every :id / :segId here is interpolated into a filesystem path
      // (path.join(WORKSPACE, id, ...)). Reject path-unsafe values before any
      // handler runs, so "../" can't escape the workspace (read/write/delete).
      app.param('id', validateIdParam('id'));
      app.param('segId', validateIdParam('segId'));

      // Multer for file uploads
      const upload = multer({
        dest: path.join(WORKSPACE, '.tmp'),
        limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
          if (path.extname(file.originalname).toLowerCase() !== '.mp4') {
            cb(new Error('Only .mp4 files are accepted'));
            return;
          }
          cb(null, true);
        },
      });

      // ── Health ──
      app.get('/health', (req, res) => {
        res.json({ status: 'ok', workspace: WORKSPACE });
      });

      // ── Upload + segment ──
      app.post('/upload', upload.single('file'), async (req, res) => {
        try {
          // Auto-generate project ID from filename if not provided
          let project_id = req.body.project_id;
          if (!project_id || !isValidProjectId(project_id)) {
            const baseName = (req.file?.originalname || 'video')
              .replace(/\.[^/.]+$/, '')          // strip extension
              .replace(/[^a-zA-Z0-9_-]/g, '_')  // sanitise
              .replace(/_+/g, '_')               // collapse multiple underscores
              .slice(0, 40);                     // limit length
            project_id = `${baseName}_${Date.now().toString(36)}`;
          }
          const segLen = parseInt(req.body.segment_length || '3', 10);
          if (segLen !== 3 && segLen !== 5) {
            return res.status(400).json({ error: 'segment_length must be 3 or 5.' });
          }
          if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.' });
          }

          const projectDir = path.join(WORKSPACE, project_id);
          try {
            await fs.access(projectDir);
            return res.status(409).json({ error: `Project '${project_id}' already exists.` });
          } catch { /* good */ }

          const project = await createProject(WORKSPACE, project_id, req.file.originalname, segLen);
          const destPath = path.join(projectDir, 'original', 'source.mp4');
          await fs.rename(req.file.path, destPath);

          const meta = await getVideoMeta(destPath);
          Object.assign(project.source, {
            duration_seconds: meta.duration,
            width: meta.width,
            height: meta.height,
            fps: meta.fps,
            size_bytes: meta.size,
          });
          // Store creation date and upload timestamp
          project.source.creation_time = meta.creation_time || null;
          project.uploaded_at = new Date().toISOString();
          project.status.uploaded = true;
          await writeProject(WORKSPACE, project_id, project);

          const segments = await segmentVideo(projectDir, destPath, segLen, meta.duration,
            (cur, tot) => console.log(`[pipeline] ${project_id}: segment ${cur}/${tot}`)
          );
          project.segments = segments;
          project.segmentation.segmented_at = new Date().toISOString();
          project.status.segmented = true;
          await writeProject(WORKSPACE, project_id, project);

          res.json({ project_id, status: project.status, segments_count: segments.length });
        } catch (err) {
          console.error('[pipeline] Upload error:', err);
          if (req.file?.path) { try { await fs.unlink(req.file.path); } catch {} }
          res.status(500).json({ error: err.message });
        }
      });

      // ── List projects ──
      app.get('/projects', async (req, res) => {
        try {
          res.json(await listProjects(WORKSPACE));
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      });

      // ── Get project ──
      app.get('/projects/:id', async (req, res) => {
        try {
          res.json(await readProject(WORKSPACE, req.params.id));
        } catch {
          res.status(404).json({ error: 'Project not found.' });
        }
      });

      // ── Delete project ──
      app.delete('/projects/:id', async (req, res) => {
        try {
          const { id } = req.params;
          // Verify it exists first
          await readProject(WORKSPACE, id);
          await deleteProject(WORKSPACE, id);
          res.json({ deleted: true, project_id: id });
        } catch {
          res.status(404).json({ error: 'Project not found.' });
        }
      });

      // ── Update segments ──
      app.put('/projects/:id/segments', async (req, res) => {
        try {
          const { id } = req.params;
          const { segments } = req.body;
          if (!Array.isArray(segments)) return res.status(400).json({ error: 'segments must be an array.' });

          // Validate the body before it's persisted or fed to ffmpeg.
          for (const s of segments) {
            if (!s || !isValidSegmentId(s.id)) {
              return res.status(400).json({ error: `Invalid segment id: ${s?.id}` });
            }
            const start = Number(s.start_seconds);
            const end = Number(s.end_seconds);
            if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < 0) {
              return res.status(400).json({ error: `Invalid boundaries for segment ${s.id}.` });
            }
          }

          const project = await readProject(WORKSPACE, id);
          const projectDir = path.join(WORKSPACE, id);
          const sourceFile = path.join(projectDir, 'original', 'source.mp4');

          const oldMap = new Map(project.segments.map(s => [s.id, s]));
          const changed = segments.filter(s => {
            const old = oldMap.get(s.id);
            return !old || old.start_seconds !== s.start_seconds || old.end_seconds !== s.end_seconds;
          });
          if (changed.length > 0) await resegment(projectDir, sourceFile, changed);

          project.segments = segments;
          project.segmentation.manually_adjusted = true;
          project.status.reviewed = true;
          if (changed.length > 0) {
            project.status.descriptions_generated = false;
            project.status.descriptions_reviewed = false;
            project.status.suggestions_generated = false;
            project.status.ready_for_probe = false;
            project.suggestions = [];
          }
          await writeProject(WORKSPACE, id, project);
          res.json(project);
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      });

      // ── Mark reviewed ──
      app.post('/projects/:id/mark-reviewed', async (req, res) => {
        try {
          const project = await readProject(WORKSPACE, req.params.id);
          project.status.reviewed = true;
          await writeProject(WORKSPACE, req.params.id, project);
          res.json(project);
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      });

      // ── Generate descriptions ──
      app.post('/projects/:id/generate_descriptions', async (req, res) => {
        try {
          const { id } = req.params;
          const project = await readProject(WORKSPACE, id);
          if (!project.status.segmented) {
            return res.status(400).json({ error: 'Project must be segmented first.' });
          }

          const projectDir = path.join(WORKSPACE, id);
          const promptsDir = path.join(__dirname, 'pipeline', 'prompts');
          const [sharedStyle, descPrompt] = await Promise.all([
            fs.readFile(path.join(promptsDir, '_shared_style.txt'), 'utf-8'),
            fs.readFile(path.join(promptsDir, 'description_generation.txt'), 'utf-8'),
          ]);
          const promptTemplate = `${sharedStyle.trim()}\n\n${descPrompt.trim()}\n`;

          const result = await generateDescriptions(projectDir, project.segments, promptTemplate,
            (cur, tot) => console.log(`[pipeline] ${id}: descriptions ${cur}/${tot}`)
          );

          project.status.descriptions_generated = true;
          project.status.descriptions_reviewed = false;
          project.status.suggestions_generated = false;
          project.status.ready_for_probe = false;
          project.suggestions = [];

          // Generate AI title and summary from descriptions
          try {
            const videoMeta = await generateVideoMeta(project.segments);
            project.ai_title = videoMeta.title;
            project.ai_summary = videoMeta.summary;
            console.log(`[pipeline] ${id}: AI title = "${videoMeta.title}"`);
          } catch (metaErr) {
            console.error(`[pipeline] ${id}: Failed to generate title/summary:`, metaErr.message);
          }

          await writeProject(WORKSPACE, id, project);
          res.json(result);
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      });

      // ── Edit segment descriptions ──
      app.put('/projects/:id/segments/:segId/descriptions', async (req, res) => {
        try {
          const { id, segId } = req.params;
          const { level_1, level_2, level_3 } = req.body;
          const project = await readProject(WORKSPACE, id);
          const seg = project.segments.find(s => s.id === segId);
          if (!seg) return res.status(404).json({ error: 'Segment not found.' });

          if (level_1 !== undefined) seg.descriptions.level_1 = level_1;
          if (level_2 !== undefined) seg.descriptions.level_2 = level_2;
          if (level_3 !== undefined) seg.descriptions.level_3 = level_3;
          seg.manually_edited = true;
          await writeProject(WORKSPACE, id, project);
          res.json(seg);
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      });

      // ── Export for probe app ──
      app.get('/projects/:id/export', async (req, res) => {
        try {
          const { id } = req.params;
          const project = await readProject(WORKSPACE, id);

          const COLORS = [
            '#E74C3C', '#F0AD4E', '#5BC0DE', '#5CB85C', '#D9534F',
            '#337AB7', '#9B59B6', '#E67E22', '#1ABC9C', '#34495E',
          ];
          const probeData = {
            video: {
              id: project.project_id,
              title: project.ai_title || project.project_id.replace(/[_-]/g, ' '),
              src: `/pipeline-workspace/${project.project_id}/original/source.mp4`,
              duration: project.source.duration_seconds,
              summary: project.ai_summary || '',
              suggestions: project.suggestions || [],
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

          const exportPath = path.join(WORKSPACE, id, 'export_for_probe.json');
          await fs.writeFile(exportPath, JSON.stringify(probeData, null, 2));

          // Mark project as ready for probe
          project.status.ready_for_probe = true;
          await writeProject(WORKSPACE, id, project);

          res.json(probeData);
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      });

      // ── Dyad → project assignments (server-side, cross-origin) ──
      // Replaces the per-origin localStorage scheme so the researcher
      // dashboard on one origin and probe pages on another (LAN IP /
      // tunnel) share the same assignment table.
      app.get('/assignments', async (req, res) => {
        try {
          res.json(await readAssignments(WORKSPACE));
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      });

      app.put('/assignments', async (req, res) => {
        try {
          const body = req.body || {};
          await writeAssignments(WORKSPACE, body);
          res.json({ ok: true, assignments: body });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      });

      app.use('/projects', workflowRouter);

      // Error handler (must be last, 4-arg signature). Without it, a rejected
      // upload (oversized, non-.mp4) returns a default HTML 500 and leaves the
      // multer temp file on disk. Return JSON and clean up.
      // eslint-disable-next-line no-unused-vars
      app.use((err, req, res, next) => {
        if (req.file?.path) {
          fs.unlink(req.file.path).catch(() => {});
        }
        const status = err?.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        res.status(status).json({ error: err?.message || 'Request failed.' });
      });

      // ── Serve workspace files (videos, keyframes) ──
      // Must be mounted BEFORE the Express app so it doesn't get caught by Express 404
      server.middlewares.use('/pipeline-workspace', express.static(WORKSPACE));

      // ── Mount API routes (after static, so static files aren't caught by Express) ──
      server.middlewares.use('/api/pipeline', app);
    },
  };
}
