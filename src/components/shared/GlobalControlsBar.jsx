function formatTotalDuration(seconds) {
  const s = Math.round(seconds || 0);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

export default function GlobalControlsBar({
  sceneCount = 0,
  videoCount = 0,
  totalDuration = 0,
}) {
  if (sceneCount === 0) return null;

  return (
    <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3">
      <p
        className="text-xs text-gray-500"
        aria-label={`${videoCount} clip${videoCount !== 1 ? 's' : ''} imported, ${sceneCount} scenes, total length ${formatTotalDuration(totalDuration)}`}
      >
        {videoCount} clip{videoCount !== 1 ? 's' : ''} imported &middot; {sceneCount} scenes &middot; {formatTotalDuration(totalDuration)} total
      </p>
    </div>
  );
}
