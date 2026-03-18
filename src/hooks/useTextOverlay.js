import { useState, useCallback } from 'react';
import { useEventLogger } from '../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../utils/eventTypes.js';
import { announce } from '../utils/announcer.js';

export default function useTextOverlay() {
  const { logEvent } = useEventLogger();
  const [textOverlays, setTextOverlays] = useState([]);
  const [activeOverlayId, setActiveOverlayId] = useState(null);
  const [textToolActive, setTextToolActive] = useState(false);

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
