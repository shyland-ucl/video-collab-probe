import { forwardRef, useImperativeHandle, useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { useAccessibility } from '../../contexts/AccessibilityContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import usePlaybackEngine from '../../hooks/usePlaybackEngine.js';

const VideoPlayer = forwardRef(function VideoPlayer({ src, segments = [], onTimeUpdate, onSegmentChange, editState }, ref) {
  const singleVideoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentSegment, setCurrentSegment] = useState(null);
  const { logEvent, setVideoTime } = useEventLogger();
  const a11y = useAccessibility();

  const clips = editState?.clips || [];
  const captions = editState?.captions || [];
  const sources = editState?.sources || [];
  const isEngineActive = clips.length > 0;

  // Build videoRefs map: one ref per source
  // We keep a stable map of refs that grows as new sources are added
  const videoRefsMapRef = useRef({});

  const videoRefs = useMemo(() => {
    const map = videoRefsMapRef.current;
    // Ensure a ref exists for each source
    for (const source of sources) {
      if (!map[source.id]) {
        map[source.id] = { current: null };
      }
    }
    // Also ensure a 'default' ref for backward compat (single src prop)
    if (!map['default']) {
      map['default'] = { current: null };
    }
    // Return a new object reference so consumers see updates
    return { ...map };
  }, [sources]);

  // Link the singleVideoRef to the 'default' slot
  // (handled via ref callback on the default video element)

  // Determine if we have multi-source
  const hasMultiSource = sources.length > 0;

  const engine = usePlaybackEngine(
    hasMultiSource ? null : singleVideoRef,
    clips,
    captions,
    isEngineActive,
    hasMultiSource ? videoRefs : null
  );

  const findSegment = useCallback((time) => {
    return segments.find((seg) => time >= seg.start_time && time < seg.end_time) || null;
  }, [segments]);

  const handleTimeUpdate = useCallback(() => {
    // When engine is active, edlTime is the "real" time for UI
    let time;
    if (isEngineActive) {
      time = engine.edlTime;
    } else {
      const video = singleVideoRef.current;
      if (!video) return;
      time = video.currentTime;
    }
    setCurrentTime(time);
    setVideoTime(time);
    if (onTimeUpdate) onTimeUpdate(time);

    // Segment detection uses source time for proper segment matching
    const video = singleVideoRef.current;
    if (!video) return;
    const sourceTime = video.currentTime;
    const seg = findSegment(sourceTime);
    if (seg?.id !== currentSegment?.id) {
      setCurrentSegment(seg);
      if (seg) {
        logEvent(EventTypes.SEGMENT_ENTER, Actors.SYSTEM, { segmentId: seg.id, segmentName: seg.name });
      }
      if (onSegmentChange) onSegmentChange(seg);
    }
  }, [findSegment, currentSegment, logEvent, setVideoTime, onTimeUpdate, onSegmentChange, isEngineActive, engine.edlTime]);

  // For multi-source, use a polling interval to update time from engine
  useEffect(() => {
    if (!isEngineActive || !hasMultiSource) return;
    const interval = setInterval(() => {
      const time = engine.edlTime;
      setCurrentTime(time);
      setVideoTime(time);
      if (onTimeUpdate) onTimeUpdate(time);
    }, 50);
    return () => clearInterval(interval);
  }, [isEngineActive, hasMultiSource, engine.edlTime, setVideoTime, onTimeUpdate]);

  useImperativeHandle(ref, () => ({
    play() {
      if (isEngineActive) {
        engine.play();
      } else {
        singleVideoRef.current?.play();
      }
    },
    pause() {
      if (isEngineActive) {
        engine.pause();
      } else {
        singleVideoRef.current?.pause();
      }
    },
    seek(time) {
      if (isEngineActive) {
        engine.seekEdl(time);
        logEvent(EventTypes.SEEK, Actors.CREATOR, { time, edl: true });
      } else if (singleVideoRef.current) {
        singleVideoRef.current.currentTime = time;
        logEvent(EventTypes.SEEK, Actors.CREATOR, { time });
      }
    },
    getCurrentTime() {
      if (isEngineActive) {
        return engine.edlTime;
      }
      return singleVideoRef.current?.currentTime || 0;
    },
    get video() {
      // Return the active video element
      if (hasMultiSource) {
        if (engine.activeSourceId && videoRefs[engine.activeSourceId]?.current) {
          return videoRefs[engine.activeSourceId].current;
        }
        // Fallback: return the first source's video element
        if (sources.length > 0 && videoRefs[sources[0].id]?.current) {
          return videoRefs[sources[0].id].current;
        }
      }
      return singleVideoRef.current;
    },
    get edlDuration() {
      return isEngineActive ? engine.totalDuration : null;
    },
  }), [logEvent, isEngineActive, engine, hasMultiSource, videoRefs]);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    logEvent(EventTypes.PLAY, Actors.CREATOR, { time: singleVideoRef.current?.currentTime });
  }, [logEvent]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
    logEvent(EventTypes.PAUSE, Actors.CREATOR, { time: singleVideoRef.current?.currentTime });
  }, [logEvent]);

  const handleLoadedMetadata = useCallback(() => {
    if (singleVideoRef.current) {
      setDuration(singleVideoRef.current.duration);
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e) {
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      // For single-source, use singleVideoRef; for multi-source, check any video
      const video = singleVideoRef.current;
      const hasVideo = video || (hasMultiSource && sources.length > 0);
      if (!hasVideo) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (isEngineActive) {
            // Check if any video is playing
            const activeVideo = hasMultiSource && engine.activeSourceId
              ? videoRefs[engine.activeSourceId]?.current
              : video;
            if (activeVideo?.paused) {
              engine.play();
            } else {
              engine.pause();
            }
          } else {
            if (video?.paused) {
              video.play();
            } else {
              video?.pause();
            }
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (isEngineActive) {
            engine.seekEdl(Math.max(0, engine.edlTime - 5));
          } else if (video) {
            video.currentTime = Math.max(0, video.currentTime - 5);
          }
          logEvent(EventTypes.SEEK, Actors.CREATOR, { time: isEngineActive ? engine.edlTime : video?.currentTime, method: 'keyboard' });
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (isEngineActive) {
            engine.seekEdl(Math.min(engine.totalDuration, engine.edlTime + 5));
          } else if (video) {
            video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
          }
          logEvent(EventTypes.SEEK, Actors.CREATOR, { time: isEngineActive ? engine.edlTime : video?.currentTime, method: 'keyboard' });
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [logEvent, isEngineActive, engine, hasMultiSource, sources, videoRefs]);

  // Caption font size based on accessibility settings
  const captionFontSize = a11y.textSize === 'large' ? '1.25rem' : a11y.textSize === 'small' ? '0.75rem' : '1rem';

  return (
    <div className="relative w-full bg-black" style={{ aspectRatio: '16 / 9' }}>
      {/* Multi-source: render one <video> per source, show only the active one */}
      {hasMultiSource ? (
        sources.map((source, idx) => {
          // Show the active source, or the first source if engine hasn't set activeSourceId yet
          const isActive = engine.activeSourceId ? engine.activeSourceId === source.id : idx === 0;
          return (
            <video
              key={source.id}
              ref={(el) => {
                if (videoRefs[source.id]) {
                  videoRefs[source.id].current = el;
                }
              }}
              src={source.src}
              className="w-full h-full object-contain absolute inset-0"
              style={{ display: isActive ? 'block' : 'none' }}
              onTimeUpdate={isActive ? handleTimeUpdate : undefined}
              onPlay={isActive ? handlePlay : undefined}
              onPause={isActive ? handlePause : undefined}
              preload="metadata"
              playsInline
              aria-label={isActive ? 'Video player' : `Video source: ${source.name}`}
              aria-hidden={!isActive}
            />
          );
        })
      ) : (
        /* Single source (backwards compatible) */
        <video
          ref={singleVideoRef}
          src={src}
          className="w-full h-full object-contain"
          onTimeUpdate={handleTimeUpdate}
          onPlay={handlePlay}
          onPause={handlePause}
          onLoadedMetadata={handleLoadedMetadata}
          preload="metadata"
          playsInline
          aria-label="Video player"
        />
      )}

      {/* Caption overlay */}
      {isEngineActive && engine.activeCaption && (
        <div
          className="absolute bottom-0 left-0 right-0 flex justify-center pointer-events-none"
          style={{ padding: '0 8px 16px' }}
        >
          <div
            className="px-4 py-2 rounded text-white text-center max-w-[90%]"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              fontSize: captionFontSize,
              textShadow: '0 1px 3px rgba(0,0,0,0.8)',
              lineHeight: 1.4,
            }}
            role="status"
            aria-live="polite"
            aria-label={`Caption: ${engine.activeCaption.text}`}
          >
            {engine.activeCaption.text}
          </div>
        </div>
      )}

      {/* No clips message */}
      {editState && clips.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <p className="text-white/80 text-lg font-medium">No clips in timeline</p>
        </div>
      )}

      {!src && !editState && !hasMultiSource && (
        <div className="absolute inset-0 flex items-center justify-center text-white/60 text-lg">
          No video source loaded
        </div>
      )}
    </div>
  );
});

export default VideoPlayer;
