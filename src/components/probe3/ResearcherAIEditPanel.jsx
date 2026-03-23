import { useState, useCallback } from 'react';

export default function ResearcherAIEditPanel({ segment, pendingRequest, onSendResponse, onApplyEdit }) {
  const [customResponse, setCustomResponse] = useState('');

  const sendResponse = useCallback((responseText, responseType = 'success') => {
    if (!responseText) return;
    // Artificial delay 2-3 seconds (same as VQA WoZ)
    const delay = 2000 + Math.random() * 1000;
    setTimeout(() => {
      onSendResponse?.(responseText, responseType);
    }, delay);
  }, [onSendResponse]);

  const handlePreparedClick = useCallback((response, type = 'success') => {
    sendResponse(response, type);
  }, [sendResponse]);

  const handleCustomSend = useCallback(() => {
    const text = customResponse.trim();
    if (!text) return;
    sendResponse(text);
    setCustomResponse('');
  }, [customResponse, sendResponse]);

  const preparedEdits = segment?.ai_edits_prepared || {};
  const preparedEntries = Object.entries(preparedEdits);

  return (
    <div
      className="border-2 rounded-lg p-4 shadow-sm"
      style={{ borderColor: '#F0AD4E', backgroundColor: '#FFFBF0' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: '#9B59B6' }}
          aria-hidden="true"
        />
        <h3 className="font-bold text-sm" style={{ color: '#1F3864' }}>
          AI Edit Requests (WoZ)
        </h3>
      </div>

      {/* Pending request */}
      {pendingRequest ? (
        <div className="mb-4 p-3 bg-white border border-purple-300 rounded">
          <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1">
            Pending Request
          </p>
          <p className="text-sm font-medium text-gray-800">{pendingRequest.text}</p>
          {pendingRequest.segment && (
            <p className="text-xs text-gray-500 mt-1">
              Segment: {pendingRequest.segment} | Time: {pendingRequest.videoTime?.toFixed(1)}s
            </p>
          )}
        </div>
      ) : (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded">
          <p className="text-sm text-gray-400 italic">No pending request</p>
        </div>
      )}

      {/* Prepared responses */}
      {preparedEntries.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Prepared Responses
          </p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {preparedEntries.map(([editType, data]) => (
              <div key={editType} className="flex flex-col gap-1">
                <button
                  onClick={() => handlePreparedClick(data.response, 'success')}
                  className="w-full text-left px-3 py-2 rounded border border-gray-200 bg-white text-sm hover:bg-green-50 hover:border-green-300 transition-colors focus:outline-2 focus:outline-offset-1 focus:outline-green-500"
                  title={data.response}
                >
                  <span className="font-medium text-green-700 text-xs">OK: {editType}</span>
                  <span className="text-gray-500 text-xs block">{data.response}</span>
                </button>
                {data.partial && (
                  <button
                    onClick={() => handlePreparedClick(data.partial, 'partial')}
                    className="w-full text-left px-3 py-2 rounded border border-gray-200 bg-white text-sm hover:bg-amber-50 hover:border-amber-300 transition-colors focus:outline-2 focus:outline-offset-1 focus:outline-amber-500"
                    title={data.partial}
                  >
                    <span className="font-medium text-amber-700 text-xs">Partial: {editType}</span>
                    <span className="text-gray-500 text-xs block">{data.partial}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom response */}
      <div className="mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Custom Response
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={customResponse}
            onChange={(e) => setCustomResponse(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCustomSend(); }}
            placeholder="Type a custom response..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-2 focus:outline-purple-500"
            aria-label="Custom AI edit response"
          />
          <button
            onClick={handleCustomSend}
            disabled={!customResponse.trim()}
            className="px-4 py-2 rounded text-white text-sm font-medium transition-colors disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-purple-500"
            style={{ backgroundColor: '#9B59B6' }}
            aria-label="Send custom response"
          >
            Send
          </button>
        </div>
      </div>

      {/* Edit state actions */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Edit State Actions
        </p>
        <div className="flex flex-wrap gap-1.5">
          {['Trim Start', 'Split', 'Delete', 'Reorder', 'Add Caption'].map((action) => (
            <button
              key={action}
              onClick={() => onApplyEdit?.(action.toLowerCase().replace(' ', '_'))}
              className="px-3 py-1.5 rounded border border-gray-200 bg-white text-sm text-gray-700 hover:bg-blue-50 hover:border-blue-300 transition-colors focus:outline-2 focus:outline-offset-1 focus:outline-blue-500"
            >
              {action}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1">These modify the actual edit state on both devices.</p>
      </div>
    </div>
  );
}
