function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function taskTarget(task = {}) {
  const segment = cleanText(task.segment || task.segmentName);
  return segment ? ` for ${segment}` : '';
}

export function helperTaskStatusLabel(status) {
  switch (status) {
    case 'done':
      return 'finished';
    case 'needs_discussion':
      return 'needs discussion';
    case 'cant_do':
      return 'cannot complete';
    default:
      return 'updated';
  }
}

export function buildHelperTaskStatusUpdate(task, status, helperLabel = 'Helper') {
  const label = helperTaskStatusLabel(status);
  const target = taskTarget(task);
  const taskText = cleanText(task?.text || task?.instruction);
  const actionText = `${label} the task${target}`;
  const promptText = taskText ? `Task: ${taskText}` : 'Review the helper task status.';

  return {
    id: Date.now(),
    actionText,
    shortText: `${helperLabel} ${actionText}`,
    promptText,
    overviewText: '',
    announcement: `${helperLabel} ${actionText}. ${promptText}`,
    taskId: task?.id || null,
    taskStatus: status,
  };
}
