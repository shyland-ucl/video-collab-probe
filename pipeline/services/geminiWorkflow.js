import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { setTimeout as sleep } from 'timers/promises';
import { readProject, writeProject } from './projectStore.js';
import { generateDescriptions, generateVideoMeta } from './geminiDescriptions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MODEL = process.env.GEMINI_WORKFLOW_MODEL
  || process.env.GEMINI_MODEL
  || 'gemini-2.5-flash';

const FILE_POLL_INTERVAL_MS = 2000;
const FILE_POLL_ATTEMPTS = 60;

const AI_FIX_ACTIONS = new Set([
  'brightness',
  'contrast',
  'saturation',
  'zoom',
  'rotate',
  'mute',
  'unmute',
]);

const SUPPORTED_ACTIONS = new Set([
  ...AI_FIX_ACTIONS,
  'trim_start',
  'trim_end',
  'split',
  'delete',
  'reorder',
  'move_earlier',
  'move_later',
  'add_caption',
  'add_sound',
  'remove_sound',
]);

const CATEGORIES = new Set(['issue', 'structural', 'creative']);

function getApiKey() {
  return process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
}

function makeModel(apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  });
}

function stripJson(text) {
  let cleaned = String(text || '').trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

function parseJsonResponse(text) {
  return JSON.parse(stripJson(text));
}

async function logWorkflow(projectDir, payload) {
  const logFile = path.join(projectDir, 'logs', 'workflow_calls.log');
  await fs.mkdir(path.dirname(logFile), { recursive: true });
  await fs.appendFile(logFile, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    model: MODEL,
    ...payload,
  })}\n`);
}

async function uploadFilePart(fileManager, filePath, mimeType) {
  const uploaded = await fileManager.uploadFile(filePath, {
    mimeType,
    displayName: path.basename(filePath),
  });

  let file = uploaded.file;
  for (let attempt = 0; attempt < FILE_POLL_ATTEMPTS; attempt++) {
    if (file.state === 'ACTIVE') {
      return {
        uploadedFile: file,
        part: {
          fileData: {
            mimeType: file.mimeType || mimeType,
            fileUri: file.uri,
          },
        },
      };
    }
    if (file.state === 'FAILED') {
      throw new Error(`Gemini file processing failed for ${path.basename(filePath)}.`);
    }
    await sleep(FILE_POLL_INTERVAL_MS);
    file = await fileManager.getFile(file.name);
  }

  throw new Error(`Timed out waiting for Gemini to process ${path.basename(filePath)}.`);
}

async function deleteUploadedFile(fileManager, uploadedFile) {
  if (!uploadedFile?.name) return;
  try {
    await fileManager.deleteFile(uploadedFile.name);
  } catch {
    // Non-critical cleanup failure.
  }
}

function hasAnyDescription(descriptions) {
  return Boolean(
    descriptions?.level_1
    || descriptions?.level_2
    || descriptions?.level_3
  );
}

function descriptionsMissing(segments) {
  return segments.some((seg) => !hasAnyDescription(seg.descriptions));
}

function stringOrFallback(value, fallback = '') {
  const str = typeof value === 'string' ? value.trim() : '';
  return str || fallback || '';
}

function buildSegmentReviewPrompt(sharedStyle, reviewPrompt, project, segment, zeroBasedIndex) {
  const segmentMetadata = {
    id: segment.id,
    index: zeroBasedIndex,
    label: segment.label,
    start_seconds: segment.start_seconds,
    end_seconds: segment.end_seconds,
    duration_seconds: segment.duration_seconds,
  };
  const projectContext = {
    project_id: project.project_id,
    source_filename: project.source?.filename || null,
    ai_title: project.ai_title || null,
    ai_summary: project.ai_summary || null,
  };

  return `${sharedStyle.trim()}

${reviewPrompt.trim()}

PROJECT_CONTEXT:
${JSON.stringify(projectContext, null, 2)}

SEGMENT_METADATA:
${JSON.stringify(segmentMetadata, null, 2)}

