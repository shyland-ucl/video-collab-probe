import { useState, useEffect, useCallback, useRef } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { announce } from '../../utils/announcer.js';

// Color palette for sources
const SOURCE_COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#84CC16',
];

/**
 * Mock iMovie/CapCut-style video editor for the research probe.
 * Supports multiple video sources — clips from different files on one timeline.
 */
export default function MockEditorVisual({ segments = [], currentTime = 0, onSeek, onEditChange, initialSources = [], editState, onTextTool, textToolActive, clipPerSource = false }) {
  const { logEvent } = useEventLogger();

  // Initialize from editState prop if available, otherwise empty arrays.
  // Without this, the editState-sync useEffect early-returns on first render
  // because `editState === prevEditStateRef.current` (both equal the prop),
  // leaving the timeline blank even though clips were passed in. (B2 fix.)
  const [clips, setClips] = useState(() => (editState?.clips ? [...editState.clips] : []));
  const [captions, setCaptions] = useState(() => (editState?.captions ? [...editState.captions] : []));
  const [sources, setSources] = useState(() => (editState?.sources ? [...editState.sources] : []));
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [selectedClipIndex, setSelectedClipIndex] = useState(null);
  const [showCaptionEditor, setShowCaptionEditor] = useState(false);
  const [captionText, setCaptionText] = useState('');
  const [captionStart, setCaptionStart] = useState(0);
  const [captionEnd, setCaptionEnd] = useState(5);
  const [importing, setImporting] = useState(false);

  const timelineRef = useRef(null);
  const toolbarRef = useRef(null);
  const dragRef = useRef(null);
  const fileInputRef = useRef(null);
  const onEditChangeRef = useRef(onEditChange);
  const sourcesRef = useRef(sources);
  const clipsRef = useRef(clips);
  const captionsRef = useRef(captions);
  useEffect(() => { onEditChangeRef.current = onEditChange; }, [onEditChange]);
  useEffect(() => { sourcesRef.current = sources; }, [sources]);
  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => { captionsRef.current = captions; }, [captions]);

  // Guard: when true, suppress the next onEditChange broadcast (it came from props, not user)
  const syncFromPropsRef = useRef(false);
  // Guard: skip the initial mount run of the broadcast effect. Otherwise we
  // emit `onEditChange([], [], [])` before the editState prop sync runs,
  // which can clobber upstream state (B1 fix: was blanking the participant's
  // timeline whenever the researcher dashboard mounted the mirror editor).
  const didMountRef = useRef(false);

  // Notify parent whenever clips, captions, or sources change
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (syncFromPropsRef.current) {
      syncFromPropsRef.current = false;
      return;
    }
    if (onEditChangeRef.current) {
      onEditChangeRef.current(clips, captions, sourcesRef.current);
    }
  }, [clips, captions, sources]);

  // Sync internal state when editState prop changes from outside (peer edits via WebSocket).
  // Only set syncFromPropsRef when state will actually change. Otherwise, when
  // the parent passes back a wrapped object containing the SAME inner array
  // references we just emitted (the round-trip case after onEditChange →
  // parent setState → re-render), setClips() bails out, the broadcast effect
  // doesn't run to reset the flag, and the next legitimate edit is suppressed.
  const prevEditStateRef = useRef(editState);
  useEffect(() => {
    if (!editState) return;
    if (editState === prevEditStateRef.current) return;
    prevEditStateRef.current = editState;

    const clipsChanged = editState.clips !== undefined && editState.clips !== clipsRef.current;
    const captionsChanged = editState.captions !== undefined && editState.captions !== captionsRef.current;
    const sourcesChanged = editState.sources !== undefined && editState.sources !== sourcesRef.current;
    if (!clipsChanged && !captionsChanged && !sourcesChanged) return;

    syncFromPropsRef.current = true;
    if (clipsChanged) setClips(editState.clips);
    if (captionsChanged) setCaptions(editState.captions);
    if (sourcesChanged) setSources(editState.sources);
  }, [editState]);

  // Initialize clips + sources when initialSources arrives (async data load)
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    if (initialSources.length === 0 && segments.length === 0) return;

    // Multi-source init: initialSources carry segments per video
    if (initialSources.length > 0) {
      // Strip segments from sources for the sources state (VideoPlayer only needs id/name/src/duration)
      const sourcesWithoutSegments = initialSources.map((src) => ({
        id: src.id,
        name: src.name,
        src: src.src,
        duration: src.duration,
      }));
      setSources(sourcesWithoutSegments);

      const allClips = [];
      initialSources.forEach((src, srcIdx) => {
        const color = SOURCE_COLORS[srcIdx % SOURCE_COLORS.length];
        if (!clipPerSource && src.segments && src.segments.length > 0) {
          src.segments.forEach((seg) => {
            allClips.push({
              id: seg.id,
              sourceId: src.id,
              name: seg.name,
              startTime: seg.start_time,
              endTime: seg.end_time,
              color: seg.color || color,
              trimStart: 0,
              trimEnd: 0,
            });
          });
        } else {
          allClips.push({
            id: `clip-${src.id}`,
            sourceId: src.id,
            name: src.name || src.title || 'Untitled',
            startTime: 0,
            endTime: src.duration || 0,
            color,
            trimStart: 0,
            trimEnd: 0,
          });
        }
      });
      if (allClips.length > 0) {
        setClips(allClips);
        didInit.current = true;
        return;
      }
    }

    // Legacy fallback: single source from segments prop
    if (segments.length > 0) {
      setClips(
        segments.map((seg) => ({
          id: seg.id,
          sourceId: 'default',
          name: seg.name,
          startTime: seg.start_time,
          endTime: seg.end_time,
          color: seg.color || SOURCE_COLORS[0],
          trimStart: 0,
          trimEnd: 0,
        }))
      );
      didInit.current = true;
    }
  }, [segments, initialSources]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save current state snapshot for undo
  const saveSnapshot = useCallback(() => {
    setUndoStack((prev) => [
      ...prev,
      {
        clips: clips.map((c) => ({ ...c })),
        captions: captions.map((c) => ({ ...c })),
        sources: sources.map((s) => ({ ...s })),
      },
    ]);
    setRedoStack([]);
  }, [clips, captions, sources]);

  // Restore a snapshot
  const restoreSnapshot = useCallback((snapshot) => {
    setClips(snapshot.clips.map((c) => ({ ...c })));
    setCaptions(snapshot.captions.map((c) => ({ ...c })));
    if (snapshot.sources) {
      setSources(snapshot.sources.map((s) => ({ ...s })));
    }
  }, []);

  // Compute total timeline duration from clips
  const totalDuration = clips.reduce((max, c) => Math.max(max, c.endTime - c.trimEnd), 0);

  // ---- Import Video ----

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);

    const objectUrl = URL.createObjectURL(file);
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.onloadedmetadata = () => {
      const duration = tempVideo.duration;
      const sourceId = `src-${Date.now()}`;
      const colorIndex = sources.length % SOURCE_COLORS.length;
      const color = SOURCE_COLORS[colorIndex];

      const newSource = {
        id: sourceId,
        name: file.name,
        src: objectUrl,
        duration,
      };

      const newClip = {
        id: `clip-${sourceId}`,
        sourceId,
        name: file.name.replace(/\.[^.]+$/, ''),
        startTime: 0,
        endTime: duration,
        color,
        trimStart: 0,
        trimEnd: 0,
      };

      saveSnapshot();
      setSources((prev) => [...prev, newSource]);
      setClips((prev) => [...prev, newClip]);
      setImporting(false);

      logEvent(EventTypes.IMPORT_VIDEO, Actors.CREATOR, {
        sourceId,
        fileName: file.name,
        duration,
      });
      announce(`Imported video: ${file.name}, ${duration.toFixed(1)} seconds`);

      // Clean up temp video
      tempVideo.src = '';
    };
    tempVideo.onerror = () => {
      setImporting(false);
      URL.revokeObjectURL(objectUrl);
      announce('Failed to import video file.');
    };
    tempVideo.src = objectUrl;

    // Reset input so the same file can be imported again
    e.target.value = '';
  }, [sources.length, saveSnapshot, logEvent]);

  // ---- Edit operations ----

  const handleSelectClip = (index) => {
    setSelectedClipIndex(index);
    if (clips[index]) {
      const clip = clips[index];
      const dur = Math.max(0.5, (clip.endTime - clip.trimEnd) - (clip.startTime + clip.trimStart));
      announce(`Selected clip ${index + 1} of ${clips.length}: ${clip.name}, ${dur.toFixed(1)} seconds`);
    }
  };

  const handleSplit = () => {
    if (selectedClipIndex === null) return;
    const clip = clips[selectedClipIndex];
    const effectiveStart = clip.startTime + clip.trimStart;
    const effectiveEnd = clip.endTime - clip.trimEnd;
    if (currentTime <= effectiveStart || currentTime >= effectiveEnd) {
      announce('Playhead is not within the selected clip. Cannot split.');
      return;
    }
    saveSnapshot();
    const clipA = { ...clip, endTime: currentTime, trimEnd: 0, id: clip.id + '-a' };
    const clipB = { ...clip, startTime: currentTime, trimStart: 0, id: clip.id + '-b' };
    const newClips = [...clips];
    newClips.splice(selectedClipIndex, 1, clipA, clipB);
    setClips(newClips);
    setSelectedClipIndex(selectedClipIndex);
    logEvent(EventTypes.SPLIT, Actors.CREATOR, {
      clipId: clip.id,
      clipName: clip.name,
      splitTime: currentTime,
    });
    announce(`Split ${clip.name} at ${currentTime.toFixed(1)} seconds`);
  };

  const handleDelete = () => {
    if (selectedClipIndex === null) return;
    const clip = clips[selectedClipIndex];
    saveSnapshot();
    const newClips = clips.filter((_, i) => i !== selectedClipIndex);
    setClips(newClips);
    setSelectedClipIndex(null);
    logEvent(EventTypes.DELETE_CLIP, Actors.CREATOR, {
      clipId: clip.id,
      clipName: clip.name,
    });
    announce(`Deleted clip: ${clip.name}`);
  };

  const handleMoveLeft = () => {
    if (selectedClipIndex === null || selectedClipIndex === 0) return;
    saveSnapshot();
    const newClips = [...clips];
    const idx = selectedClipIndex;
    [newClips[idx - 1], newClips[idx]] = [newClips[idx], newClips[idx - 1]];
    setClips(newClips);
    setSelectedClipIndex(idx - 1);
    logEvent(EventTypes.REORDER, Actors.CREATOR, {
      clipId: clips[selectedClipIndex].id,
      clipName: clips[selectedClipIndex].name,
      direction: 'left',
    });
    announce(`Moved ${clips[selectedClipIndex].name} left`);
  };

  const handleMoveRight = () => {
    if (selectedClipIndex === null || selectedClipIndex >= clips.length - 1) return;
    saveSnapshot();
    const newClips = [...clips];
    const idx = selectedClipIndex;
    [newClips[idx], newClips[idx + 1]] = [newClips[idx + 1], newClips[idx]];
    setClips(newClips);
    setSelectedClipIndex(idx + 1);
    logEvent(EventTypes.REORDER, Actors.CREATOR, {
      clipId: clips[selectedClipIndex].id,
      clipName: clips[selectedClipIndex].name,
      direction: 'right',
    });
    announce(`Moved ${clips[selectedClipIndex].name} right`);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [
      ...r,
      {
        clips: clips.map((c) => ({ ...c })),
        captions: captions.map((c) => ({ ...c })),
        sources: sources.map((s) => ({ ...s })),
      },
    ]);
    setUndoStack((u) => u.slice(0, -1));
    restoreSnapshot(prev);
    setSelectedClipIndex(null);
    logEvent(EventTypes.UNDO, Actors.CREATOR, {});
    announce('Undo');
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((u) => [
      ...u,
      {
        clips: clips.map((c) => ({ ...c })),
        captions: captions.map((c) => ({ ...c })),
        sources: sources.map((s) => ({ ...s })),
      },
    ]);
    setRedoStack((r) => r.slice(0, -1));
    restoreSnapshot(next);
    setSelectedClipIndex(null);
    logEvent(EventTypes.REDO, Actors.CREATOR, {});
    announce('Redo');
  };

  // ---- Caption operations ----

  const handleAddCaption = () => {
    if (!captionText.trim()) return;
    saveSnapshot();
    const newCaption = {
      id: `cap-${Date.now()}`,
      text: captionText.trim(),
      startTime: captionStart,
      endTime: captionEnd,
    };
    setCaptions((prev) => [...prev, newCaption]);
    logEvent(EventTypes.ADD_CAPTION, Actors.CREATOR, {
      captionId: newCaption.id,
      text: newCaption.text,
      startTime: captionStart,
      endTime: captionEnd,
    });
    announce(`Added caption: "${newCaption.text}"`);
    setCaptionText('');
  };

  const handleRemoveCaption = (capId) => {
    const cap = captions.find((c) => c.id === capId);
    saveSnapshot();
    setCaptions((prev) => prev.filter((c) => c.id !== capId));
    logEvent(EventTypes.REMOVE_CAPTION, Actors.CREATOR, {
      captionId: capId,
      text: cap?.text,
    });
    announce(`Removed caption: "${cap?.text}"`);
  };

  // ---- Trim drag handling ----

  const startTrimDrag = (e, clipIndex, side) => {
    e.stopPropagation();
    e.preventDefault();
    const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
    dragRef.current = { clipIndex, side, startX: clientX, originalClip: { ...clips[clipIndex] } };

    const onMove = (ev) => {
      if (!dragRef.current) return;
      const cx = ev.type.startsWith('touch') ? ev.touches[0].clientX : ev.clientX;
      const dx = cx - dragRef.current.startX;
      const timelineEl = timelineRef.current;
      if (!timelineEl) return;
      const pxPerSec = timelineEl.clientWidth / Math.max(totalDuration, 1);
      const dt = dx / pxPerSec;
      const orig = dragRef.current.originalClip;
      const duration = orig.endTime - orig.startTime;

      if (dragRef.current.side === 'left') {
        const newTrimStart = Math.max(0, Math.min(orig.trimStart + dt, duration - orig.trimEnd - 0.5));
        setClips((prev) =>
          prev.map((c, i) => (i === dragRef.current.clipIndex ? { ...c, trimStart: newTrimStart } : c))
        );
      } else {
        const newTrimEnd = Math.max(0, Math.min(orig.trimEnd - dt, duration - orig.trimStart - 0.5));
        setClips((prev) =>
          prev.map((c, i) => (i === dragRef.current.clipIndex ? { ...c, trimEnd: newTrimEnd } : c))
        );
      }
    };

    const onEnd = () => {
      if (dragRef.current) {
        const idx = dragRef.current.clipIndex;
        const originalClip = { ...dragRef.current.originalClip };
        const side = dragRef.current.side;
        const updatedClip = clips[idx];
        if (updatedClip) {
          const effectiveDuration =
            updatedClip.endTime - updatedClip.trimEnd - (updatedClip.startTime + updatedClip.trimStart);
          setUndoStack((prev) => [
            ...prev,
            {
              clips: clips.map((c, i) =>
                i === idx ? originalClip : { ...c }
              ),
              captions: captions.map((c) => ({ ...c })),
              sources: sources.map((s) => ({ ...s })),
            },
          ]);
          setRedoStack([]);
          logEvent(EventTypes.TRIM, Actors.CREATOR, {
            clipId: updatedClip.id,
            clipName: updatedClip.name,
            side,
            trimStart: updatedClip.trimStart,
            trimEnd: updatedClip.trimEnd,
          });
          announce(
            `Trimmed ${updatedClip.name} to ${Math.max(0.5, effectiveDuration).toFixed(1)} seconds`
          );
        }
        dragRef.current = null;
      }
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  };

  // ---- Keyboard navigation ----

  const handleTimelineKeyDown = (e) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = selectedClipIndex === null ? 0 : Math.min(selectedClipIndex + 1, clips.length - 1);
      handleSelectClip(next);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = selectedClipIndex === null ? 0 : Math.max(selectedClipIndex - 1, 0);
      handleSelectClip(prev);
    }
  };

  const handleToolbarKeyDown = (e) => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const buttons = Array.from(toolbar.querySelectorAll('button:not([disabled])'));
    const current = buttons.indexOf(document.activeElement);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = current < buttons.length - 1 ? current + 1 : 0;
      buttons[next]?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = current > 0 ? current - 1 : buttons.length - 1;
      buttons[prev]?.focus();
    }
  };

  // ---- Compute layout ----

  const clipLayouts = [];
  let runningTime = 0;
  for (const clip of clips) {
    const effectiveStart = clip.startTime + clip.trimStart;
    const effectiveEnd = clip.endTime - clip.trimEnd;
    const dur = Math.max(0.5, effectiveEnd - effectiveStart);
    clipLayouts.push({ offsetTime: runningTime, duration: dur });
    runningTime += dur;
  }
  const timelineTotalDuration = runningTime || 1;

  const playheadPercent = Math.min(100, Math.max(0, (currentTime / timelineTotalDuration) * 100));

  // Find source name for a clip
  const getSourceName = (clip) => {
    const source = sources.find((s) => s.id === clip.sourceId);
    return source?.name || '';
  };

  return (
    <div className="overflow-hidden" style={{ background: 'linear-gradient(180deg, #1a2d4d, #152240)' }}>
      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onChange={handleFileSelect}
        className="hidden"
        aria-hidden="true"
      />

      {/* Edit Toolbar */}
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="Edit toolbar"
        onKeyDown={handleToolbarKeyDown}
        className="flex flex-wrap items-center gap-1.5 p-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}
      >
        <ToolbarButton
          onClick={handleImportClick}
          disabled={importing}
          label="Import a video file"
        >
          {importing ? 'Importing...' : 'Import Video'}
        </ToolbarButton>
        <div className="border-l border-white/30 h-6 mx-1" />
        <ToolbarButton
          onClick={handleSplit}
          disabled={selectedClipIndex === null}
          label="Split clip at playhead"
        >
          Split
        </ToolbarButton>
        <ToolbarButton
          onClick={handleDelete}
          disabled={selectedClipIndex === null}
          label="Delete selected clip"
        >
          Delete
        </ToolbarButton>
        {selectedClipIndex !== null && (
          <>
            <ToolbarButton
              onClick={handleMoveLeft}
              disabled={selectedClipIndex === 0}
              label="Move clip left"
            >
              Move Left
            </ToolbarButton>
            <ToolbarButton
              onClick={handleMoveRight}
              disabled={selectedClipIndex >= clips.length - 1}
              label="Move clip right"
            >
              Move Right
            </ToolbarButton>
          </>
        )}
        <div className="border-l border-white/30 h-6 mx-1" />
        <ToolbarButton
          onClick={() => setShowCaptionEditor((v) => !v)}
          label={showCaptionEditor ? 'Hide caption editor' : 'Show caption editor'}
        >
          {showCaptionEditor ? 'Hide Captions' : 'Add Caption'}
        </ToolbarButton>
        {onTextTool && (
          <>
            <div className="border-l border-white/30 h-6 mx-1" aria-hidden="true" />
            <button
              onClick={onTextTool}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors focus:outline-2 focus:outline-offset-1 focus:outline-white ${
                textToolActive
                  ? 'bg-[#fbbf24] text-[#1a1a2e]'
                  : 'bg-white/20 text-white border border-white/30 hover:bg-white/30'
              }`}
              style={{ minHeight: '44px', minWidth: '44px' }}
              aria-label="Text overlay tool"
              aria-pressed={textToolActive}
            >
              T Text
            </button>
          </>
        )}
        <div className="border-l border-white/30 h-6 mx-1" />
        <ToolbarButton
          onClick={handleUndo}
          disabled={undoStack.length === 0}
          label="Undo last action"
        >
          Undo
        </ToolbarButton>
        <ToolbarButton
          onClick={handleRedo}
          disabled={redoStack.length === 0}
          label="Redo last undone action"
        >
          Redo
        </ToolbarButton>
      </div>

      {/* Source indicators */}
      {sources.length > 1 && (
        <div className="flex flex-wrap gap-1.5 px-2 pt-2" aria-label="Video sources">
          {sources.map((source, idx) => (
            <span
              key={source.id}
              className="inline-flex items-center gap-1.5 text-white/80 text-xs font-medium px-2.5 py-1 rounded-md"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: `1px solid ${SOURCE_COLORS[idx % SOURCE_COLORS.length]}40` }}
            >
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ backgroundColor: SOURCE_COLORS[idx % SOURCE_COLORS.length], boxShadow: `0 0 4px ${SOURCE_COLORS[idx % SOURCE_COLORS.length]}60` }}
                aria-hidden="true"
              />
              {source.name}
            </span>
          ))}
        </div>
      )}

      {/* Timeline Strip */}
      <div
        ref={timelineRef}
        role="listbox"
        aria-label="Video timeline clips. Click to seek."
        tabIndex={0}
        onKeyDown={handleTimelineKeyDown}
        onClick={(e) => {
          // Click-to-seek: convert click X position to time
          if (!timelineRef.current || !onSeek) return;
          const rect = timelineRef.current.getBoundingClientRect();
          const x = (e.clientX || (e.touches && e.touches[0].clientX) || 0) - rect.left;
          const fraction = Math.max(0, Math.min(1, x / rect.width));
          const seekTime = fraction * timelineTotalDuration;
          onSeek(seekTime);
        }}
        className="relative flex items-stretch mx-2 my-3 rounded-lg overflow-hidden cursor-pointer"
        style={{ height: '56px', backgroundColor: '#0f1d35', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)' }}
      >
        {clips.map((clip, idx) => {
          const layout = clipLayouts[idx];
          const widthPercent = (layout.duration / timelineTotalDuration) * 100;
          const isSelected = selectedClipIndex === idx;
          const sourceName = sources.length > 1 ? getSourceName(clip) : '';

          return (
            <div
              key={clip.id}
              role="option"
              aria-selected={isSelected}
              aria-label={`${clip.name}${sourceName ? ` (${sourceName})` : ''}, ${layout.duration.toFixed(1)} seconds`}
              onClick={(e) => {
                e.stopPropagation();
                handleSelectClip(idx);
                // Seek to the clicked position within the clip
                if (onSeek && timelineRef.current) {
                  const rect = timelineRef.current.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const fraction = Math.max(0, Math.min(1, x / rect.width));
                  const seekTime = fraction * timelineTotalDuration;
                  onSeek(seekTime);
                }
              }}
              className="relative flex items-center justify-center cursor-pointer overflow-hidden select-none transition-all duration-150"
              style={{
                width: `${widthPercent}%`,
                background: isSelected ? `linear-gradient(180deg, ${clip.color}, ${clip.color}cc)` : `linear-gradient(180deg, ${clip.color}dd, ${clip.color}99)`,
                border: isSelected ? '2px solid white' : '1px solid rgba(255,255,255,0.15)',
                borderRadius: '6px',
                margin: '0 1.5px',
                minWidth: '24px',
                boxShadow: isSelected ? '0 0 0 1px rgba(255,255,255,0.3), 0 2px 8px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.2)',
              }}
            >
              {/* Trim handles (selected clip only) */}
              {isSelected && (
                <>
                  <div
                    role="slider"
                    aria-label={`Trim start of ${clip.name}`}
                    aria-valuemin={0}
                    aria-valuemax={clip.endTime - clip.startTime}
                    aria-valuenow={clip.trimStart}
                    aria-valuetext={`Trim start: ${clip.trimStart.toFixed(1)} seconds`}
                    tabIndex={0}
                    onMouseDown={(e) => startTrimDrag(e, idx, 'left')}
                    onTouchStart={(e) => startTrimDrag(e, idx, 'left')}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                        e.preventDefault();
                        e.stopPropagation();
                        const dur = clip.endTime - clip.startTime;
                        const newVal = Math.min(clip.trimStart + 0.5, dur - clip.trimEnd - 0.5);
                        saveSnapshot();
                        setClips((prev) => prev.map((c, i) => (i === idx ? { ...c, trimStart: newVal } : c)));
                        announce(`Trim start: ${newVal.toFixed(1)} seconds`);
                      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        e.stopPropagation();
                        const newVal = Math.max(0, clip.trimStart - 0.5);
                        saveSnapshot();
                        setClips((prev) => prev.map((c, i) => (i === idx ? { ...c, trimStart: newVal } : c)));
                        announce(`Trim start: ${newVal.toFixed(1)} seconds`);
                      }
                    }}
                    className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize z-10 flex items-center justify-center"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.5)',
                      minHeight: '44px',
                      minWidth: '44px',
                    }}
                  >
                    <div className="w-0.5 h-4 bg-white rounded" />
                  </div>
                  <div
                    role="slider"
                    aria-label={`Trim end of ${clip.name}`}
                    aria-valuemin={0}
                    aria-valuemax={clip.endTime - clip.startTime}
                    aria-valuenow={clip.trimEnd}
                    aria-valuetext={`Trim end: ${clip.trimEnd.toFixed(1)} seconds`}
                    tabIndex={0}
                    onMouseDown={(e) => startTrimDrag(e, idx, 'right')}
                    onTouchStart={(e) => startTrimDrag(e, idx, 'right')}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                        e.preventDefault();
                        e.stopPropagation();
                        const dur = clip.endTime - clip.startTime;
                        const newVal = Math.min(clip.trimEnd + 0.5, dur - clip.trimStart - 0.5);
                        saveSnapshot();
                        setClips((prev) => prev.map((c, i) => (i === idx ? { ...c, trimEnd: newVal } : c)));
                        announce(`Trim end: ${newVal.toFixed(1)} seconds`);
                      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        e.stopPropagation();
                        const newVal = Math.max(0, clip.trimEnd - 0.5);
                        saveSnapshot();
                        setClips((prev) => prev.map((c, i) => (i === idx ? { ...c, trimEnd: newVal } : c)));
                        announce(`Trim end: ${newVal.toFixed(1)} seconds`);
                      }
                    }}
                    className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize z-10 flex items-center justify-center"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.5)',
                      minHeight: '44px',
                      minWidth: '44px',
                    }}
                  >
                    <div className="w-0.5 h-4 bg-white rounded" />
                  </div>
                </>
              )}
              <span
                className="text-white text-xs font-medium truncate px-2 pointer-events-none flex flex-col items-center leading-tight"
                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}
              >
                <span className="truncate max-w-full">{clip.name}</span>
                {sourceName && (
                  <span className="text-white/50 text-[10px] truncate max-w-full">{sourceName}</span>
                )}
              </span>
            </div>
          );
        })}

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 z-20 pointer-events-none"
          style={{ left: `${playheadPercent}%`, width: '2px', background: 'white', boxShadow: '0 0 6px rgba(255,255,255,0.5)' }}
        >
          <div
            className="absolute -top-0.5 rounded-sm"
            style={{ left: '-4px', width: '10px', height: '6px', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}
          />
        </div>
      </div>

      {/* Caption Editor */}
      {showCaptionEditor && (
        <div className="mx-2 mb-3 p-3 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 className="text-white text-sm font-semibold mb-2">Caption Editor</h3>
          <div className="flex flex-wrap gap-2 items-end mb-3">
            <div className="flex-1 min-w-[160px]">
              <label htmlFor="caption-text" className="text-white/70 text-xs block mb-1">
                Caption text
              </label>
              <input
                id="caption-text"
                type="text"
                value={captionText}
                onChange={(e) => setCaptionText(e.target.value)}
                placeholder="Enter caption..."
                className="w-full px-2 py-1.5 rounded text-sm bg-white/10 text-white border border-white/20 focus:outline-none focus:border-white/50"
              />
            </div>
            <div className="w-20">
              <label htmlFor="caption-start" className="text-white/70 text-xs block mb-1">
                Start (s)
              </label>
              <input
                id="caption-start"
                type="number"
                min={0}
                step={0.5}
                value={captionStart}
                onChange={(e) => setCaptionStart(Number(e.target.value))}
                className="w-full px-2 py-1.5 rounded text-sm bg-white/10 text-white border border-white/20 focus:outline-none focus:border-white/50"
              />
            </div>
            <div className="w-20">
              <label htmlFor="caption-end" className="text-white/70 text-xs block mb-1">
                End (s)
              </label>
              <input
                id="caption-end"
                type="number"
                min={0}
                step={0.5}
                value={captionEnd}
                onChange={(e) => setCaptionEnd(Number(e.target.value))}
                className="w-full px-2 py-1.5 rounded text-sm bg-white/10 text-white border border-white/20 focus:outline-none focus:border-white/50"
              />
            </div>
            <button
              onClick={handleAddCaption}
              disabled={!captionText.trim()}
              aria-label="Add caption"
              className="px-3 py-1.5 rounded text-sm text-white font-medium disabled:opacity-40"
              style={{ backgroundColor: '#2B579A', minHeight: '44px', minWidth: '44px' }}
            >
              Add
            </button>
          </div>

          {/* Existing captions list */}
          {captions.length > 0 && (
            <ul className="space-y-1" aria-label="Captions list">
              {captions.map((cap) => (
                <li
                  key={cap.id}
                  className="flex items-center justify-between gap-2 px-2 py-1 rounded text-sm text-white bg-white/5"
                >
                  <span className="truncate flex-1">
                    "{cap.text}" ({cap.startTime}s - {cap.endTime}s)
                  </span>
                  <button
                    onClick={() => handleRemoveCaption(cap.id)}
                    aria-label={`Remove caption: ${cap.text}`}
                    className="text-red-400 hover:text-red-300 text-xs font-medium shrink-0"
                    style={{ minHeight: '44px', minWidth: '44px' }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          {captions.length === 0 && (
            <p className="text-white/40 text-xs">No captions added yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Toolbar button with consistent styling and minimum 44x44 touch target */
function ToolbarButton({ children, onClick, disabled, label }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="px-3 py-1.5 rounded-md text-xs font-semibold text-white/90 transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/15 active:scale-[0.97]"
      style={{ backgroundColor: 'rgba(255,255,255,0.08)', minHeight: '44px', minWidth: '44px', border: '1px solid rgba(255,255,255,0.1)' }}
    >
      {children}
    </button>
  );
}
