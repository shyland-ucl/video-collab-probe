/**
 * Gemini VLM service for Visual Q&A.
 * Sends a video frame + question to Gemini and returns an AI-generated answer.
 */

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

  const systemPrompt = `You are an AI assistant helping a blind or low-vision video creator understand their video content.
You are looking at a frame from their video. Answer their question clearly and concisely.
Focus on visual details that would be relevant to someone who cannot see the video.
Be specific about colors, positions, expressions, text, and objects visible in the frame.
Keep answers to 2-3 sentences unless more detail is specifically requested.
${options.segmentDescription ? `\nContext: The current scene has been described as: "${options.segmentDescription}"` : ''}`;

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
