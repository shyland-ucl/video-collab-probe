import { useState, useCallback } from 'react';

export default function ResearcherVQAPanel({ segment, pendingQuestion }) {
  const [customAnswer, setCustomAnswer] = useState('');

  const sendAnswer = useCallback((answer) => {
    if (!answer) return;
    // Simulate AI processing delay (2-4 seconds)
    const delay = 2000 + Math.random() * 2000;
    setTimeout(() => {
      if (typeof window.__vqaReceiveAnswer === 'function') {
        window.__vqaReceiveAnswer(answer);
      }
    }, delay);
  }, []);

  const handlePreparedClick = useCallback((answer) => {
    sendAnswer(answer);
  }, [sendAnswer]);

  const handleCustomSend = useCallback(() => {
    const text = customAnswer.trim();
    if (!text) return;
    sendAnswer(text);
    setCustomAnswer('');
  }, [customAnswer, sendAnswer]);

  const preparedQA = segment?.vqa_prepared || {};
  const preparedEntries = Object.entries(preparedQA);

  return (
    <div
      className="border-2 rounded-lg p-4 shadow-sm"
      style={{ borderColor: '#F0AD4E', backgroundColor: '#FFFBF0' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: '#F0AD4E' }}
          aria-hidden="true"
        />
        <h3 className="font-bold text-sm" style={{ color: '#1F3864' }}>
          Researcher Panel (WoZ)
        </h3>
      </div>

      {/* Pending question */}
      {pendingQuestion ? (
        <div className="mb-4 p-3 bg-white border border-amber-300 rounded">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
            Pending Question
          </p>
          <p className="text-sm font-medium text-gray-800">{pendingQuestion}</p>
        </div>
      ) : (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded">
          <p className="text-sm text-gray-400 italic">No pending question</p>
        </div>
      )}

      {/* Prepared answers */}
      {preparedEntries.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Prepared Answers
          </p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {preparedEntries.map(([question, answer]) => (
              <button
                key={question}
                onClick={() => handlePreparedClick(answer)}
                className="w-full text-left px-3 py-2 rounded border border-gray-200 bg-white text-sm hover:bg-blue-50 hover:border-blue-300 transition-colors focus:outline-2 focus:outline-offset-1 focus:outline-blue-500"
                aria-label={`Send prepared answer: ${answer.substring(0, 50)}...`}
                title={answer}
              >
                <span className="font-medium text-gray-700 block text-xs">{question}</span>
                <span className="text-gray-500 text-xs">{answer}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Custom answer */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Custom Answer
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={customAnswer}
            onChange={(e) => setCustomAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCustomSend();
            }}
            placeholder="Type a custom answer..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-2 focus:outline-blue-500"
            aria-label="Custom answer text"
          />
          <button
            onClick={handleCustomSend}
            disabled={!customAnswer.trim()}
            className="px-4 py-2 rounded text-white text-sm font-medium transition-colors disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
            style={{ backgroundColor: '#2B579A' }}
            aria-label="Send custom answer"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
