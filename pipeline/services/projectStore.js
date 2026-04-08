import fs from 'fs/promises';
import path from 'path';

/**
 * Read project.json for a given project.
 * @param {string} workspace - root workspace directory
 * @param {string} projectId
 * @returns {Promise<object>}
 */
export async function readProject(workspace, projectId) {
  const filePath = path.join(workspace, projectId, 'project.json');
  const data = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(data);
}

/**
 * Write project.json for a given project.
 * @param {string} workspace
 * @param {string} projectId
 * @param {object} project
 */
export async function writeProject(workspace, projectId, project) {
  const filePath = path.join(workspace, projectId, 'project.json');
  await fs.writeFile(filePath, JSON.stringify(project, null, 2));
}

/**
 * Create a new project directory and initial project.json.
 * @param {string} workspace
 * @param {string} projectId
 * @param {string} filename - original upload filename
 * @param {number} segmentLength
 * @returns {Promise<object>} the initial project object
 */
export async function createProject(workspace, projectId, filename, segmentLength) {
  const projectDir = path.join(workspace, projectId);
  await fs.mkdir(path.join(projectDir, 'original'), { recursive: true });
  await fs.mkdir(path.join(projectDir, 'segments'), { recursive: true });
  await fs.mkdir(path.join(projectDir, 'keyframes'), { recursive: true });
  await fs.mkdir(path.join(projectDir, 'logs'), { recursive: true });

  const project = {
    project_id: projectId,
    created_at: new Date().toISOString(),
    source: {
      filename,
      duration_seconds: null,
      width: null,
      height: null,
      fps: null,
      size_bytes: null,
    },
    segmentation: {
      method: 'fixed_length',
      segment_length_seconds: segmentLength,
      manually_adjusted: false,
      segmented_at: null,
    },
    segments: [],
    status: {
      uploaded: false,
      segmented: false,
      reviewed: false,
      descriptions_generated: false,
      ready_for_probe: false,
    },
  };

  await writeProject(workspace, projectId, project);
  return project;
}

/**
 * Delete a project directory and all its contents.
 * @param {string} workspace
 * @param {string} projectId
 */
export async function deleteProject(workspace, projectId) {
  const projectDir = path.join(workspace, projectId);
  await fs.rm(projectDir, { recursive: true, force: true });
}

/**
 * List all projects in the workspace.
 * @param {string} workspace
 * @returns {Promise<object[]>} array of project.json objects
 */
export async function listProjects(workspace) {
  let entries;
  try {
    entries = await fs.readdir(workspace, { withFileTypes: true });
  } catch {
    return [];
  }

  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const project = await readProject(workspace, entry.name);
      projects.push(project);
    } catch {
      // skip directories without valid project.json
    }
  }
  return projects;
}
