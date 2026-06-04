import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import ffmpegPath from 'ffmpeg-static';
import { path as ffprobePath } from 'ffprobe-static';
import { safeJoinWithin } from './validate.js';

// execFile (argv array, no shell) instead of exec (shell string). This makes
// command injection structurally impossible: arguments are never parsed by a
// shell, so values like `0 -i x; rm -rf /` are passed verbatim to ffmpeg as a
// single argument rather than executed.
const execFileAsync = promisify(execFile);

// Bundled ffmpeg/ffprobe binaries (absolute paths from the static packages).
const FFMPEG = ffmpegPath;
const FFPROBE = ffprobePath;

// ffmpeg/ffprobe can emit large progress output on stderr for long inputs.
const EXEC_OPTS = { maxBuffer: 64 * 1024 * 1024 };

/**
 * Get video metadata via FFprobe.
 * @param {string} filePath - path to video file
 * @returns {Promise<{duration: number, width: number, height: number, fps: number, size: number}>}
 */
export async function getVideoMeta(filePath) {
  const { stdout } = await execFileAsync(
    FFPROBE,
    ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
    EXEC_OPTS
  );
  const info = JSON.parse(stdout);
  const videoStream = info.streams.find(s => s.codec_type === 'video') || {};
  const fpsRatio = videoStream.r_frame_rate || '30/1';
  const [num, den] = fpsRatio.split('/').map(Number);
  const stat = await fs.stat(filePath);

  // Some containers omit format.duration; fall back to the video stream's
  // duration. If neither is a positive number, fail loudly — otherwise the
  // caller computes Math.ceil(NaN / segLen) and silently produces zero segments.
  const formatDuration = parseFloat(info.format?.duration);
  const streamDuration = parseFloat(videoStream.duration);
  const duration = Number.isFinite(formatDuration) && formatDuration > 0
    ? formatDuration
    : (Number.isFinite(streamDuration) && streamDuration > 0 ? streamDuration : NaN);
  if (!Number.isFinite(duration)) {
    throw new Error('Could not determine video duration from ffprobe output.');
  }

  // Try to extract creation date from metadata
  const tags = info.format.tags || {};
  const creationTime = tags.creation_time || tags.date || null;

  return {
    duration,
    width: videoStream.width || 0,
    height: videoStream.height || 0,
    fps: Math.round(num / (den || 1)),
    size: stat.size,
    creation_time: creationTime,
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

    // Extract segment — re-encode for frame-accurate cuts. Stream copy (-c copy)
    // can only cut at keyframes, which on phone videos are irregularly spaced
    // (e.g. every 5–10s) and rarely line up with requested boundaries, producing
    // wildly variable, overlapping clips.
    await execFileAsync(
      FFMPEG,
      ['-y', '-ss', String(start), '-to', String(end), '-i', sourceFile,
        '-c:v', 'libx264', '-c:a', 'aac', '-preset', 'fast', segFile],
      EXEC_OPTS
    );

    // Extract keyframe at midpoint
    const midpoint = start + duration / 2;
    try {
      await execFileAsync(
        FFMPEG,
        ['-y', '-ss', String(midpoint), '-i', sourceFile, '-frames:v', '1', '-q:v', '2', kfFile],
        EXEC_OPTS
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
    // Boundaries come from the request body — coerce to finite numbers and
    // reject anything malformed before it reaches ffmpeg.
    const start = Number(seg.start_seconds);
    const end = Number(seg.end_seconds);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < 0) {
      await logLine(`Re-segment ${seg.id}: skipped — invalid boundaries (${seg.start_seconds}..${seg.end_seconds})`);
      continue;
    }

    // seg.file / seg.keyframe are client-supplied — confine them to projectDir
    // so a "../" can't redirect ffmpeg's output outside the workspace.
    let segFile, kfFile;
    try {
      segFile = safeJoinWithin(projectDir, seg.file);
      kfFile = safeJoinWithin(projectDir, seg.keyframe);
    } catch {
      await logLine(`Re-segment ${seg.id}: skipped — output path escapes project dir`);
      continue;
    }

    const midpoint = start + (end - start) / 2;

    await execFileAsync(
      FFMPEG,
      ['-y', '-ss', String(start), '-to', String(end), '-i', sourceFile,
        '-c:v', 'libx264', '-c:a', 'aac', '-preset', 'fast', segFile],
      EXEC_OPTS
    );

    try {
      await execFileAsync(
        FFMPEG,
        ['-y', '-ss', String(midpoint), '-i', sourceFile, '-frames:v', '1', '-q:v', '2', kfFile],
        EXEC_OPTS
      );
    } catch (err) {
      await logLine(`Re-segment ${seg.id}: keyframe failed — ${err.message}`);
    }

    await logLine(`Re-segment ${seg.id}: ${start}s - ${end}s -> ${seg.file} (OK)`);
  }
}
