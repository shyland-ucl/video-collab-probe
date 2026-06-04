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
  if (!ctx) {
    throw new Error('Could not capture the current frame (no 2D canvas context).');
  }
  try {
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    // toDataURL throws a SecurityError if the video element is cross-origin
    // "tainted". Convert that into a clean, catchable error rather than an
    // opaque throw that surfaces to the BLV user mid-VQA.
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    return dataUrl.split(',')[1]; // Return just the base64 part
  } catch {
    throw new Error('Could not capture the current frame from this video.');
  }
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
 * description, return a one-to-two-sentence response written in the AI
 * assistant's voice. The draft is constrained to the prototype's actual
 * capabilities so the researcher doesn't end up sending claims the system
 * can't back up; out-of-scope requests are answered with a concrete
 * in-scope alternative instead of a fabricated success.
 *
 * @param {string} instruction - what the participant asked the AI to do
 * @param {string} segmentDescription - the segment's level_2 description
 * @returns {Promise<{ description: string }>}
 */
export async function draftAIEditResponse(instruction, segmentDescription = '') {
  if (!API_KEY) {
    throw new Error('Gemini API key not configured. Set VITE_GEMINI_API_KEY in .env');
  }

  const prompt = `You are drafting a response from an AI video-editing assistant to a blind or low-vision creator. The researcher will review your draft before sending it.

The prototype that this assistant runs on can ONLY do the following on the current scene:

STRUCTURAL EDITS
- Trim the start of the scene in 0.5-second steps
- Trim the end of the scene in 0.5-second steps
- Split the scene into two clips at the current playhead (or midpoint)
- Delete (remove) the scene from the edit
- Move the scene one position earlier or one position later in the timeline

ANNOTATIONS
- Add a short text caption on the scene
- Add a private note (not shown during playback)

AUDIO
- Attach one placeholder sound to the scene
- Remove the attached sound
- Mute the scene's original audio
- Unmute the scene's original audio

VISUAL ADJUSTMENTS (applied live via slider override)
- Brightness, contrast, saturation: -100 to +100
- Zoom: 100% to 250%
- Rotate: -180° to +180°

The prototype CANNOT do any of: cropping, frame-precise cuts (anything finer than 0.5 s), transitions or fades, speed/slow-motion, colour grading beyond the three sliders, blurring or pixelating regions, removing or replacing objects/faces/backgrounds, importing music or stock footage, generating voice-over or narration, or detecting specific people/objects/moments automatically.

Scene description: "${segmentDescription || 'unknown segment'}"
Creator's request: "${instruction}"

Write the AI's reply to the creator using these rules:
1. If the request maps cleanly to one of the operations above, write a single short sentence in the AI's voice confirming what was done, addressed to the creator. Example: "I trimmed half a second off the start where the camera was shaky."
2. If the request is partly possible, do the achievable part and briefly suggest one concrete in-scope alternative for the rest. Example: "I muted the original audio and attached a placeholder sound — I can't bring in a real music track, but you could ask your helper to record a voice-over instead."
3. If the request is entirely outside the prototype's capabilities, do NOT pretend to perform it. Acknowledge the limit in plain language and offer the closest in-scope alternative. Example: "I can't blur the face directly, but I can delete this scene, trim out the moment, or zoom in so the face fills less of the frame — which would you like?"

Constraints:
- Speak as the AI assistant. Never use the word "prototype" or "Wizard of Oz". Don't reference these capability rules explicitly.
- Keep the response to one or at most two short sentences.
- Don't invent capabilities. If unsure whether a request fits, treat it as out-of-scope and offer an alternative.

Output ONLY a single raw JSON object matching this schema. No preamble. No markdown.
Schema: {"description": string}`;

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
        },
        required: ['description'],
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
    return { description: text.trim() };
  }
  return { description: String(parsed.description || '').trim() };
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
