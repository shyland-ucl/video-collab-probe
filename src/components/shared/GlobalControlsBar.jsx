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

  // Build the summary as a single template string so it renders as one
  // text node. Previously the JSX mixed `{expr}` interpolations with
  // literal "&middot;" entities, producing several adjacent text nodes;
  // TalkBack on Android announced each fragment separately ("1", "clip",
  // "5"...) instead of the whole sentence.
  const summary =
    `${videoCount} clip${videoCount !== 1 ? 's' : ''} imported, ` +
    `${sceneCount} scenes, total length ${formatTotalDuration(totalDuration)}`;

  return (
    <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3">
      <p className="text-xs text-gray-500">{summary}</p>
    </div>
  );
}
