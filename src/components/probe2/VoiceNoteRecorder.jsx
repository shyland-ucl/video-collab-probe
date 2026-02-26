import { useState, useRef, useCallback, useEffect } from 'react';
import { announce } from '../../utils/announcer.js';

export default function VoiceNoteRecorder({ onRecordingComplete, disabled = false }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const startTimeRef = useRef(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
    announce('Recording stopped');
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    chunksRef.current = [];
    setRecordingDuration(0);

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setError('Microphone access denied. Please allow microphone access to record voice notes.');
      return;
    }

    streamRef.current = stream;

    let mimeType = 'audio/webm';
    if (typeof MediaRecorder.isTypeSupported === 'function' && !MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = '';
    }

    const options = mimeType ? { mimeType } : undefined;
    const recorder = new MediaRecorder(stream, options);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const duration = startTimeRef.current
        ? Math.round((Date.now() - startTimeRef.current) / 1000)
        : recordingDuration;
      const blob = new Blob(chunksRef.current, {
        type: mimeType || 'audio/webm',
      });
      if (onRecordingComplete) {
        onRecordingComplete(blob, duration);
      }
    };

    recorder.start();
    startTimeRef.current = Date.now();
    setIsRecording(true);
    announce('Recording started');

    timerRef.current = setInterval(() => {
      setRecordingDuration((prev) => prev + 1);
    }, 1000);
  }, [onRecordingComplete, recordingDuration]);

  const handleToggle = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleToggle}
          disabled={disabled}
          aria-label={isRecording ? 'Stop recording voice note' : 'Record voice note'}
          style={{ minHeight: '44px', minWidth: '44px' }}
          className={`
            inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
            focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors
            ${disabled
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : isRecording
                ? 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500'
                : 'bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500'
            }
          `}
        >
          {isRecording && (
            <span
              className="inline-block w-2.5 h-2.5 rounded-full bg-white animate-pulse"
              aria-hidden="true"
            />
          )}
          {isRecording ? 'Stop Recording' : 'Record Voice Note'}
        </button>

        {isRecording && (
          <span className="text-sm font-mono text-red-600 font-semibold">
            {formatDuration(recordingDuration)}
          </span>
        )}
      </div>

      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {isRecording
          ? `Recording in progress. Duration: ${formatDuration(recordingDuration)}`
          : ''}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 font-medium">
          {error}
        </p>
      )}
    </div>
  );
}
