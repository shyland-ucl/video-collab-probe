import { useState, useRef, useCallback } from 'react';
import { announce } from '../../utils/announcer.js';
import { uploadAndProcess } from '../../services/pipelineApi.js';

let uploadCounter = 0;

/**
 * VideoUpload — lets participants upload video files from their phone.
 * Uses the pipeline backend for FFmpeg segmentation + Gemini descriptions.
 *
 * Props:
 *   onUpload(videos)  — called with array of processed video objects
 *   disabled          — disables the upload button
 */
export default function VideoUpload({ onUpload, disabled = false }) {
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const fileInputRef = useRef(null);

  const handleFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return;

    setStatus('processing');
    setProgress(0);
    setStatusText('Reading video files...');
    announce(`Processing ${files.length} video${files.length > 1 ? 's' : ''}. This may take a moment.`);

    const processed = [];
    for (let fi = 0; fi < files.length; fi++) {
      const file = files[fi];
      if (!file.type.startsWith('video/')) {
        announce(`Skipped ${file.name} — not a video file.`);
        continue;
      }

      const title = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');

      try {
        setStatusText(`Uploading and segmenting "${title}"...`);
        announce(`Processing video: ${title}. Segmenting and generating AI descriptions.`);

        const video = await uploadAndProcess(file, 3, (stage, pct) => {
          setProgress(pct);
          if (stage === 'uploading') setStatusText(`Uploading and segmenting "${title}"...`);
          else if (stage === 'generating') setStatusText(`Generating AI descriptions for "${title}"...`);
          else if (stage === 'finalizing') setStatusText(`Finishing up "${title}"...`);
        });

        announce(`Finished processing ${title}. Found ${video.segments.length} scene${video.segments.length !== 1 ? 's' : ''}.`);
        processed.push(video);
      } catch (err) {
        console.error('Pipeline processing failed:', file.name, err);
        announce(`Could not process ${file.name}: ${err.message}`);

        // Fallback: create a basic video entry with object URL
        try {
          const objectUrl = URL.createObjectURL(file);
          const duration = await getVideoDuration(file);
          processed.push({
            id: `upload-${Date.now()}-${++uploadCounter}`,
            title,
            src: objectUrl,
            duration,
            _uploaded: true,
            _fileName: file.name,
            _fileSize: file.size,
            segments: [{
              id: `fallback-seg-1`,
              start_time: 0,
              end_time: duration,
              name: title,
              color: '#6366F1',
              descriptions: {
                level_1: 'Pipeline processing failed. Use Ask AI to describe this scene.',
                level_2: 'Pipeline processing failed. The video was uploaded but could not be segmented or described automatically. You can still use the Ask button to get live descriptions.',
                level_3: 'Pipeline processing failed. The video was uploaded but the segmentation or description generation service encountered an error. You can use the Ask button for live frame descriptions.',
              },
            }],
          });
        } catch {
          // Skip entirely
        }
      }
    }

    if (processed.length > 0) {
      const totalSegments = processed.reduce((sum, v) => sum + v.segments.length, 0);
      announce(`${processed.length} video${processed.length > 1 ? 's' : ''} ready with ${totalSegments} scenes described.`);
      onUpload(processed);
    }

    setStatus('idle');
    setProgress(0);
    setStatusText('');
  }, [onUpload]);

  const handleInputChange = useCallback((e) => {
    handleFiles(Array.from(e.target.files));
    e.target.value = '';
  }, [handleFiles]);

  const isWorking = status === 'processing' || status === 'analyzing';

  return (
    <div className="flex flex-col gap-2">
      {/* Hidden from AT — the visible button is the AT-facing entry point.
          The previous `aria-label="Upload video files"` left a duplicate
          "Upload video files" stop in TalkBack right next to the button. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        multiple
        capture={false}
        onChange={handleInputChange}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        id="video-upload-input"
      />

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || isWorking}
        className="w-full py-4 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 text-gray-700 font-semibold text-base transition-colors hover:border-blue-400 hover:bg-blue-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ minHeight: '48px' }}
        aria-label={isWorking ? statusText : 'Upload videos from your phone'}
      >
        {isWorking ? (
          <div className="flex flex-col items-center gap-2 px-4">
            <span className="flex items-center gap-2 text-sm">
              <svg className="animate-spin h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
              </svg>
              {statusText}
            </span>
            <div className="w-full bg-gray-200 rounded-full h-2" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-gray-500" aria-live="polite">{progress}% complete</span>
          </div>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Upload Your Videos
          </span>
        )}
      </button>
    </div>
  );
}

function getVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const duration = video.duration;
      URL.revokeObjectURL(video.src);
      resolve(isFinite(duration) ? duration : 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Could not read video file'));
    };
    video.src = URL.createObjectURL(file);
  });
}