EXISTING_DESCRIPTIONS:
${JSON.stringify(segment.descriptions || {}, null, 2)}
`;
}

function normalizeReviewResponse(parsed, segment) {
  const descriptions = parsed?.descriptions || parsed || {};
  const review = parsed?.review || {};
  const old = segment.descriptions || {};

  const changes = Array.isArray(review.changes)
    ? review.changes.map((item) => String(item).trim()).filter(Boolean).slice(0, 5)
    : [];
  const contextQuestions = Array.isArray(review.context_questions)
    ? review.context_questions.map((item) => String(item).trim()).filter(Boolean).slice(0, 3)
    : [];
  const needsContext = Boolean(review.needs_context || contextQuestions.length > 0);
  const rawStatus = String(review.status || '').toLowerCase();
  const status = needsContext
    ? 'needs_context'
    : rawStatus === 'confirmed'
      ? 'confirmed'
      : 'revised';

  return {
    descriptions: {
      level_1: stringOrFallback(descriptions.level_1, old.level_1),
      level_2: stringOrFallback(descriptions.level_2, old.level_2),
      level_3: stringOrFallback(descriptions.level_3, old.level_3),
    },
    review: {
      status,
      changes,
      needs_context: needsContext,
      context_questions: contextQuestions,
      reviewed_at: new Date().toISOString(),
      review_model: MODEL,
    },
  };
}

async function reviewDescriptions(projectDir, project, sharedStyle, reviewPrompt, model, fileManager, onProgress) {
  let reviewed = 0;
  let failed = 0;
  const failedSegmentIds = [];
  const contextQuestions = [];

  for (let i = 0; i < project.segments.length; i++) {
    const segment = project.segments[i];
    const segmentPath = path.join(projectDir, segment.file);
    let uploadedFile = null;
    const startTime = Date.now();

    try {
      const upload = await uploadFilePart(fileManager, segmentPath, 'video/mp4');
      uploadedFile = upload.uploadedFile;
      const prompt = buildSegmentReviewPrompt(sharedStyle, reviewPrompt, project, segment, i);

      const result = await model.generateContent([
        upload.part,
        { text: prompt },
      ]);
      const parsed = parseJsonResponse(result.response.text());
      const normalized = normalizeReviewResponse(parsed, segment);

      if (!segment.gemini_descriptions_original && hasAnyDescription(segment.descriptions)) {
        segment.gemini_descriptions_original = { ...segment.descriptions };
      }
      segment.descriptions = normalized.descriptions;
      segment.description_review = normalized.review;
      segment.ai_reviewed = true;
      segment.description_reviewed_at = normalized.review.reviewed_at;
      segment.description_review_model = MODEL;
      reviewed++;

      if (normalized.review.context_questions.length > 0) {
        contextQuestions.push({
          segment_id: segment.id,
          label: segment.label,
          questions: normalized.review.context_questions,
        });
      }

      await logWorkflow(projectDir, {
        task: 'description_review',
        segment_id: segment.id,
        status: 'success',
        latency_ms: Date.now() - startTime,
      });
    } catch (err) {
      failed++;
      failedSegmentIds.push(segment.id);
      segment.description_review = {
        status: 'failed',
        changes: [],
        needs_context: true,
        context_questions: [`Review failed for ${segment.label}; please check this segment manually.`],
        error: err.message,
        reviewed_at: new Date().toISOString(),
        review_model: MODEL,
      };
      contextQuestions.push({
        segment_id: segment.id,
        label: segment.label,
        questions: segment.description_review.context_questions,
      });

      await logWorkflow(projectDir, {
        task: 'description_review',
        segment_id: segment.id,
        status: 'error',
        error: err.message,
      });
    } finally {
      await deleteUploadedFile(fileManager, uploadedFile);
    }

    if (onProgress) onProgress('description_review', i + 1, project.segments.length);
  }

  return {
    reviewed,
    failed,
    failed_segment_ids: failedSegmentIds,
    context_questions: contextQuestions,
  };
}

function buildSuggestionPrompt(suggestionPrompt, project, creatorGoals = []) {
  const goals = Array.isArray(creatorGoals)
    ? creatorGoals.map((goal) => String(goal).trim()).filter(Boolean).slice(0, 3)
    : [];
  const segments = project.segments.map((segment, index) => ({
    id: segment.id,
    index,
    label: segment.label,
    start_seconds: segment.start_seconds,
    end_seconds: segment.end_seconds,
    descriptions: segment.descriptions || {},
  }));
  const context = {
    project_id: project.project_id,
    source_filename: project.source?.filename || null,
    duration_seconds: project.source?.duration_seconds || null,
    ai_title: project.ai_title || null,
    ai_summary: project.ai_summary || null,
    creator_goals: goals,
  };

  return `${suggestionPrompt.trim()}

PROJECT_CONTEXT:
${JSON.stringify(context, null, 2)}

