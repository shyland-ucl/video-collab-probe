import { useState, useEffect, useCallback, useRef } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { announce } from '../../utils/announcer.js';

/**
 * Accessible text/list-based video editor for BLV users.
 * Replaces the visual timeline with a navigable clip list.
 * Based on AVscript (Huh et al., CHI 2023) design patterns.
 */
export default function MockEditor({ segments = [], currentTime = 0, onSeek, onEditChange, initialSources = [] }) {
  const { logEvent } = useEventLogger();

  const [clips, setClips] = useState([]);
  const [captions, setCaptions] = useState([]);
  const [sources, setSources] = useState([]);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [selectedClipIndex, setSelectedClipIndex] = useState(null);
  const [showCaptionForm, setShowCaptionForm] = useState(false);
  const [captionText, setCaptionText] = useState('');
  const [importing, setImporting] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState(null); // 'clips' | 'captions' | null

  const fileInputRef = useRef(null);
  const onEditChangeRef = useRef(onEditChange);
  const sourcesRef = useRef(sources);
  useEffect(() => { onEditChangeRef.current = onEditChange; }, [onEditChange]);
  useEffect(() => { sourcesRef.current = sources; }, [sources]);

  // Notify parent whenever clips, captions, or sources change
  useEffect(() => {
    if (onEditChangeRef.current) {
      onEditChangeRef.current(clips, captions, sourcesRef.current);
    }
  }, [clips, captions, sources]);

  // Initialize clips + sources when initialSources arrives
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    if (initialSources.length === 0 && segments.length === 0) return;

    if (initialSources.length > 0) {
      const sourcesOnly = initialSources.map((src) => ({
        id: src.id, name: src.name, src: src.src, duration: src.duration,
      }));
      setSources(sourcesOnly);

      const allClips = [];
      initialSources.forEach((src) => {
        if (src.segments && src.segments.length > 0) {
          src.segments.forEach((seg) => {
            allClips.push({
              id: seg.id, sourceId: src.id, name: seg.name,
              startTime: seg.start_time, endTime: seg.end_time,
              color: seg.color || '#3B82F6', trimStart: 0, trimEnd: 0,
            });
          });
        } else {
          allClips.push({
            id: `clip-${src.id}`, sourceId: src.id,
            name: src.name || src.title || 'Untitled',
            startTime: 0, endTime: src.duration || 0,
            color: '#3B82F6', trimStart: 0, trimEnd: 0,
          });
        }
      });
      if (allClips.length > 0) {
        setClips(allClips);
        didInit.current = true;
        return;
      }
    }

    if (segments.length > 0) {
      setClips(
        segments.map((seg) => ({
          id: seg.id, sourceId: 'default', name: seg.name,
          startTime: seg.start_time, endTime: seg.end_time,
          color: seg.color || '#3B82F6', trimStart: 0, trimEnd: 0,
        }))
      );
      didInit.current = true;
    }
  }, [segments, initialSources]);

  // --- Undo/Redo ---
  const saveSnapshot = useCallback(() => {
    setUndoStack((prev) => [...prev, {
      clips: clips.map((c) => ({ ...c })),
      captions: captions.map((c) => ({ ...c })),
      sources: sources.map((s) => ({ ...s })),
    }]);
    setRedoStack([]);
  }, [clips, captions, sources]);

  const restoreSnapshot = useCallback((snapshot) => {
    setClips(snapshot.clips.map((c) => ({ ...c })));
    setCaptions(snapshot.captions.map((c) => ({ ...c })));
    if (snapshot.sources) setSources(snapshot.sources.map((s) => ({ ...s })));
  }, []);

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, { clips: clips.map((c) => ({ ...c })), captions: captions.map((c) => ({ ...c })), sources: sources.map((s) => ({ ...s })) }]);
    setUndoStack((u) => u.slice(0, -1));
    restoreSnapshot(prev);
    setSelectedClipIndex(null);
    logEvent(EventTypes.UNDO, Actors.CREATOR, {});
    announce('Undo');
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((u) => [...u, { clips: clips.map((c) => ({ ...c })), captions: captions.map((c) => ({ ...c })), sources: sources.map((s) => ({ ...s })) }]);
    setRedoStack((r) => r.slice(0, -1));
    restoreSnapshot(next);
    setSelectedClipIndex(null);
    logEvent(EventTypes.REDO, Actors.CREATOR, {});
    announce('Redo');
  };

  // --- Import ---
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
      const newSource = { id: sourceId, name: file.name, src: objectUrl, duration };
      const newClip = {
        id: `clip-${sourceId}`, sourceId, name: file.name.replace(/\.[^.]+$/, ''),
        startTime: 0, endTime: duration, color: '#3B82F6', trimStart: 0, trimEnd: 0,
      };
      saveSnapshot();
      setSources((prev) => [...prev, newSource]);
      setClips((prev) => [...prev, newClip]);
      setImporting(false);
      logEvent(EventTypes.IMPORT_VIDEO, Actors.CREATOR, { sourceId, fileName: file.name, duration });
      announce(`Imported video: ${file.name}, ${duration.toFixed(1)} seconds`);
      tempVideo.src = '';
    };
    tempVideo.onerror = () => { setImporting(false); URL.revokeObjectURL(objectUrl); announce('Failed to import video file.'); };
    tempVideo.src = objectUrl;
    e.target.value = '';
  }, [saveSnapshot, logEvent]);

  // --- Clip operations ---
  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const getEffectiveDuration = (clip) => {
    return Math.max(0.5, (clip.endTime - clip.trimEnd) - (clip.startTime + clip.trimStart));
  };

  const handleSelectClip = (index) => {
    setSelectedClipIndex(index);
    const clip = clips[index];
    if (clip) {
      announce(`Selected: ${clip.name}, ${getEffectiveDuration(clip).toFixed(1)} seconds`);
      if (onSeek) onSeek(clip.startTime + clip.trimStart);
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
    logEvent(EventTypes.SPLIT, Actors.CREATOR, { clipId: clip.id, clipName: clip.name, splitTime: currentTime });
    announce(`Split ${clip.name} at ${formatTime(currentTime)}`);
  };

  const handleDelete = () => {
    if (selectedClipIndex === null) return;
    const clip = clips[selectedClipIndex];
    saveSnapshot();
    setClips(clips.filter((_, i) => i !== selectedClipIndex));
    setSelectedClipIndex(null);
    logEvent(EventTypes.DELETE_CLIP, Actors.CREATOR, { clipId: clip.id, clipName: clip.name });
    announce(`Deleted: ${clip.name}`);
  };

  const handleMoveUp = () => {
    if (selectedClipIndex === null || selectedClipIndex === 0) return;
    saveSnapshot();
    const newClips = [...clips];
    const idx = selectedClipIndex;
    [newClips[idx - 1], newClips[idx]] = [newClips[idx], newClips[idx - 1]];
    setClips(newClips);
    setSelectedClipIndex(idx - 1);
    logEvent(EventTypes.REORDER, Actors.CREATOR, { clipId: clips[idx].id, clipName: clips[idx].name, direction: 'up' });
    announce(`Moved ${clips[idx].name} up`);
  };

  const handleMoveDown = () => {
    if (selectedClipIndex === null || selectedClipIndex >= clips.length - 1) return;
    saveSnapshot();
    const newClips = [...clips];
    const idx = selectedClipIndex;
    [newClips[idx], newClips[idx + 1]] = [newClips[idx + 1], newClips[idx]];
    setClips(newClips);
    setSelectedClipIndex(idx + 1);
    logEvent(EventTypes.REORDER, Actors.CREATOR, { clipId: clips[idx].id, clipName: clips[idx].name, direction: 'down' });
    announce(`Moved ${clips[idx].name} down`);
  };

  const handleTrimStart = () => {
    if (selectedClipIndex === null) return;
    const clip = clips[selectedClipIndex];
    const dur = clip.endTime - clip.startTime;
    const newVal = Math.min(clip.trimStart + 0.5, dur - clip.trimEnd - 0.5);
    saveSnapshot();
    setClips((prev) => prev.map((c, i) => (i === selectedClipIndex ? { ...c, trimStart: newVal } : c)));
    logEvent(EventTypes.TRIM, Actors.CREATOR, { clipId: clip.id, side: 'start', trimStart: newVal });
    announce(`Trim start: ${newVal.toFixed(1)} seconds`);
  };

  const handleTrimEnd = () => {
    if (selectedClipIndex === null) return;
    const clip = clips[selectedClipIndex];
    const dur = clip.endTime - clip.startTime;
    const newVal = Math.min(clip.trimEnd + 0.5, dur - clip.trimStart - 0.5);
    saveSnapshot();
    setClips((prev) => prev.map((c, i) => (i === selectedClipIndex ? { ...c, trimEnd: newVal } : c)));
    logEvent(EventTypes.TRIM, Actors.CREATOR, { clipId: clip.id, side: 'end', trimEnd: newVal });
    announce(`Trim end: ${newVal.toFixed(1)} seconds`);
  };

  // --- Caption operations ---
  const handleAddCaption = () => {
    if (!captionText.trim()) return;
    saveSnapshot();
    const newCaption = { id: `cap-${Date.now()}`, text: captionText.trim(), startTime: currentTime, endTime: currentTime + 3 };
    setCaptions((prev) => [...prev, newCaption]);
    logEvent(EventTypes.ADD_CAPTION, Actors.CREATOR, { captionId: newCaption.id, text: newCaption.text, startTime: currentTime });
    announce(`Added caption: "${newCaption.text}" at ${formatTime(currentTime)}`);
    setCaptionText('');
  };

  const handleRemoveCaption = (capId) => {
    const cap = captions.find((c) => c.id === capId);
    saveSnapshot();
    setCaptions((prev) => prev.filter((c) => c.id !== capId));
    logEvent(EventTypes.REMOVE_CAPTION, Actors.CREATOR, { captionId: capId, text: cap?.text });
    announce(`Removed caption: "${cap?.text}"`);
  };

  const selectedClip = selectedClipIndex !== null ? clips[selectedClipIndex] : null;

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1F3864' }}>
      <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileSelect} className="hidden" aria-hidden="true" />

      {/* Header with clip count and undo/redo */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/20">
        <h2 className="text-white font-bold text-sm">
          Editor
          <span className="ml-2 text-white/60 font-normal">{clips.length} clips</span>
        </h2>
        <div className="flex gap-2">
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            aria-label="Undo last action"
            className="px-3 py-2 rounded text-xs font-medium text-white disabled:opacity-30 focus:outline-2 focus:outline-white"
            style={{ backgroundColor: '#2B579A', minHeight: '44px' }}
          >
            Undo
          </button>
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            aria-label="Redo last action"
            className="px-3 py-2 rounded text-xs font-medium text-white disabled:opacity-30 focus:outline-2 focus:outline-white"
            style={{ backgroundColor: '#2B579A', minHeight: '44px' }}
          >
            Redo
          </button>
        </div>
      </div>

      {/* Clip List */}
      <div className="px-3 py-2">
        <button
          onClick={() => setExpandedPanel(expandedPanel === 'clips' ? null : 'clips')}
          aria-expanded={expandedPanel === 'clips'}
          className="w-full flex items-center justify-between px-3 py-3 rounded-lg text-white text-sm font-medium bg-white/10 hover:bg-white/15 focus:outline-2 focus:outline-white"
          style={{ minHeight: '48px' }}
        >
          <span>Clips ({clips.length})</span>
          <span className="text-white/60">{expandedPanel === 'clips' ? 'Collapse' : 'Expand'}</span>
        </button>

        {expandedPanel === 'clips' && (
          <ul className="mt-2 space-y-1" role="listbox" aria-label="Video clips">
            {clips.map((clip, idx) => {
              const isSelected = selectedClipIndex === idx;
              const dur = getEffectiveDuration(clip);
              return (
                <li key={clip.id}>
                  <button
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelectClip(idx)}
                    className={`w-full text-left px-3 py-3 rounded-lg text-sm transition-colors focus:outline-2 focus:outline-white ${
                      isSelected
                        ? 'bg-white/20 ring-2 ring-white'
                        : 'bg-white/5 hover:bg-white/10'
                    }`}
                    style={{ minHeight: '48px' }}
                    aria-label={`Clip ${idx + 1}: ${clip.name}, ${dur.toFixed(1)} seconds, ${formatTime(clip.startTime + clip.trimStart)} to ${formatTime(clip.endTime - clip.trimEnd)}`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: clip.color }}
                        aria-hidden="true"
                      />
                      <span className="text-white font-medium truncate">{clip.name}</span>
                      <span className="text-white/50 text-xs ml-auto flex-shrink-0">{dur.toFixed(1)}s</span>
                    </span>
                    <span className="text-white/40 text-xs mt-0.5 block pl-5">
                      {formatTime(clip.startTime + clip.trimStart)} — {formatTime(clip.endTime - clip.trimEnd)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Selected clip actions */}
        {expandedPanel === 'clips' && selectedClip && (
          <div className="mt-3 p-3 rounded-lg bg-white/10" role="group" aria-label={`Actions for ${selectedClip.name}`}>
            <p className="text-white text-xs font-semibold mb-2">
              Editing: {selectedClip.name}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <EditorButton onClick={handleSplit} label="Split at playhead">Split Here</EditorButton>
              <EditorButton onClick={handleDelete} label={`Delete ${selectedClip.name}`} danger>Delete</EditorButton>
              <EditorButton onClick={handleMoveUp} disabled={selectedClipIndex === 0} label="Move clip earlier">Move Up</EditorButton>
              <EditorButton onClick={handleMoveDown} disabled={selectedClipIndex >= clips.length - 1} label="Move clip later">Move Down</EditorButton>
              <EditorButton onClick={handleTrimStart} label="Trim start by 0.5 seconds">Trim Start +0.5s</EditorButton>
              <EditorButton onClick={handleTrimEnd} label="Trim end by 0.5 seconds">Trim End +0.5s</EditorButton>
            </div>
            {(selectedClip.trimStart > 0 || selectedClip.trimEnd > 0) && (
              <p className="text-white/50 text-xs mt-2" aria-live="polite">
                Trimmed: {selectedClip.trimStart.toFixed(1)}s from start, {selectedClip.trimEnd.toFixed(1)}s from end
              </p>
            )}
          </div>
        )}
      </div>

      {/* Captions */}
      <div className="px-3 py-2 border-t border-white/10">
        <button
          onClick={() => setExpandedPanel(expandedPanel === 'captions' ? null : 'captions')}
          aria-expanded={expandedPanel === 'captions'}
          className="w-full flex items-center justify-between px-3 py-3 rounded-lg text-white text-sm font-medium bg-white/10 hover:bg-white/15 focus:outline-2 focus:outline-white"
          style={{ minHeight: '48px' }}
        >
          <span>Captions ({captions.length})</span>
          <span className="text-white/60">{expandedPanel === 'captions' ? 'Collapse' : 'Expand'}</span>
        </button>

        {expandedPanel === 'captions' && (
          <div className="mt-2 space-y-2">
            {/* Add caption form */}
            <div className="flex gap-2">
              <input
                type="text"
                value={captionText}
                onChange={(e) => setCaptionText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddCaption(); }}
                placeholder="Type caption text..."
                className="flex-1 px-3 py-2 rounded-lg text-sm bg-white/10 text-white border border-white/20 placeholder-white/30 focus:outline-2 focus:outline-white"
                aria-label="Caption text"
                style={{ minHeight: '44px' }}
              />
              <button
                onClick={handleAddCaption}
                disabled={!captionText.trim()}
                aria-label="Add caption at current time"
                className="px-4 py-2 rounded-lg text-sm text-white font-medium disabled:opacity-30 focus:outline-2 focus:outline-white"
                style={{ backgroundColor: '#2B579A', minHeight: '44px' }}
              >
                Add
              </button>
            </div>

            {/* Captions list */}
            {captions.length > 0 ? (
              <ul className="space-y-1" aria-label="Captions list">
                {captions.map((cap) => (
                  <li key={cap.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5">
                    <span className="flex-1 text-white text-sm truncate">
                      "{cap.text}"
                      <span className="text-white/40 text-xs ml-1">
                        at {formatTime(cap.startTime)}
                      </span>
                    </span>
                    <button
                      onClick={() => handleRemoveCaption(cap.id)}
                      aria-label={`Remove caption: ${cap.text}`}
                      className="text-red-400 text-xs font-medium px-2 py-2 rounded hover:bg-white/10 focus:outline-2 focus:outline-white"
                      style={{ minHeight: '44px', minWidth: '44px' }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-white/30 text-xs px-3">No captions yet. Add one above.</p>
            )}
          </div>
        )}
      </div>

      {/* Import button */}
      <div className="px-3 py-3 border-t border-white/10">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          aria-label={importing ? 'Importing video...' : 'Import a video file'}
          className="w-full py-3 rounded-lg text-sm text-white font-medium bg-white/10 hover:bg-white/15 focus:outline-2 focus:outline-white disabled:opacity-40"
          style={{ minHeight: '48px' }}
        >
          {importing ? 'Importing...' : 'Import Video'}
        </button>
      </div>
    </div>
  );
}

function EditorButton({ children, onClick, disabled, label, danger }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`py-3 rounded-lg text-xs font-medium text-white disabled:opacity-30 focus:outline-2 focus:outline-white ${
        danger ? 'bg-red-600/80 hover:bg-red-600' : 'bg-white/15 hover:bg-white/25'
      }`}
      style={{ minHeight: '48px' }}
    >
      {children}
    </button>
  );
}
