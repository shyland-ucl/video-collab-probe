import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';
import path from 'path';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// Accept either GEMINI_API_KEY or VITE_GEMINI_API_KEY
function getApiKey() {
  return process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
}

/**
 * Generate descriptions for all segments in a project.
 * @param {string} projectDir - absolute path to project directory
 * @param {object[]} segments - array of segment objects from project.json
 * @param {string} promptTemplate - the prompt text
 * @param {function} onProgress - callback(segIndex, total, status)
 * @returns {Promise<{generated: number, failed: number, failed_segment_ids: string[]}>}
 */
export async function generateDescriptions(projectDir, segments, promptTemplate, onProgress) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set. Add it to your .env file.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL });

  const logFile = path.join(projectDir, 'logs', 'gemini_calls.log');
  await fs.mkdir(path.join(projectDir, 'logs'), { recursive: true });

  let generated = 0;
  let failed = 0;
  const failedIds = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const kfPath = path.join(projectDir, seg.keyframe);
    const startTime = Date.now();

    try {
      const imageData = await fs.readFile(kfPath);
      const base64 = imageData.toString('base64');

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64,
          },
        },
        { text: promptTemplate },
      ]);

      const responseText = result.response.text();
      const latency = Date.now() - startTime;

      // Parse JSON from response — strip markdown fences if present
      let cleaned = responseText.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      }

      let descriptions;
      try {
        descriptions = JSON.parse(cleaned);
      } catch {
        // Retry once with explicit JSON reminder
        const retryResult = await model.generateContent([
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64,
            },
          },
          { text: promptTemplate + '\n\nIMPORTANT: Return only valid JSON. No markdown, no explanation.' },
        ]);
        const retryText = retryResult.response.text().trim();
        let retryCleaned = retryText;
        if (retryCleaned.startsWith('```')) {
          retryCleaned = retryCleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
        }
        descriptions = JSON.parse(retryCleaned);
      }

      seg.descriptions = {
        level_1: descriptions.level_1 || null,
        level_2: descriptions.level_2 || null,
        level_3: descriptions.level_3 || null,
      };
      seg.description_generated_at = new Date().toISOString();
      seg.description_model = MODEL;
      generated++;

      // Log success
      const usage = result.response.usageMetadata || {};
      await fs.appendFile(logFile, JSON.stringify({
        timestamp: new Date().toISOString(),
        segment_id: seg.id,
        status: 'success',
        model: MODEL,
        latency_ms: latency,
        tokens_in: usage.promptTokenCount || null,
        tokens_out: usage.candidatesTokenCount || null,
      }) + '\n');
    } catch (err) {
      failed++;
      failedIds.push(seg.id);
      seg.descriptions = { level_1: null, level_2: null, level_3: null };

      await fs.appendFile(logFile, JSON.stringify({
        timestamp: new Date().toISOString(),
        segment_id: seg.id,
        status: 'error',
        error: err.message,
      }) + '\n');
    }

    if (onProgress) onProgress(i + 1, segments.length, failedIds.length === 0 ? 'ok' : 'partial');
  }

  return { generated, failed, failed_segment_ids: failedIds };
}