SEGMENTS:
${JSON.stringify(segments, null, 2)}
`;
}

function toSceneCandidates(value) {
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item));
}

function chooseScene(value, segmentCount, usedScenes) {
  const candidates = toSceneCandidates(value)
    .filter((scene) => scene >= 0 && scene < segmentCount);
  if (candidates.length === 0) return null;
  if (segmentCount < 3) return candidates[0];
  return candidates.find((scene) => !usedScenes.has(scene)) ?? candidates[0];
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function formatSigned(value, suffix = '') {
  const num = Number(value);
  const sign = num > 0 ? '+' : '';
  return `${sign}${num}${suffix}`;
}

function defaultFixLabel(action, value) {
  switch (action) {
    case 'brightness':
      return `Brightness ${formatSigned(value)}`;
    case 'contrast':
      return `Contrast ${formatSigned(value)}`;
    case 'saturation':
      return `Saturation ${formatSigned(value)}`;
    case 'zoom':
      return value === 100 ? 'Reset zoom to 100%' : `Zoom to ${value}%`;
    case 'rotate':
      return `Rotate ${formatSigned(value, ' degrees')}`;
    case 'mute':
      return 'Mute original audio';
    case 'unmute':
      return 'Unmute original audio';
    default:
      return 'Apply fix';
  }
}

function normalizeFixTemplate(input) {
  if (!input || typeof input !== 'object') return null;
  const action = String(input.action || '').toLowerCase();
  if (!AI_FIX_ACTIONS.has(action)) return null;

  let value = input.value;
  if (action === 'brightness' || action === 'contrast' || action === 'saturation') {
    value = clampNumber(value, -100, 100, 0);
  } else if (action === 'zoom') {
    value = clampNumber(value, 100, 250, 120);
  } else if (action === 'rotate') {
    value = clampNumber(value, -180, 180, 0);
  } else if (action === 'mute') {
    value = true;
  } else if (action === 'unmute') {
    value = false;
  }

  return {
    action,
    value,
    label: stringOrFallback(input.label, defaultFixLabel(action, value)).slice(0, 60),
  };
}

function normalizeSuggestions(parsed, segmentCount) {
  const rawSuggestions = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
  const suggestions = [];
  const usedScenes = new Set();

  for (const item of rawSuggestions) {
    if (suggestions.length >= 3) break;
    const relatedScene = chooseScene(item?.relatedScene, segmentCount, usedScenes);
    if (relatedScene === null) continue;

    const category = CATEGORIES.has(item.category) ? item.category : 'creative';
    const text = stringOrFallback(item.text).replace(/\s+/g, ' ');
    if (!text) continue;

    const prototypeAction = String(
      item.prototype_action
      || item.capability
      || item.action
      || item.fix_template?.action
      || ''
    ).toLowerCase();
    const normalizedAction = SUPPORTED_ACTIONS.has(prototypeAction) ? prototypeAction : null;
    const fixTemplate = normalizeFixTemplate(item.fix_template);

    if (!normalizedAction && !fixTemplate) continue;

    usedScenes.add(relatedScene);
    const suggestion = {
      id: `sug_${String(suggestions.length + 1).padStart(3, '0')}`,
      category,
      text,
      relatedScene,
      prototype_action: fixTemplate?.action || normalizedAction,
    };
    if (fixTemplate) suggestion.fix_template = fixTemplate;
    suggestions.push(suggestion);
  }

  return suggestions;
}

async function generateThreeSuggestions(projectDir, project, suggestionPrompt, model, fileManager, creatorGoals) {
  const sourcePath = path.join(projectDir, 'original', 'source.mp4');
  let uploadedFile = null;
  const startTime = Date.now();

  try {
    const upload = await uploadFilePart(fileManager, sourcePath, 'video/mp4');
    uploadedFile = upload.uploadedFile;
    const prompt = buildSuggestionPrompt(suggestionPrompt, project, creatorGoals);
    const result = await model.generateContent([
      upload.part,
      { text: prompt },
    ]);
    const parsed = parseJsonResponse(result.response.text());
    let suggestions = normalizeSuggestions(parsed, project.segments.length);

    if (suggestions.length !== 3) {
      const retryResult = await model.generateContent([
        upload.part,
        {
          text: `${prompt}

