#!/usr/bin/env node

/**
 * Run the full participant-footage preparation workflow:
 * 1. Generate missing Gemini descriptions.
 * 2. Review/refine those descriptions against each segment video.
 * 3. Generate exactly three prototype-feasible improvement suggestions.
 *
 * Usage:
 *   node scripts/process_footage_workflow.js --project-id <id>
 *   node scripts/process_footage_workflow.js --project-id <id> --creator-goal "make pacing tighter"
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { runFootageWorkflow } from '../pipeline/services/geminiWorkflow.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadEnvFile(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf-8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env is optional if the caller already exported variables.
  }
}

function parseArgs(argv) {
  const args = {
    creatorGoals: [],
    reviewDescriptions: true,
    generateSuggestions: true,
    generateMissingDescriptions: true,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--project-id' && argv[i + 1]) {
      args.projectId = argv[++i];
    } else if (arg === '--creator-goal' && argv[i + 1]) {
      args.creatorGoals.push(argv[++i]);
    } else if (arg === '--skip-description-review') {
      args.reviewDescriptions = false;
    } else if (arg === '--skip-suggestions') {
      args.generateSuggestions = false;
    } else if (arg === '--no-generate-missing-descriptions') {
      args.generateMissingDescriptions = false;
    }
  }

  return args;
}

async function main() {
  await loadEnvFile(path.join(__dirname, '..', '.env'));

  const args = parseArgs(process.argv);
  if (!args.projectId) {
    console.error('Usage: node scripts/process_footage_workflow.js --project-id <id>');
    process.exit(1);
  }

  const workspace = process.env.FOOTAGE_WORKSPACE
    || path.join(__dirname, '..', 'footage_workspace');

  console.log(`Running footage workflow for ${args.projectId}...`);
  const result = await runFootageWorkflow(workspace, args.projectId, {
    creatorGoals: args.creatorGoals,
    reviewDescriptions: args.reviewDescriptions,
    generateSuggestions: args.generateSuggestions,
    generateMissingDescriptions: args.generateMissingDescriptions,
    onProgress(task, current, total) {
      process.stdout.write(`\r  ${task}: ${current}/${total}`);
      if (current === total) process.stdout.write('\n');
    },
  });

  const reviewed = result.descriptions_reviewed?.reviewed || 0;
  const reviewFailed = result.descriptions_reviewed?.failed || 0;
  const suggestions = result.suggestions_generated?.generated || 0;

  console.log(`Reviewed descriptions: ${reviewed} ok, ${reviewFailed} failed`);
  console.log(`Generated suggestions: ${suggestions}`);
  if (result.context_questions.length > 0) {
    console.log('Context checks to confirm:');
    for (const item of result.context_questions) {
      for (const question of item.questions) {
        console.log(`  - ${item.label}: ${question}`);
      }
    }
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
