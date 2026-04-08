#!/usr/bin/env node

/**
 * CLI script to generate Gemini descriptions for a project's segments.
 *
 * Usage:
 *   node scripts/generate_descriptions.js --project-id <id>
 *
 * Requires: GEMINI_API_KEY environment variable
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readProject, writeProject } from '../pipeline/services/projectStore.js';
import { generateDescriptions } from '../pipeline/services/geminiDescriptions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--project-id' && argv[i + 1]) args.projectId = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.projectId) {
    console.error('Usage: node scripts/generate_descriptions.js --project-id <id>');
    process.exit(1);
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error('Error: GEMINI_API_KEY environment variable is not set.');
    process.exit(1);
  }

  const workspace = process.env.FOOTAGE_WORKSPACE || path.join(__dirname, '..', 'footage_workspace');
  const projectDir = path.join(workspace, args.projectId);

  let project;
  try {
    project = await readProject(workspace, args.projectId);
  } catch {
    console.error(`Error: Project '${args.projectId}' not found.`);
    process.exit(1);
  }

  if (!project.status.segmented) {
    console.error('Error: Project must be segmented first.');
    process.exit(1);
  }

  // Load prompt
  const promptPath = path.join(__dirname, '..', 'pipeline', 'prompts', 'description_generation.txt');
  const promptTemplate = await fs.readFile(promptPath, 'utf-8');

  console.log(`Generating descriptions for ${project.segments.length} segments...`);
  console.log(`Model: ${process.env.GEMINI_MODEL || 'gemini-2.5-pro'}`);

  const result = await generateDescriptions(
    projectDir,
    project.segments,
    promptTemplate,
    (current, total) => {
      process.stdout.write(`\r  Progress: ${current}/${total}`);
    }
  );
  console.log('');

  project.status.descriptions_generated = true;
  if (result.failed === 0 && project.status.reviewed) {
    project.status.ready_for_probe = true;
  }
  await writeProject(workspace, args.projectId, project);

  console.log(`\nResults: ${result.generated} generated, ${result.failed} failed`);
  if (result.failed_segment_ids.length > 0) {
    console.log(`Failed segments: ${result.failed_segment_ids.join(', ')}`);
  }
  console.log('Done!');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
