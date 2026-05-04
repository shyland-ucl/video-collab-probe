/**
 * Placeholder audio for the "Add sound" feature in Probe 2a / 2b / 3.
 *
 * Synthesises tones via the Web Audio API instead of shipping binary files —
 * keeps the bundle small and dodges file-format / autoplay-policy gotchas.
 * If we later swap to real audio assets, replace `previewSound` and
 * `startSoundLoop` while keeping the same `id` keys (`background_music`,
 * `sound_effect`) so existing clip metadata keeps working.
 */

let _ctx = null;
function ctx() {
  if (_ctx) return _ctx;
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  _ctx = new Ctor();
  return _ctx;
}

// Resume from suspended state — required by browser autoplay policies after
// any user gesture. Safe to call repeatedly.
function resume() {
  const c = ctx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

// MIDI note → frequency (A4 = 69 = 440Hz).
function noteFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Simple ADSR-shaped tone. Returns the gain node so callers can stack them.
function tone(c, freq, startAt, durationSec, peakGain = 0.18, type = 'sine') {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;

  const attack = 0.05;
  const release = 0.25;
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(peakGain, startAt + attack);
  gain.gain.setValueAtTime(peakGain, startAt + Math.max(attack, durationSec - release));
  gain.gain.linearRampToValueAtTime(0, startAt + durationSec);

  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(startAt);
  osc.stop(startAt + durationSec + 0.05);
  return { osc, gain };
}

// Background music: gentle 4-chord progression (C - Am - F - G), each chord
// arpeggiated. ~8 seconds long; can be looped seamlessly.
function scheduleMusicLoop(c, loopStart) {
  const chordDur = 2; // seconds per chord
  const chords = [
    [60, 64, 67], // C major
    [57, 60, 64], // A minor
    [53, 57, 60], // F major
    [55, 59, 62], // G major
  ];
  const nodes = [];
  chords.forEach((chord, i) => {
    const chordStart = loopStart + i * chordDur;
    // Sustained pad
    chord.forEach((midi) => {
      nodes.push(tone(c, noteFreq(midi), chordStart, chordDur, 0.05, 'sine'));
    });
    // Arpeggio on top
    chord.forEach((midi, j) => {
      const noteStart = chordStart + j * 0.4;
      nodes.push(tone(c, noteFreq(midi + 12), noteStart, 0.5, 0.08, 'triangle'));
    });
  });
  return { nodes, endsAt: loopStart + chords.length * chordDur };
}

// Sound effect: short rising chirp / "ding".
function scheduleEffect(c, startAt) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(660, startAt);
  osc.frequency.exponentialRampToValueAtTime(1320, startAt + 0.2);
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(0.25, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.4);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(startAt);
  osc.stop(startAt + 0.45);
  return { nodes: [{ osc, gain }], endsAt: startAt + 0.45 };
}

/**
 * Preview a sound for ~1.5s (music) or its full duration (effect).
 * One-shot — auto-stops, no handle to track.
 */
export function previewSound(soundId) {
  const c = ctx();
  if (!c) return;
  resume();
  const start = c.currentTime + 0.02;
  if (soundId === 'background_music') {
    // Just play the first chord + arpeggio so the preview is short.
    const chord = [60, 64, 67];
    chord.forEach((midi) => tone(c, noteFreq(midi), start, 1.6, 0.05, 'sine'));
    chord.forEach((midi, j) => tone(c, noteFreq(midi + 12), start + j * 0.4, 0.5, 0.08, 'triangle'));
  } else if (soundId === 'sound_effect') {
    scheduleEffect(c, start);
  }
}

// Active loop handle: { soundId, sceneId, timer, lastNodes }
let _activeLoop = null;

function disconnectNodes(handle) {
  if (!handle?.nodes) return;
  handle.nodes.forEach((n) => {
    try { n.osc.stop(); } catch { /* already stopped */ }
    try { n.gain.disconnect(); } catch { /* ignore */ }
  });
}

/**
 * Start playing the configured sound on a loop until `stopSoundLoop()` is
 * called or a different (soundId, sceneId) pair is requested.
 *
 * Idempotent: calling with the same args while already playing is a no-op.
 * Calling with different args stops the current loop first.
 */
export function startSoundLoop(soundId, sceneId) {
  const c = ctx();
  if (!c) return;
  resume();

  if (_activeLoop && _activeLoop.soundId === soundId && _activeLoop.sceneId === sceneId) {
    return;
  }
  stopSoundLoop();

  if (soundId === 'background_music') {
    const handle = { soundId, sceneId, nodes: [], timer: null };
    const scheduleNext = (startAt) => {
      const { nodes, endsAt } = scheduleMusicLoop(c, startAt);
      handle.nodes.push(...nodes);
      const lookaheadMs = Math.max(50, (endsAt - c.currentTime - 0.5) * 1000);
      handle.timer = setTimeout(() => scheduleNext(endsAt), lookaheadMs);
    };
    scheduleNext(c.currentTime + 0.02);
    _activeLoop = handle;
  } else if (soundId === 'sound_effect') {
    // Effects are one-shot — no loop, just play once and clear handle when done.
    const { nodes, endsAt } = scheduleEffect(c, c.currentTime + 0.02);
    const handle = { soundId, sceneId, nodes, timer: null };
    handle.timer = setTimeout(() => {
      if (_activeLoop === handle) _activeLoop = null;
    }, Math.max(50, (endsAt - c.currentTime) * 1000));
    _activeLoop = handle;
  }
}

export function stopSoundLoop() {
  if (!_activeLoop) return;
  if (_activeLoop.timer) clearTimeout(_activeLoop.timer);
  disconnectNodes(_activeLoop);
  _activeLoop = null;
}

export function getActiveSound() {
  return _activeLoop ? { soundId: _activeLoop.soundId, sceneId: _activeLoop.sceneId } : null;
}
