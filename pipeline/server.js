import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import uploadRouter from './routes/upload.js';
import projectsRouter from './routes/projects.js';
import descriptionsRouter from './routes/descriptions.js';
import exportRouter from './routes/export.js';
import workflowRouter from './routes/workflow.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PIPELINE_PORT || 3001;
// Bind to loopback by default so the unauthenticated API isn't reachable from
// the LAN. Set PIPELINE_HOST=0.0.0.0 to expose it deliberately (e.g. for a
// phone on the same network) — and then also set PIPELINE_ALLOWED_ORIGINS.
const HOST = process.env.PIPELINE_HOST || '127.0.0.1';
const WORKSPACE = process.env.FOOTAGE_WORKSPACE || path.join(__dirname, '..', 'footage_workspace');

// Allowed cross-origin callers. Defaults to the Vite dev origins; override with
// a comma-separated PIPELINE_ALLOWED_ORIGINS list. "*" opts back into the old
// allow-any behaviour (not recommended — the API has no auth and can run
// ffmpeg / delete projects).
const ALLOWED_ORIGINS = (process.env.PIPELINE_ALLOWED_ORIGINS ||
  'http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map((o) => o.trim()).filter(Boolean);
const ALLOW_ANY_ORIGIN = ALLOWED_ORIGINS.includes('*');

// Make workspace path available to routes
app.locals.workspace = WORKSPACE;

app.use(express.json());

// CORS — only reflect the Origin header for allow-listed origins. Because all
// mutating routes use application/json (which triggers a preflight), an
// origin that isn't allowed is blocked by the browser before the request runs.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOW_ANY_ORIGIN) {
    res.header('Access-Control-Allow-Origin', '*');
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Serve segment video files and keyframes from workspace
app.use('/workspace', express.static(WORKSPACE));

// Routes
app.use('/api', uploadRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/projects', descriptionsRouter);
app.use('/api/projects', exportRouter);
app.use('/api/projects', workflowRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', workspace: WORKSPACE });
});

// Error handler (must be last, 4-arg signature) — returns JSON for rejected
// uploads (oversized / non-.mp4) instead of a default HTML 500, and cleans up
// any leftover multer temp file.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (req.file?.path) {
    import('fs/promises').then(({ default: fsp }) => fsp.unlink(req.file.path).catch(() => {}));
  }
  const status = err?.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
  res.status(status).json({ error: err?.message || 'Request failed.' });
});

app.listen(PORT, HOST, () => {
  console.log(`Pipeline server running on http://${HOST}:${PORT}`);
  console.log(`Workspace: ${WORKSPACE}`);
  console.log(`Allowed origins: ${ALLOW_ANY_ORIGIN ? '* (any)' : ALLOWED_ORIGINS.join(', ')}`);
});
