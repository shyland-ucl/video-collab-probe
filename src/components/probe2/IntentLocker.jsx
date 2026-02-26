import { useState, useEffect, useRef, useCallback } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';

const INTENT_CATEGORIES = [
  'Trim/Cut',
  'Adjust Color',
  'Check Framing',
  'Add Caption',
  'General Review',
];

const PRIORITY_OPTIONS = [
  { value: 'must_do', label: 'Must Do' },
  { value: 'nice_to_have', label: 'Nice to Have' },
  { value: 'just_check', label: 'Just Check' },
];

export default function IntentLocker({ isOpen, onClose, onSubmit, helperName = 'your helper' }) {
  const [text, setText] = useState('');
  const [categories, setCategories] = useState([]);
  const [priority, setPriority] = useState('must_do');
  const { logEvent } = useEventLogger();

  const overlayRef = useRef(null);
  const firstFocusRef = useRef(null);
  const lastFocusRef = useRef(null);
  const modalRef = useRef(null);

  const isValid = text.trim().length > 0 || categories.length > 0;

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setText('');
      setCategories([]);
      setPriority('must_do');
    }
  }, [isOpen]);

  // Focus trap and escape key
  useEffect(() => {
    if (!isOpen) return;

    // Focus the first element
    const timer = setTimeout(() => {
      firstFocusRef.current?.focus();
    }, 50);

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const focusable = modalRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const toggleCategory = useCallback((cat) => {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }, []);

  const handleSubmit = useCallback(() => {
    if (!isValid) return;
    const intentData = {
      text: text.trim(),
      categories,
      priority,
    };
    logEvent(EventTypes.INTENT_LOCKED, Actors.CREATOR, intentData);
    onSubmit(intentData);
  }, [text, categories, priority, isValid, logEvent, onSubmit]);

  // Click outside to close
  const handleOverlayClick = useCallback((e) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Lock intent for handover"
    >
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-2xl w-full max-w-lg mx-4"
      >
        {/* Header */}
        <div
          className="px-6 py-4 rounded-t-lg"
          style={{ backgroundColor: '#1F3864' }}
        >
          <h2 className="text-white font-bold text-lg">
            Lock Intent for {helperName}
          </h2>
          <p className="text-white/70 text-sm mt-1">
            Describe what you need {helperName} to do
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-5">
          {/* Free-form text */}
          <div>
            <label
              htmlFor="intent-text"
              className="block text-sm font-semibold text-gray-700 mb-1"
            >
              What do you need help with?
            </label>
            <textarea
              ref={firstFocusRef}
              id="intent-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g., Trim the market scene to start when she reaches the second stall"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm resize-none focus:outline-2 focus:outline-blue-500"
              rows={3}
              aria-label="Intent description"
            />
          </div>

          {/* Categories */}
          <fieldset>
            <legend className="text-sm font-semibold text-gray-700 mb-2">
              Task Categories
            </legend>
            <div className="flex flex-wrap gap-2">
              {INTENT_CATEGORIES.map((cat) => {
                const checked = categories.includes(cat);
                return (
                  <label
                    key={cat}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm cursor-pointer border-2 transition-colors ${
                      checked
                        ? 'text-white border-transparent'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                    }`}
                    style={checked ? { backgroundColor: '#2B579A', borderColor: '#2B579A' } : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCategory(cat)}
                      className="sr-only"
                      aria-label={cat}
                    />
                    {cat}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* Priority */}
          <fieldset>
            <legend className="text-sm font-semibold text-gray-700 mb-2">
              Priority
            </legend>
            <div className="flex gap-3" role="radiogroup" aria-label="Priority level">
              {PRIORITY_OPTIONS.map((opt) => {
                const checked = priority === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm cursor-pointer border-2 transition-colors ${
                      checked
                        ? 'text-white border-transparent'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                    }`}
                    style={checked ? { backgroundColor: '#2B579A', borderColor: '#2B579A' } : undefined}
                  >
                    <input
                      type="radio"
                      name="priority"
                      value={opt.value}
                      checked={checked}
                      onChange={() => setPriority(opt.value)}
                      className="sr-only"
                      aria-label={opt.label}
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
            aria-label="Cancel handover"
          >
            Cancel
          </button>
          <button
            ref={lastFocusRef}
            onClick={handleSubmit}
            disabled={!isValid}
            className="px-5 py-2 rounded text-sm font-bold text-white transition-colors disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
            style={{ backgroundColor: '#2B579A' }}
            aria-label="Lock intent and hand over"
          >
            Lock &amp; Hand Over
          </button>
        </div>
      </div>
    </div>
  );
}
