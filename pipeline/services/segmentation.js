import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import ffmpegPath from 'ffmpeg-static';
import { path as ffprobePath } from 'ffprobe-static';

const execAsync = promisify(exec);

// Use bundled ffmpeg/ffprobe binaries
const FFMPEG = `"${ffmpegPath}"`;
const FFPROBE = `"${ffprobePath}"`;

/**
 * Get video metadata via FFprobe.
 * @param {string} filePath - path to video file
 * @returns {Promise<{duration: number, width: number, height: number, fps: number, size: number}>}
 */
export async function getVideoMeta(filePath) {
  const { stdout } = await execAsync(
    `${FFPROBE} -v quiet -print_format json -show_format -show_streams "${filePath}"`
  );
  const info = JSON.parse(stdout);
  const videoStream = info.streams.find(s => s.codec_type === 'video') || {};
  const fpsRatio = videoStream.r_frame_rate || '30/1';
  const [num, den] = fpsRatio.split('/').map(Number);
  const stat = await fs.stat(filePath);

  return {
    duration: parseFloat(info.format.duration),
    width: videoStream.width || 0,
    height: videoStream.height || 0,
    fps: Math.round(num / (den || 1)),
    size: stat.size,
  };
}

/**
 * Segment a video into fixed-length clips + keyframes.
 * @param {string} projectDir - absolute path to the project directory
 * @param {string} sourceFile - path to source video
 * @param {number} segmentLength - segment duration in seconds
 * @param {number} totalDuration - video total duration in seconds
 * @param {function} onProgress - callback(segIndex, totalSegs)
 * @returns {Promise<object[]>} array of segment metadata objects
 */
export async function segmentVideo(projectDir, sourceFile, segmentLength, totalDuration, onProgress) {
  const segmentsDir = path.join(projectDir, 'segments');
  const keyframesDir = path.join(projectDir, 'keyframes');
  const logFile = path.join(projectDir, 'logs', 'segmentation.log');

  await fs.mkdir(segmentsDir, { recursive: true });
  await fs.mkdir(keyframesDir, { recursive: true });
  await fs.mkdir(path.join(projectDir, 'logs'), { recursive: true });

  const numSegments = Math.ceil(totalDuration / segmentLength);
  const segments = [];

  const logLine = (msg) => {
    const ts = new Date().toISOString();
    return fs.appendFile(logFile, `[${ts}] ${msg}\n`);
  };

  await logLine(`START segmentation: ${path.basename(sourceFile)} (${totalDuration}s, ${segmentLength}s segments)`);

  for (let i = 0; i < numSegments; i++) {
    const start = i * segmentLength;
    const end = Math.min((i + 1) * segmentLength, totalDuration);
    const duration = end - start;
    const index = i + 1;
    const padded = String(index).padStart(3, '0');
    const segId = `seg_${padded}`;
    const segFile = path.join(segmentsDir, `${segId}.mp4`);
    const kfFile = path.join(keyframesDir, `${segId}_kf.jpg`);

    // Extract segment — try stream copy first, fall back to re-encode
    try {
      await execAsync(
        `${FFMPEG} -y -ss ${start} -to ${end} -i "${sourceFile}" -c copy -avoid_negative_ts make_zero "${segFile}"`
      );
    } catch {
      await execAsync(
        `${FFMPEG} -y -ss ${start} -to ${end} -i "${sourceFile}" -c:v libx264 -c:a aac -preset fast "${segFile}"`
      );
    }

    // Extract keyframe at midpoint
    const midpoint = start + duration / 2;
    try {
      await execAsync(
        `${FFMPEG} -y -ss ${midpoint} -i "${sourceFile}" -frames:v 1 -q:v 2 "${kfFile}"`
      );
    } catch (err) {
      await logLine(`Segment ${segId}: keyframe extraction failed — ${err.message}`);
    }

    const seg = {
      id: segId,
      index,
      start_seconds: start,
      end_seconds: end,
      duration_seconds: parseFloat(duration.toFixed(3)),
      label: `Scene ${index}`,
      file: `segments/${segId}.mp4`,
      keyframe: `keyframes/${segId}_kf.jpg`,
      descriptions: { level_1: null, level_2: null, level_3: null },
      description_generated_at: null,
      description_model: null,
      manually_edited: false,
    };

    segments.push(seg);
    await logLine(`Segment ${segId}: ${start}s - ${end}s -> segments/${segId}.mp4 (OK)`);

    if (onProgress) onProgress(index, numSegments);
  }

  await logLine(`END segmentation: ${numSegments} segments created`);
  return segments;
}

/**
 * Re-segment specific segments that had their boundaries changed.
 * @param {string} projectDir
 * @param {string} sourceFile
 * @param {object[]} changedSegments - segments with updated start/end
 */
export async function resegment(projectDir, sourceFile, changedSegments) {
  const logFile = path.join(projectDir, 'logs', 'segmentation.log');
  const logLine = (msg) => {
    const ts = new Date().toISOString();
    return fs.appendFile(logFile, `[${ts}] ${msg}\n`);
  };

  await logLine(`RE-SEGMENT: ${changedSegments.length} segments to re-extract`);

  for (const seg of changedSegments) {
    const segFile = path.join(projectDir, seg.file);
    const kfFile = path.join(projectDir, seg.keyframe);
    const { start_seconds: start, end_seconds: end } = seg;
    const midpoint = start + (end - start) / 2;

    try {
      await execAsync(
        `${FFMPEG} -y -ss ${start} -to ${end} -i "${sourceFile}" -c copy -avoid_negative_ts make_zero "${segFile}"`
      );
    } catch {
      await execAsync(
        `${FFMPEG} -y -ss ${start} -to ${end} -i "${sourceFile}" -c:v libx264 -c:a aac -preset fast "${segFile}"`
      );
    }

    try {
      await execAsync(
        `${FFMPEG} -y -ss ${midpoint} -i "${sourceFile}" -frames:v 1 -q:v 2 "${kfFile}"`
      );
    } catch (err) {
      await logLine(`Re-segment ${seg.id}: keyframe failed — ${err.message}`);
    }

    await logLine(`Re-segment ${seg.id}: ${start}s - ${end}s -> ${seg.file} (OK)`);
  }
}
