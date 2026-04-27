import { useState, useCallback, useEffect, useRef } from 'react';
import { useEventLogger } from '../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../utils/eventTypes.js';
import { announce } from '../utils/announcer.js';

function getOverlaySignature(overlays = []) {
  return overlays
    .map((overlay) => `${overlay.id}:${overlay.content}:${overlay.size}:${overlay.color}:${overlay.x}:${overlay.y}`)
    .join('|');
}

export default function useTextOverlay({ initialOverlays = [], onOverlaysChange } = {}) {
  const { logEvent } = useEventLogger();
  const [textOverlays, setTextOverlays] = useState(initialOverlays);
  const [activeOverlayId, setActiveOverlayId] = useState(null);
  const [textToolActive, setTextToolActive] = useState(false);
  const syncingFromPropsRef = useRef(false);
  const onOverlaysChangeRef = useRef(onOverlaysChange);
  const initialSignature = getOverlaySignature(initialOverlays);
  // Track the props signature we last reconciled with. Without this, any
  // local edit (e.g. adding a text overlay via the T Text tool) re-runs the
  // props-sync effect, sees that local has diverged from props (the parent
  // hasn't broadcast the new overlay back yet), and clobbers the local
  // state — wiping out the new overlay AND setTextToolActive(false). The
  // gate makes the sync only fire when props themselves changed.
  const lastInitialSignatureRef = useRef(initialSignature);

  useEffect(() => {
    onOverlaysChangeRef.current = onOverlaysChange;
  }, [onOverlaysChange]);

  useEffect(() => {
    if (initialSignature === lastInitialSignatureRef.current) {
      // Props unchanged since last reconciliation — this fire was caused by
      // a local textOverlays update. Do not revert.
      return;
    }
    lastInitialSignatureRef.current = initialSignature;
    const currentSignature = getOverlaySignature(textOverlays);
    if (initialSignature === currentSignature) return;
    syncingFromPropsRef.current = true;
    setTextOverlays(initialOverlays);
    if (activeOverlayId && !initialOverlays.some((overlay) => overlay.id === activeOverlayId)) {
      setActiveOverlayId(null);
      setTextToolActive(false);
    }
  }, [activeOverlayId, initialOverlays, initialSignature, textOverlays]);

  useEffect(() => {
    if (!onOverlaysChangeRef.current) return;
    if (syncingFromPropsRef.current) {
      syncingFromPropsRef.current = false;
      return;
    }
    onOverlaysChangeRef.current(textOverlays);
  }, [textOverlays]);

  const handleTextTool = useCallback(() => {
    if (textToolActive) {
      setTextToolActive(false);
      setActiveOverlayId(null);
      return;
    }
    const newOverlay = {
      id: `text-${Date.now()}`,
      content: 'Text',
      size: 'M',
      color: '#FFFFFF',
      x: 50,
      y: 50,
    };
    setTextOverlays(prev => [...prev, newOverlay]);
    setActiveOverlayId(newOverlay.id);
    setTextToolActive(true);
    announce('Text overlay tool activated. Type your text and drag to position.');
  }, [textToolActive]);

  const handleTextMove = useCallback((id, x, y) => {
    setTextOverlays(prev => prev.map(o => o.id === id ? { ...o, x, y } : o));
    logEvent(EventTypes.MOVE_TEXT_OVERLAY, Actors.HELPER, { overlayId: id, x, y });
  }, [logEvent]);

  const handleTextChange = useCallback((field, value) => {
    if (!activeOverlayId) return;
    setTextOverlays(prev => prev.map(o =>
      o.id === activeOverlayId ? { ...o, [field]: value } : o
    ));
    logEvent(EventTypes.EDIT_TEXT_OVERLAY, Actors.HELPER, { overlayId: activeOverlayId, field, value });
  }, [activeOverlayId, logEvent]);

  const handleTextApply = useCallback(() => {
    const overlay = textOverlays.find(o => o.id === activeOverlayId);
    if (overlay) {
      logEvent(EventTypes.ADD_TEXT_OVERLAY, Actors.HELPER, {
        content: overlay.content, size: overlay.size, color: overlay.color, x: overlay.x, y: overlay.y,
      });
    }
    setActiveOverlayId(null);
    setTextToolActive(false);
    announce('Text overlay applied');
  }, [activeOverlayId, textOverlays, logEvent]);

  const handleTextRemove = useCallback(() => {
    logEvent(EventTypes.REMOVE_TEXT_OVERLAY, Actors.HELPER, { overlayId: activeOverlayId });
    setTextOverlays(prev => prev.filter(o => o.id !== activeOverlayId));
    setActiveOverlayId(null);
    setTextToolActive(false);
    announce('Text overlay removed');
  }, [activeOverlayId, logEvent]);

  const activeOverlay = textOverlays.find(o => o.id === activeOverlayId) || null;

  return {
    textOverlays, activeOverlay, activeOverlayId, textToolActive,
    handleTextTool, handleTextMove, handleTextChange, handleTextApply, handleTextRemove,
  };
}
