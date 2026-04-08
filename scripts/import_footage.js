#!/usr/bin/env node

/**
 * CLI script to import footage into the pipeline.
 *
 * Usage:
 *   node scripts/import_footage.js --file <path> --project-id <id> --segment-length 3
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProject, writeProject } from '../pipeline/services/projectStore.js';
import { getVideoMeta, segmentVideo } from '../pipeline/services/segmentation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--file' && argv[i + 1]) args.file = argv[++i];
    else if (argv[i] === '--project-id' && argv[i + 1]) args.projectId = argv[++i];
    else if (argv[i] === '--segment-length' && argv[i + 1]) args.segmentLength = parseInt(argv[++i], 10);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.file || !args.projectId) {
    console.error('Usage: node scripts/import_footage.js --file <path> --project-id <id> [--segment-length 3|5]');
    process.exit(1);
  }

  const segLen = args.segmentLength || 3;
  if (segLen !== 3 && segLen !== 5) {
    console.error('Error: --segment-length must be 3 or 5');
    process.exit(1);
  }

  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(args.projectId)) {
    console.error('Error: project-id must be alphanumeric with underscore/hyphen (max 64 chars)');
    process.exit(1);
  }

  const workspace = process.env.FOOTAGE_WORKSPACE || path.join(__dirname, '..', 'footage_workspace');
  const projectDir = path.join(workspace, args.projectId);

  // Check if project exists
  try {
    await fs.access(projectDir);
    console.error(`Error: Project '${args.projectId}' already exists at ${projectDir}`);
    process.exit(1);
  } catch {
    // Good
  }

  // Verify source file
  const sourceFile = path.resolve(args.file);
  try {
    await fs.access(sourceFile);
  } catch {
    console.error(`Error: File not found: ${sourceFile}`);
    process.exit(1);
  }

  console.log(`Creating project '${args.projectId}'...`);
  const project = await createProject(workspace, args.projectId, path.basename(sourceFile), segLen);

  // Copy file to project
  const destPath = path.join(projectDir, 'original', 'source.mp4');
  await fs.copyFile(sourceFile, destPath);
  console.log(`Copied source to ${destPath}`);

  // Get metadata
  console.log('Analyzing video...');
  const meta = await getVideoMeta(destPath);
  project.source.duration_seconds = meta.duration;
  project.source.width = meta.width;
  project.source.height = meta.height;
  project.source.fps = meta.fps;
  project.source.size_bytes = meta.size;
  project.status.uploaded = true;
  console.log(`  Duration: ${meta.duration}s, Resolution: ${meta.width}x${meta.height}, FPS: ${meta.fps}`);

  // Segment
  console.log(`Segmenting into ${segLen}s segments...`);
  const segments = await segmentVideo(
    projectDir,
    destPath,
    segLen,
    meta.duration,
    (current, total) => {
      process.stdout.write(`\r  Progress: ${current}/${total}`);
    }
  );
  console.log('');

  project.segments = segments;
  project.segmentation.segmented_at = new Date().toISOString();
  project.status.segmented = true;
  await writeProject(workspace, args.projectId, project);

  console.log(`Done! ${segments.length} segments created.`);
  console.log(`Project directory: ${projectDir}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Review segments in the pipeline UI`);
  console.log(`  2. Generate descriptions: node scripts/generate_descriptions.js --project-id ${args.projectId}`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
