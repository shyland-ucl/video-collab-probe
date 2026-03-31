import { buildAllSegments, getTotalDuration } from './buildInitialSources.js';

export function formatDuration(seconds) {
  const totalSeconds = Math.max(0, Math.round(seconds || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  if (minutes > 0 && remainingSeconds > 0) {
    return `${minutes} min ${remainingSeconds} sec`;
  }

  if (minutes > 0) {
    return `${minutes} min`;
  }

  return `${totalSeconds} sec`;
}

export function getEffectiveClipDuration(clip) {
  if (!clip) return 0;
  const start = (clip.startTime || 0) + (clip.trimStart || 0);
  const end = (clip.endTime || 0) - (clip.trimEnd || 0);
  return Math.max(0, end - start);
}

export function getTimelineDuration(editState, fallbackDuration = 0) {
  const clips = editState?.clips || [];
  if (clips.length === 0) return fallbackDuration || 0;
  return clips.reduce((sum, clip) => sum + getEffectiveClipDuration(clip), 0);
}

export function getClipLengthSeconds(clips = []) {
  if (clips.length === 0) return null;
  const firstDuration = getEffectiveClipDuration(clips[0]);
  if (!firstDuration) return null;

  const sameLength = clips.every((clip) => Math.abs(getEffectiveClipDuration(clip) - firstDuration) < 0.01);
  return sameLength ? Math.round(firstDuration) : null;
}

export function buildProjectStats({
  projectData = null,
  editState = null,
  role = null,
  mode = null,
} = {}) {
  const derivedSegments = buildAllSegments(projectData);
  const clips = editState?.clips?.length ? editState.clips : derivedSegments.map((segment) => ({
    id: segment.id,
    startTime: segment.start_time,
    endTime: segment.end_time,
    trimStart: 0,
    trimEnd: 0,
  }));
  const sources = editState?.sources?.length
    ? editState.sources
    : projectData?.videos?.length
      ? projectData.videos
      : projectData?.video
        ? [projectData.video]
        : [];
  const captions = editState?.captions || [];
  const textOverlays = editState?.textOverlays || [];
  const fallbackDuration = getTotalDuration(projectData);
  const totalDuration = getTimelineDuration(editState, fallbackDuration);

  return {
    role,
    mode,
    videoCount: sources.length,
    totalDuration,
    clipCount: clips.length,
    clipLengthSeconds: getClipLengthSeconds(clips),
    captionCount: captions.length,
    textOverlayCount: textOverlays.length,
  };
}

export function getProjectOverviewText(projectStats = {}) {
  const {
    totalDuration = 0,
    clipCount = 0,
    captionCount = 0,
    textOverlayCount = 0,
  } = projectStats;

  const parts = [
    `${clipCount} ${clipCount === 1 ? 'clip' : 'clips'}`,
    `${formatDuration(totalDuration)} total length`,
  ];

  if (captionCount > 0) {
    parts.push(`${captionCount} ${captionCount === 1 ? 'caption' : 'captions'}`);
  }

  if (textOverlayCount > 0) {
    parts.push(`${textOverlayCount} ${textOverlayCount === 1 ? 'text overlay' : 'text overlays'}`);
  }

  return `Current project overview: ${parts.join(', ')}.`;
}

export function buildSessionGuide({ condition, projectStats = {} }) {
  const {
    role = 'creator',
    videoCount = 0,
    totalDuration = 0,
    clipCount = 0,
    clipLengthSeconds = null,
  } = projectStats;
  const videoLabel = videoCount === 1 ? 'video' : 'videos';
  const clipLabel = clipCount === 1 ? 'clip' : 'clips';
  const clipLengthLabel = clipLengthSeconds
    ? `${clipCount} ${clipLengthSeconds}-second ${clipLabel}`
    : `${clipCount} ${clipLabel}`;
  const totalDurationLabel = formatDuration(totalDuration);

  if (condition === 'probe2') {
    if (role === 'helper') {
      return {
        title: 'Helper Editing Page',
        color: '#5CB85C',
        summary: `${videoCount} ${videoLabel}, ${totalDurationLabel} total, ${clipLengthLabel} in the shared project.`,
        sectionTitle: 'Guide Tour',
        steps: [
          { icon: '1', text: 'Check the task card or live collaboration card first.' },
          { icon: '2', text: 'Use the visual editor to split, move, trim, caption, or annotate clips.' },
          { icon: '3', text: 'Return the device with a short summary when you are done.' },
        ],
        dismissLabel: 'Start helping',
      };
    }

    return {
      title: 'Creator Editing Page',
      color: '#5CB85C',
      summary: `${videoCount} ${videoLabel}, ${totalDurationLabel} total, ${clipLengthLabel} ready for review and handover.`,
      sectionTitle: 'Guide Tour',
      steps: [
        { icon: '1', text: 'Use Previous and Next to move scene by scene.' },
        { icon: '2', text: 'Tap Less or More to change the description detail.' },
        { icon: '3', text: 'Use Mark to flag a scene and record a voice note.' },
        { icon: '4', text: 'Start a handover when you want the helper to take over.' },
      ],
      dismissLabel: 'Start editing',
    };
  }

  if (condition === 'probe2b') {
    if (role === 'helper') {
      return {
        title: 'Helper Collaboration Page',
        color: '#5CB85C',
        summary: `${videoCount} ${videoLabel}, ${totalDurationLabel} total, ${clipLengthLabel} in the shared project.`,
        sectionTitle: 'Guide Tour',
        steps: [
          { icon: '1', text: 'Use the activity feed to review creator tasks.' },
          { icon: '2', text: 'Use the visual editor to split, reorder, trim, caption, or annotate clips.' },
          { icon: '3', text: 'Your edits sync back to the creator automatically.' },
        ],
        dismissLabel: 'Open helper view',
      };
    }

    return {
      title: 'Creator Collaboration Page',
      color: '#5CB85C',
      summary: `${videoCount} ${videoLabel}, ${totalDurationLabel} total, ${clipLengthLabel} ready for shared editing.`,
      sectionTitle: 'Guide Tour',
      steps: [
        { icon: '1', text: 'Move through scenes with Previous and Next.' },
        { icon: '2', text: 'Use Less or More to change the description detail.' },
        { icon: '3', text: 'Use Edit Myself, Ask AI, or Ask Helper on the current scene.' },
        { icon: '4', text: 'Listen for project updates when the helper changes the video.' },
      ],
      dismissLabel: 'Open creator view',
    };
  }

  if (condition === 'probe3') {
    if (role === 'helper') {
      return {
        title: 'Helper AI Collaboration Page',
        color: '#9B59B6',
        summary: `${videoCount} ${videoLabel}, ${totalDurationLabel} total, ${clipLengthLabel} in the shared project.`,
        sectionTitle: 'Guide Tour',
        steps: [
          { icon: '1', text: 'Review creator tasks and AI observations in the activity feed.' },
          { icon: '2', text: 'Use the editor to make visual changes, including captions and text overlays.' },
          { icon: '3', text: 'Respond when the creator routes an AI observation to you.' },
        ],
        dismissLabel: 'Open helper view',
      };
    }

    return {
      title: 'Creator AI Collaboration Page',
      color: '#9B59B6',
      summary: `${videoCount} ${videoLabel}, ${totalDurationLabel} total, ${clipLengthLabel} ready for AI and helper collaboration.`,
      sectionTitle: 'Guide Tour',
      steps: [
        { icon: '1', text: 'Move scene by scene with Previous and Next.' },
        { icon: '2', text: 'Use Edit Myself, Ask AI, or Ask Helper on the current scene.' },
        { icon: '3', text: 'Watch for AI suggestions that appear while you explore.' },
        { icon: '4', text: 'Review updates when the helper changes the video.' },
      ],
      dismissLabel: 'Open creator view',
    };
  }

  return null;
}

function overlaysChanged(prevOverlays = [], nextOverlays = []) {
  if (prevOverlays.length !== nextOverlays.length) {
    return { type: nextOverlays.length > prevOverlays.length ? 'added' : 'removed' };
  }

  for (let i = 0; i < nextOverlays.length; i += 1) {
    const prev = prevOverlays[i];
    const next = nextOverlays[i];
    if (!prev || !next) continue;
    if (prev.id !== next.id) {
      return { type: 'reordered' };
    }
    if (prev.content !== next.content || prev.size !== next.size || prev.color !== next.color) {
      return { type: 'updated' };
    }
    if (prev.x !== next.x || prev.y !== next.y) {
      return { type: 'moved' };
    }
  }

  return null;
}

function trimsChanged(prevClips = [], nextClips = []) {
  if (prevClips.length !== nextClips.length) return false;
  return prevClips.some((clip, index) => {
    const nextClip = nextClips[index];
    if (!nextClip || clip.id !== nextClip.id) return false;
    return clip.trimStart !== nextClip.trimStart || clip.trimEnd !== nextClip.trimEnd;
  });
}

export function summarizeEditStateChange(prevState, nextState, actorLabel = 'Collaborator') {
  const prevClips = prevState?.clips || [];
  const nextClips = nextState?.clips || [];
  const prevCaptions = prevState?.captions || [];
  const nextCaptions = nextState?.captions || [];
  const prevSources = prevState?.sources || [];
  const nextSources = nextState?.sources || [];
  const prevTextOverlays = prevState?.textOverlays || [];
  const nextTextOverlays = nextState?.textOverlays || [];

  let actionText = 'updated the project';
  let promptText = 'Check the timeline to review the latest version.';

  if (nextSources.length > prevSources.length) {
    actionText = 'imported new footage';
    promptText = 'Check the timeline to review the new source material.';
  } else if (nextClips.length > prevClips.length) {
    actionText = 'split a clip';
    promptText = 'Check the timeline to review the new clip boundaries.';
  } else if (nextClips.length < prevClips.length) {
    actionText = 'deleted a clip';
    promptText = 'Check the timeline to confirm the updated sequence.';
  } else if (prevClips.map((clip) => clip.id).join('|') !== nextClips.map((clip) => clip.id).join('|')) {
    actionText = 'reordered the clips';
    promptText = 'Check the timeline because the clip order changed.';
  } else if (trimsChanged(prevClips, nextClips)) {
    actionText = 'trimmed a clip';
    promptText = 'Check the timeline to review the new clip length.';
  } else if (nextCaptions.length > prevCaptions.length) {
    actionText = 'added a caption';
    promptText = 'Check the video to review the new caption.';
  } else if (nextCaptions.length < prevCaptions.length) {
    actionText = 'removed a caption';
    promptText = 'Check the video to confirm the caption changes.';
  } else {
    const overlayChange = overlaysChanged(prevTextOverlays, nextTextOverlays);
    if (overlayChange?.type === 'added') {
      actionText = 'added a text overlay';
      promptText = 'Check the video to review the new text overlay.';
    } else if (overlayChange?.type === 'removed') {
      actionText = 'removed a text overlay';
      promptText = 'Check the video to confirm the text overlay changes.';
    } else if (overlayChange?.type === 'updated') {
      actionText = 'updated a text overlay';
      promptText = 'Check the video to review the updated text overlay.';
    } else if (overlayChange?.type === 'moved') {
      actionText = 'moved a text overlay';
      promptText = 'Check the video to review the new overlay position.';
    } else if (overlayChange?.type === 'reordered') {
      actionText = 'reordered the text overlays';
      promptText = 'Check the video to review the overlay order.';
    }
  }

  const overviewText = getProjectOverviewText({
    clipCount: nextClips.length,
    totalDuration: getTimelineDuration(nextState, 0),
    captionCount: nextCaptions.length,
    textOverlayCount: nextTextOverlays.length,
  });

  return {
    actionText,
    shortText: `${actorLabel} ${actionText}`,
    overviewText,
    promptText,
    announcement: `${actorLabel} ${actionText}. ${overviewText} ${promptText}`.trim(),
  };
}
