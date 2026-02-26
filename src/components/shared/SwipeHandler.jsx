import { useRef, useCallback } from 'react';

const SWIPE_THRESHOLD = 50;
const DOUBLE_TAP_DELAY = 300;
const LONG_PRESS_DELAY = 500;
const LONG_PRESS_MOVE_TOLERANCE = 10;

export default function SwipeHandler({
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  onDoubleTap,
  onLongPress,
  children,
  className,
}) {
  const touchStart = useRef({ x: 0, y: 0 });
  const lastTapTime = useRef(0);
  const longPressTimer = useRef(null);
  const longPressFired = useRef(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchStart = useCallback(
    (e) => {
      const touch = e.touches[0];
      touchStart.current = { x: touch.clientX, y: touch.clientY };
      longPressFired.current = false;

      clearLongPress();
      longPressTimer.current = setTimeout(() => {
        longPressFired.current = true;
        onLongPress?.();
      }, LONG_PRESS_DELAY);
    },
    [onLongPress, clearLongPress]
  );

  const handleTouchMove = useCallback(
    (e) => {
      const touch = e.touches[0];
      const dx = touch.clientX - touchStart.current.x;
      const dy = touch.clientY - touchStart.current.y;

      if (Math.abs(dx) > LONG_PRESS_MOVE_TOLERANCE || Math.abs(dy) > LONG_PRESS_MOVE_TOLERANCE) {
        clearLongPress();
      }
    },
    [clearLongPress]
  );

  const handleTouchEnd = useCallback(
    (e) => {
      clearLongPress();

      if (longPressFired.current) {
        return;
      }

      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStart.current.x;
      const dy = touch.clientY - touchStart.current.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // Detect swipes
      if (absDx > SWIPE_THRESHOLD && absDx > absDy) {
        if (dx < 0) {
          onSwipeLeft?.();
        } else {
          onSwipeRight?.();
        }
        return;
      }

      if (absDy > SWIPE_THRESHOLD && absDy > absDx) {
        if (dy < 0) {
          onSwipeUp?.();
        } else {
          onSwipeDown?.();
        }
        return;
      }

      // Detect double tap (only when no swipe occurred)
      const now = Date.now();
      if (now - lastTapTime.current < DOUBLE_TAP_DELAY) {
        lastTapTime.current = 0;
        onDoubleTap?.();
      } else {
        lastTapTime.current = now;
      }
    },
    [onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, onDoubleTap, clearLongPress]
  );

  return (
    <div
      className={className}
      role="region"
      aria-roledescription="swipe area"
      aria-label="Swipe to navigate. Left and right for scenes, up and down for detail level."
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {children}
    </div>
  );
}
