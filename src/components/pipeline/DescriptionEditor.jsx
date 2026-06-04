import { useState, useRef, useEffect } from 'react';

export default function DescriptionEditor({ segment, onSave, onCancel }) {
  const [level1, setLevel1] = useState(segment.descriptions?.level_1 || '');
  const [level2, setLevel2] = useState(segment.descriptions?.level_2 || '');
  const [level3, setLevel3] = useState(segment.descriptions?.level_3 || '');
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);

  function handleSave() {
    onSave({ level_1: level1, level_2: level2, level_3: level3 });
  }

  // Focus the first field on open; restore focus to the trigger on close.
  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    dialogRef.current?.querySelector('textarea, button')?.focus();
    return () => previousFocusRef.current?.focus?.();
  }, []);

  // Escape to cancel + a simple Tab focus trap so keyboard focus stays in the dialog.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = dialogRef.current?.querySelectorAll(
        'textarea, button, input, select, [href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="desc-editor-title"
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6"
      >
        <h2 id="desc-editor-title" className="text-lg font-bold text-gray-900 mb-1">
          Edit Descriptions — {segment.label}
        </h2>
        <p className="text-xs text-gray-500 mb-4">{segment.id}</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Level 1 — What's happening
            </label>
            <textarea
              value={level1}
              onChange={(e) => setLevel1(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Level 2 — What's visible
            </label>
            <textarea
              value={level2}
              onChange={(e) => setLevel2(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Level 3 — How it looks
            </label>
            <textarea
              value={level3}
              onChange={(e) => setLevel3(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 border rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
