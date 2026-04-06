/**
 * Video Analysis Service — uses Gemini to generate scene descriptions
 * at 3 granularity levels for uploaded videos.
 */

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const SEGMENT_COLORS = [
  '#E74C3C', '#F0AD4E', '#2ECC71', '#3498DB', '#9B59B6',
  '#E67E22', '#1ABC9C', '#E91E63', '#00BCD4', '#8BC34A',
];

/**
 * Capture a frame from a video element at a specific time as base64 JPEG.
 * @param {string} videoSrc — blob URL or path
 * @param {number} timeSeconds — time to seek to
 * @returns {Promise<string>} base64-encoded JPEG (no data URI prefix)
 */
function captureFrameAtTime(videoSrc, timeSeconds) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true;

    video.onloadedmetadata = () => {
      const clampedTime = Math.min(timeSeconds, video.duration - 0.1);
      video.currentTime = Math.max(0, clampedTime);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(video.videoWidth, 1280);
        canvas.height = Math.round(canvas.width * (video.videoHeight / video.videoWidth));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(dataUrl.split(',')[1]);
      } catch (err) {
        reject(err);
      }
    };

    video.onerror = () => reject(new Error('Failed to load video for frame capture'));
    video.src = videoSrc;
  });
}

/**
 * Send frames to Gemini and ask for scene segmentation + 3-level descriptions.
 * @param {string[]} base64Frames — array of base64 JPEG frames
 * @param {number} videoDuration — total video duration in seconds
 * @param {number} frameInterval — seconds between sampled frames
 * @param {string} videoTitle — title of the video
 * @returns {Promise<object[]>} array of segment objects
 */
async function analyzeFramesWithGemini(base64Frames, videoDuration, frameInterval, videoTitle) {
  if (!API_KEY) {
    throw new Error('Gemini API key not configured. Set VITE_GEMINI_API_KEY in .env');
  }

  const parts = [];

  // Add all frames as inline images
  base64Frames.forEach((frame, i) => {
    const timestamp = (i * frameInterval).toFixed(1);
    parts.push({
      text: `[Frame at ${timestamp}s]`,
    });
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: frame,
      },
    });
  });

  // Add the analysis prompt
  parts.push({
    text: `You are analyzing frames from a video titled "${videoTitle}" (total duration: ${videoDuration.toFixed(1)}s). The frames above are sampled every ${frameInterval} seconds.

Your task:
1. Identify distinct scenes/segments based on visual changes between frames (location changes, activity changes, camera angle changes).
2. For each segment, provide a short name and descriptions at 3 detail levels.

The descriptions are for a blind or low-vision video creator who filmed this footage. Write from second-person perspective ("You are...").

Detail levels:
- level_1: One concise sentence. What is happening in the broadest sense.
- level_2: Two to three sentences. Add spatial layout, key objects, and actions.
- level_3: Four to six sentences. Add colors, lighting, textures, expressions, text visible, and precise positions of objects.

Respond in EXACTLY this JSON format (no markdown, no code fences, just the JSON array):
[
  {
    "start_time": 0,
    "end_time": 3,
    "name": "Short Scene Name",
    "descriptions": {
      "level_1": "...",
      "level_2": "...",
      "level_3": "..."
    }
  }
]

Rules:
- Segments must cover the full duration from 0 to ${videoDuration.toFixed(1)} with no gaps or overlaps.
- Aim for segments of roughly 2-5 seconds each, but adapt to actual scene changes.
- Use whole or half-second boundaries for start_time and end_time.
- Return valid JSON only — no explanation text before or after.`,
  });

  const requestBody = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096,
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
  if (!text) {
    throw new Error('No response from Gemini');
  }

  // Parse the JSON response — strip markdown fences if present
  const cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (parseErr) {
    console.error('Failed to parse Gemini response:', text);
    throw new Error('Could not parse scene analysis from Gemini');
  }
}

/**
 * Analyze an uploaded video: sample frames, send to Gemini, return segments
 * with 3-level descriptions.
 *
 * @param {string} videoSrc — blob URL of the uploaded video
 * @param {number} duration — video duration in seconds
 * @param {string} videoId — unique ID for the video
 * @param {string} videoTitle — display title
 * @param {function} onProgress — optional callback(stage, percent) for UI updates
 * @returns {Promise<object[]>} segments array compatible with the app's data structure
 */
export async function analyzeVideo(videoSrc, duration, videoId, videoTitle, onProgress) {
  // Determine frame sampling interval (aim for ~1 frame per 1.5s, max 20 frames)
  const maxFrames = 20;
  const frameInterval = Math.max(1.5, duration / maxFrames);
  const frameCount = Math.min(maxFrames, Math.ceil(duration / frameInterval));

  onProgress?.('capturing', 0);

  // Capture frames
  const frames = [];
  for (let i = 0; i < frameCount; i++) {
    const time = i * frameInterval + frameInterval / 2; // mid-point of each interval
    try {
      const frame = await captureFrameAtTime(videoSrc, time);
      frames.push(frame);
    } catch (err) {
      console.warn(`Failed to capture frame at ${time}s:`, err);
    }
    onProgress?.('capturing', Math.round(((i + 1) / frameCount) * 50));
  }

  if (frames.length === 0) {
    throw new Error('Could not capture any frames from the video');
  }

  onProgress?.('analyzing', 50);

  // Send to Gemini for analysis
  const rawSegments = await analyzeFramesWithGemini(frames, duration, frameInterval, videoTitle);

  onProgress?.('finalizing', 90);

  // Convert to app's segment format with IDs and colors
  const segments = rawSegments.map((seg, i) => ({
    id: `${videoId}-seg-${i + 1}`,
    start_time: seg.start_time,
    end_time: Math.min(seg.end_time, duration),
    name: seg.name,
    color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
    descriptions: {
      level_1: seg.descriptions?.level_1 || 'Description not available.',
      level_2: seg.descriptions?.level_2 || 'Description not available.',
      level_3: seg.descriptions?.level_3 || 'Description not available.',
    },
  }));

  // Ensure the last segment extends to the full duration
  if (segments.length > 0) {
    segments[segments.length - 1].end_time = duration;
  }

  onProgress?.('done', 100);
  return segments;
}
