/**
 * Gemini VLM service for Visual Q&A.
 * Sends a video frame + question to Gemini and returns an AI-generated answer.
 */

// Shared style rules — same block the pre-session description prompt loads.
// Keeping them in one file means VQA's voice cannot drift from the descriptions
// the creator has just been listening to.
import SHARED_STYLE from '../../pipeline/prompts/_shared_style.txt?raw';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/**
 * Capture current frame from a video element as base64 JPEG.
 * @param {HTMLVideoElement} videoElement
 * @returns {string} base64-encoded JPEG (without data URI prefix)
 */
export function captureFrame(videoElement) {
  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth || 640;
  canvas.height = videoElement.videoHeight || 360;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  return dataUrl.split(',')[1]; // Return just the base64 part
}

/**
 * Send a question about a video frame to Gemini.
 * @param {string} base64Image - base64-encoded JPEG image
 * @param {string} question - user's question about the frame
 * @param {object} options - optional context
 * @param {string} options.segmentDescription - current segment description for context
 * @returns {Promise<string>} AI-generated answer
 */
export async function askGemini(base64Image, question, options = {}) {
  if (!API_KEY) {
    throw new Error('Gemini API key not configured. Set VITE_GEMINI_API_KEY in .env');
  }

  const systemPrompt = `${SHARED_STYLE.trim()}

================================================================
TASK: VISUAL Q&A
================================================================

You are answering a question from the creator about a single frame of
their video. Apply the style rules above. In addition:

- Lead with the answer to the question, then add detail.
- Keep answers to 2-3 sentences unless more detail is specifically
  requested.
- It is fine — and sometimes necessary — to describe absence
  (e.g. "There is no one else in the frame.") when that directly
  answers the question.${options.segmentDescription ? `\n\nContext: The current scene has been described as: "${options.segmentDescription}"` : ''}`;

  const requestBody = {
    contents: [{
      parts: [
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64Image,
          },
        },
        {
          text: `${systemPrompt}\n\nUser question: ${question}`,
        },
      ],
    }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 1024,
    },
  };

  const response = await fetch(`${API_URL}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const answer = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!answer) {
    throw new Error('No answer received from Gemini');
  }

  return answer.trim();
}

/**
 * Draft an AI edit response for the researcher's WoZ panel. Text-only call:
 * given the participant's edit instruction and the current segment's
 * description, return a one-sentence response that describes the edit the
 * AI would make + a structured action key from a fixed vocabulary.
 *
 * @param {string} instruction - what the participant asked the AI to do
 * @param {string} segmentDescription - the segment's level_2 description
 * @returns {Promise<{ description: string, action: string }>}
 */
export async function draftAIEditResponse(instruction, segmentDescription = '') {
  if (!API_KEY) {
    throw new Error('Gemini API key not configured. Set VITE_GEMINI_API_KEY in .env');
  }

  const ACTIONS = ['trim_start', 'split', 'delete', 'reorder', 'add_caption'];
  const prompt = `You are drafting a response from an AI video-editing assistant to a blind or low-vision creator.
The creator is working on a video segment described as: "${segmentDescription || 'unknown segment'}"
The creator asked the AI: "${instruction}"

Output ONLY a single raw JSON object matching this schema. No preamble. No explanation. No markdown code fences. Just the JSON.
Schema: {"description": string, "action": string}
- description: one short sentence describing the edit you would make, addressed to the creator (e.g. "I trimmed the first 2 seconds where the camera was shaky.")
- action: one of ${ACTIONS.map((a) => `"${a}"`).join(', ')}. If the request doesn't map cleanly, pick the closest.`;

  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.6,
      // 2.5-flash counts thinking tokens against maxOutputTokens. We disable
      // thinking (it's overkill for a one-sentence draft) and keep enough
      // headroom for the JSON payload.
      maxOutputTokens: 512,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          description: { type: 'STRING' },
          action: { type: 'STRING', enum: ACTIONS },
        },
        required: ['description', 'action'],
      },
    },
  };

  const response = await fetch(`${API_URL}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No draft received from Gemini');

  const parsed = parseLooseJson(text);
  if (!parsed) {
    // Most likely the response was truncated mid-JSON. Surface a clean
    // error so the researcher sees "draft failed" rather than raw JSON in
    // the textarea.
    if (text.trim().startsWith('{')) {
      throw new Error('Gemini returned incomplete JSON (likely truncated).');
    }
    return { description: text.trim(), action: 'trim_start' };
  }
  const action = ACTIONS.includes(parsed.action) ? parsed.action : 'trim_start';
  return { description: String(parsed.description || '').trim(), action };
}

/**
 * Best-effort JSON extractor for LLM output that may wrap the JSON in
 * markdown fences, prose preambles, or trailing notes. Returns the parsed
 * object or null if no valid JSON object is found.
 */
function parseLooseJson(text) {
  if (!text) return null;
  // Try direct parse first (the happy path when responseMimeType is honoured).
  try { return JSON.parse(text); } catch { /* fall through */ }
  // Strip ```json ... ``` or ``` ... ``` fences anywhere in the text.
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch { /* fall through */ }
  }
  // Last resort: greedy match on the first {...} block.
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]); } catch { /* give up */ }
  }
  return null;
}
