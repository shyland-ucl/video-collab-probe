import { useState, useRef } from 'react';
import { getWorkspaceUrl } from '../../services/pipelineApi.js';

const LEVEL_LABELS = {
  level_1: { title: 'Level 1 — What\'s happening', color: 'border-blue-300 bg-blue-50' },
  level_2: { title: 'Level 2 — What\'s visible', color: 'border-amber-300 bg-amber-50' },
  level_3: { title: 'Level 3 — How it looks', color: 'border-purple-300 bg-purple-50' },
};

function TimeAdjuster({ label, onAdjust }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500 w-14">{label}:</span>
      {[-1, -0.5, 0.5, 1].map((delta) => (
        <button
          key={delta}
          onClick={() => onAdjust(delta)}
          className="px-3 py-1.5 text-sm border rounded-md hover:bg-gray-100 transition-colors"
          aria-label={`${label} ${delta > 0 ? '+' : ''}${delta}s`}
        >
          {delta > 0 ? '+' : ''}{delta}s
        </button>
      ))}
    </div>
  );
}

export default function SegmentCard({
  segment,
  index,
  focused,
  projectId,
  onAdjustTime,
  onMerge,
  onDelete,
  onSplit,
  onLabelChange,
  onEditDescriptions,
  isLast,
}) {
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelValue, setLabelValue] = useState(segment.label);
  const videoRef = useRef(null);

  const videoUrl = getWorkspaceUrl(`${projectId}/${segment.file}`);
  const hasDescriptions = segment.descriptions?.level_1;

  return (
    <div
      className={`bg-white border rounded-xl p-6 transition-shadow ${
        focused ? 'ring-2 ring-blue-400 shadow-lg' : 'shadow-sm'
      }`}
      tabIndex={-1}
      aria-label={`Segment ${index + 1}: ${segment.label}`}
    >
      {/* Header row: number + label + id + time */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-lg font-bold text-gray-400">#{index + 1}</span>
        {editingLabel ? (
          <input
            type="text"
            value={labelValue}
            onChange={(e) => setLabelValue(e.target.value)}
            onBlur={() => {
              onLabelChange(labelValue);
              setEditingLabel(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onLabelChange(labelValue);
                setEditingLabel(false);
              }
            }}
            className="px-3 py-1 text-lg border rounded-md"
            autoFocus
          />
        ) : (
          <button
            onClick={() => setEditingLabel(true)}
            className="text-lg font-semibold text-gray-900 hover:text-blue-600"
            title="Click to edit label"
          >
            {segment.label}
          </button>
        )}
        <span className="text-sm text-gray-400 font-mono">{segment.id}</span>
        <span className="ml-auto text-sm text-gray-600 font-mono">
          {segment.start_seconds.toFixed(1)}s &rarr; {segment.end_seconds.toFixed(1)}s
          <span className="ml-2 text-gray-400">({segment.duration_seconds.toFixed(1)}s)</span>
        </span>
      </div>

      {/* Video + controls row */}
      <div className="flex gap-6 mb-4">
        {/* Video preview */}
        <div className="flex-shrink-0 w-72">
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full rounded-lg bg-black"
            preload="metadata"
            controls
            muted
          />
        </div>

        {/* Controls */}
        <div className="flex-1 flex flex-col justify-between">
          {/* Time adjusters */}
          <div className="space-y-2">
            <TimeAdjuster label="Start" onAdjust={(d) => onAdjustTime('start_seconds', d)} />
            <TimeAdjuster label="End" onAdjust={(d) => onAdjustTime('end_seconds', d)} />
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mt-4">
            {!isLast && (
              <button
                onClick={onMerge}
                className="px-4 py-2 text-sm border rounded-md hover:bg-blue-50 text-blue-600 transition-colors"
              >
                Merge with next
              </button>
            )}
            <button
              onClick={() => {
                const mid = segment.start_seconds + segment.duration_seconds / 2;
                onSplit(parseFloat(mid.toFixed(1)));
              }}
              className="px-4 py-2 text-sm border rounded-md hover:bg-green-50 text-green-600 transition-colors"
            >
              Split at mid
            </button>
            <button
              onClick={onDelete}
              className="px-4 py-2 text-sm border rounded-md hover:bg-red-50 text-red-600 transition-colors"
            >
              Delete
            </button>
            {hasDescriptions && (
              <button
                onClick={onEditDescriptions}
                className="px-4 py-2 text-sm border rounded-md hover:bg-purple-50 text-purple-600 transition-colors"
              >
                Edit descriptions
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Descriptions — all 3 levels shown inline */}
      {hasDescriptions && (
        <div className="space-y-3 mt-4 pt-4 border-t">
          {Object.entries(LEVEL_LABELS).map(([key, { title, color }]) => (
            <div key={key} className={`p-4 rounded-lg border ${color}`}>
              <h4 className="text-sm font-semibold text-gray-700 mb-1">{title}</h4>
              <p className="text-base text-gray-800 leading-relaxed">
                {segment.descriptions[key] || <span className="italic text-gray-400">No description</span>}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
