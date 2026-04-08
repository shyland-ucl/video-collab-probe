import { useState } from 'react';
import useSpeechRecognition from '../../hooks/useSpeechRecognition.js';
import { announce } from '../../utils/announcer.js';

const TASK_CATEGORIES = ['Trim', 'Colour', 'Framing', 'Audio', 'Caption', 'General Review'];
const PRIORITIES = ['Must Do', 'Nice to Have', 'Just Check'];

export default function TaskRouterPanel({
  onSubmit,
  submitLabel = 'Send',
  accentColor = '#5CB85C',
  idPrefix = 'task',
}) {
  const [taskText, setTaskText] = useState('');
  const [category, setCategory] = useState('General Review');
  const [priority, setPriority] = useState('Must Do');

  const { isListening, toggleListening } = useSpeechRecognition({
    onResult: (transcript) => setTaskText(transcript),
    announcement: 'Listening for your instruction.',
  });

  const handleSubmit = () => {
    if (!taskText.trim()) {
      announce('Please describe the task.');
      return;
    }
    onSubmit({ instruction: taskText, category, priority });
    setTaskText('');
  };

  return (
    <div className="mt-2 p-3 bg-green-50 rounded-lg border border-green-200 space-y-3">
      <div className="flex gap-2">
        <button
          onClick={toggleListening}
          aria-label={isListening ? 'Stop listening' : 'Voice input'}
          className={`flex items-center justify-center rounded ${
            isListening ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600'
          }`}
          style={{ minHeight: '44px', minWidth: '44px' }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
            <rect x="7" y="1" width="4" height="10" rx="2" />
            <path d="M4 8a5 5 0 0 0 10 0" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <line x1="9" y1="14" x2="9" y2="17" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <input
          type="text"
          value={taskText}
          onChange={(e) => setTaskText(e.target.value)}
          placeholder="Describe the task..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-2 focus:outline-blue-500"
          style={{ minHeight: '44px' }}
          aria-label="Task instruction"
        />
      </div>
      <div>
        <span className="text-xs font-medium text-gray-600 block mb-1" id={`${idPrefix}-cat`}>Category</span>
        <div className="flex flex-wrap gap-1" role="group" aria-labelledby={`${idPrefix}-cat`}>
          {TASK_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              aria-pressed={category === cat}
              className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                category === cat ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              style={{ minHeight: '36px' }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="text-xs font-medium text-gray-600 block mb-1" id={`${idPrefix}-pri`}>Priority</span>
        <div className="flex gap-1" role="group" aria-labelledby={`${idPrefix}-pri`}>
          {PRIORITIES.map((p) => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              aria-pressed={priority === p}
              className={`flex-1 px-2 py-1.5 text-xs rounded transition-colors ${
                priority === p ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              style={{ minHeight: '36px' }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <button
        onClick={handleSubmit}
        disabled={!taskText.trim()}
        className="w-full py-3 text-sm font-bold rounded text-white transition-colors disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
        style={{ backgroundColor: accentColor, minHeight: '48px' }}
      >
        {submitLabel}
      </button>
    </div>
  );
}
