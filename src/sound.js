// Message sound for Sibiya AI. The chime is generated in the browser, so there is no audio file to add.

const KEY = "sibiya_sound";
let ctx = null;
let lastPlay = 0;

export function getSoundOn() {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundOn(on) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
}

function getCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    ctx = null;
  }
  return ctx;
}

// Browsers only allow sound after the person has tapped the page once,
// so the first tap or key press wakes the audio up.
function unlockSound() {
  const c = getCtx();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

if (typeof window !== "undefined") {
  ["click", "touchend", "keydown"].forEach(ev =>
    window.addEventListener(ev, unlockSound, { passive: true })
  );
}

// A short two-note gold chime, plus a light buzz on phones that support it.
export function playChime() {
  if (!getSoundOn()) return;
  const now = Date.now();
  if (now - lastPlay < 1200) return; // no sound bursts when many messages land at once
  lastPlay = now;

  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});

  const t0 = c.currentTime + 0.01;
  [
    [880, 0],
    [1318.5, 0.14],
  ].forEach(([freq, delay]) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + delay);
    gain.gain.exponentialRampToValueAtTime(0.18, t0 + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.35);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0 + delay);
    osc.stop(t0 + delay + 0.4);
  });

  try {
    if (navigator.vibrate) navigator.vibrate(80);
  } catch {}
}

// Per-group "Mute notifications" (kept on this device). until: -1 = always, otherwise a time in ms.
const MUTE_KEY = "sibiya-mute:";

export function getGroupMuteUntil(code) {
  try {
    const v = JSON.parse(localStorage.getItem(MUTE_KEY + code) || "null");
    return v && typeof v.until === "number" ? v.until : 0;
  } catch {
    return 0;
  }
}

export function isGroupMuted(code) {
  const u = getGroupMuteUntil(code);
  return u === -1 || u > Date.now();
}

export function setGroupMute(code, until) {
  try {
    if (!until) localStorage.removeItem(MUTE_KEY + code);
    else localStorage.setItem(MUTE_KEY + code, JSON.stringify({ until }));
  } catch {}
}