IMPORTANT: Your previous response did not produce exactly three valid,
prototype-feasible suggestions after validation. Return exactly three
suggestions. Each item must have valid text, a valid zero-based
relatedScene, and a supported prototype_action. Include fix_template only
for brightness, contrast, saturation, zoom, rotate, mute, or unmute.`,
        },
      ]);
      suggestions = normalizeSuggestions(parseJsonResponse(retryResult.response.text()), project.segments.length);
    }

    project.suggestions = suggestions;
    project.suggestions_generated_at = new Date().toISOString();
    project.suggestions_model = MODEL;

    await logWorkflow(projectDir, {
      task: 'three_suggestions',
      status: 'success',
      suggestions: suggestions.length,
      latency_ms: Date.now() - startTime,
    });

    return {
      generated: suggestions.length,
      suggestions,
    };
  } catch (err) {
    await logWorkflow(projectDir, {
      task: 'three_suggestions',
      status: 'error',
      error: err.message,
    });
    throw err;
  } finally {
    await deleteUploadedFile(fileManager, uploadedFile);
  }
}

async function loadWorkflowPrompts() {
  const promptsDir = path.join(__dirname, '..', 'prompts');
  const [sharedStyle, descriptionPrompt, reviewPrompt, suggestionPrompt] = await Promise.all([
    fs.readFile(path.join(promptsDir, '_shared_style.txt'), 'utf-8'),
    fs.readFile(path.join(promptsDir, 'description_generation.txt'), 'utf-8'),
    fs.readFile(path.join(promptsDir, 'description_review.txt'), 'utf-8'),
    fs.readFile(path.join(promptsDir, 'three_suggestions_generation.txt'), 'utf-8'),
  ]);

  return {
    sharedStyle,
    descriptionTemplate: `${sharedStyle.trim()}\n\n${descriptionPrompt.trim()}\n`,
    reviewPrompt,
    suggestionPrompt,
  };
}

export async function runFootageWorkflow(workspace, projectId, options = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set. Add it to your .env file.');
  }

  const project = await readProject(workspace, projectId);
  if (!project.status.segmented) {
    throw new Error('Project must be segmented before running the footage workflow.');
  }

  const projectDir = path.join(workspace, projectId);
  const prompts = await loadWorkflowPrompts();
  const model = makeModel(apiKey);
  const fileManager = new GoogleAIFileManager(apiKey);

  const result = {
    project_id: projectId,
    model: MODEL,
    descriptions_generated: null,
    descriptions_reviewed: null,
    suggestions_generated: null,
    context_questions: [],
  };

  const shouldGenerateMissing = options.generateMissingDescriptions !== false;
  if (shouldGenerateMissing && descriptionsMissing(project.segments)) {
    const generationResult = await generateDescriptions(
      projectDir,
      project.segments,
      prompts.descriptionTemplate,
      options.onProgress
        ? (current, total) => options.onProgress('description_generation', current, total)
        : null
    );
    project.status.descriptions_generated = true;
    result.descriptions_generated = generationResult;
  }

  if (options.reviewDescriptions !== false) {
    const reviewResult = await reviewDescriptions(
      projectDir,
      project,
      prompts.sharedStyle,
      prompts.reviewPrompt,
      model,
      fileManager,
      options.onProgress
    );
    project.status.descriptions_reviewed = true;
    result.descriptions_reviewed = reviewResult;
    result.context_questions = reviewResult.context_questions;
  }

  if (project.segments.every((segment) => hasAnyDescription(segment.descriptions))) {
    project.status.descriptions_generated = true;
  }

  try {
    const videoMeta = await generateVideoMeta(project.segments);
    project.ai_title = videoMeta.title;
    project.ai_summary = videoMeta.summary;
  } catch (err) {
    await logWorkflow(projectDir, {
      task: 'video_meta',
      status: 'error',
      error: err.message,
    });
  }

  if (options.generateSuggestions !== false) {
    const suggestionResult = await generateThreeSuggestions(
      projectDir,
      project,
      prompts.suggestionPrompt,
      model,
      fileManager,
      options.creatorGoals || []
    );
    project.status.suggestions_generated = suggestionResult.generated === 3;
    result.suggestions_generated = suggestionResult;
  }

  if (
    project.status.reviewed
    && project.status.descriptions_generated
    && (project.status.descriptions_reviewed || options.reviewDescriptions === false)
    && (project.status.suggestions_generated || options.generateSuggestions === false)
  ) {
    project.status.ready_for_probe = true;
  }

  project.workflow = {
    last_run_at: new Date().toISOString(),
    model: MODEL,
    descriptions_reviewed: project.status.descriptions_reviewed || false,
    suggestions_generated: project.status.suggestions_generated || false,
    context_questions: result.context_questions,
  };

  await writeProject(workspace, projectId, project);

  return result;
}
