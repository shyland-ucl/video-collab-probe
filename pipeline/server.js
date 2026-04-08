import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import uploadRouter from './routes/upload.js';
import projectsRouter from './routes/projects.js';
import descriptionsRouter from './routes/descriptions.js';
import exportRouter from './routes/export.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PIPELINE_PORT || 3001;
const WORKSPACE = process.env.FOOTAGE_WORKSPACE || path.join(__dirname, '..', 'footage_workspace');

// Make workspace path available to routes
app.locals.workspace = WORKSPACE;

app.use(express.json());

// CORS — allow the probe app (Vite dev server) to call pipeline API
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', workspace: WORKSPACE });
});

app.listen(PORT, () => {
  console.log(`Pipeline server running on http://localhost:${PORT}`);
  console.log(`Workspace: ${WORKSPACE}`);
});
