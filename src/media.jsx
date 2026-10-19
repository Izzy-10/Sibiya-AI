import { useState, useEffect, useRef } from "react";
import { Play, Pause, Download, FileText } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase.js";

export const MAX_BYTES = 900000;
export const MAX_SECONDS = 60;

const BLOCKED = /\.(exe|apk|bat|cmd|com|msi|scr|jar|vbs|ps1|sh|dll|dmg|ipa|js|mjs|html?|svg)$/i;
const PREFERRED = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export function fmtTime(s) {
  const n = Math.max(0, Math.floor(s || 0));
  return Math.floor(n / 60) + ":" + String(n % 60).padStart(2, "0");
}

export function fmtSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

async function loadMedia(code, mediaId, mime) {
  const snap = await getDoc(doc(db, "chats", code, "media", mediaId));
  if (!snap.exists()) throw new Error("gone");
  const d = snap.data();
  return new Blob([d.data.toUint8Array()], { type: mime || d.mime || "application/octet-stream" });
}

async function shrinkImage(file) {
  const bmp = await createImageBitmap(file);
  let scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  for (const q of [0.75, 0.6, 0.45]) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * scale));
    c.height = Math.max(1, Math.round(bmp.height * scale));
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", q));
    if (blob && blob.size <= MAX_BYTES) return blob;
    scale *= 0.75;
  }
  throw new Error("too-big");
}

export async function prepareFile(file) {
  if (BLOCKED.test(file.name)) throw new Error("blocked");
  const isImage = /^image\//.test(file.type) && !/svg/.test(file.type);
  if (isImage) {
    try {
      const blob = await shrinkImage(file);
      return { blob, mime: "image/jpeg", name: file.name.replace(/\.[^.]+$/, "") + ".jpg" };
    } catch (e) {
      if (file.size > MAX_BYTES) throw new Error("too-big");
    }
  }
  if (file.size > MAX_BYTES) throw new Error("too-big");
  return { blob: file, mime: file.type || "application/octet-stream", name: file.name };
}

export function useVoiceRecorder({ onDone, onError }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startedRef = useRef(0);
  const cancelRef = useRef(false);
  const streamRef = useRef(null);

  function cleanup() {
    clearInterval(timerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setRecording(false);
    setSeconds(0);
  }

  function stop() {
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
  }

  function cancel() {
    cancelRef.current = true;
    stop();
  }

  async function start() {
    if (recording) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      onError("Voice notes aren't supported on this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = PREFERRED.find(t => window.MediaRecorder.isTypeSupported(t)) || "";
      const options = mime
        ? { mimeType: mime, audioBitsPerSecond: 24000 }
        : { audioBitsPerSecond: 24000 };
      const rec = new MediaRecorder(stream, options);
      chunksRef.current = [];
      cancelRef.current = false;
      rec.ondataavailable = e => {
        if (e.data && e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = rec.mimeType || mime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const duration = (Date.now() - startedRef.current) / 1000;
        const cancelled = cancelRef.current;
        cleanup();
        if (!cancelled && blob.size > 0 && duration >= 0.6) {
          onDone({ blob, mime: type.split(";")[0], duration });
        }
      };
      recRef.current = rec;
      startedRef.current = Date.now();
      rec.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => {
        const s = Math.floor((Date.now() - startedRef.current) / 1000);
        setSeconds(s);
        if (s >= MAX_SECONDS) stop();
      }, 250);
    } catch {
      cleanup();
      onError("Couldn't use the microphone. Allow microphone access for this site and try again.");
    }
  }

  useEffect(() => {
    return () => {
      cancelRef.current = true;
      try {
        if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
      } catch {}
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      clearInterval(timerRef.current);
    };
  }, []);

  return { recording, seconds, start, stop, cancel };
}

export function VoiceBubble({ code, m, mine }) {
  const [state, setState] = useState("idle");
  const [progress, setProgress] = useState(0);
  const audioRef = useRef(null);
  const urlRef = useRef(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  async function toggle() {
    if (state === "playing") {
      audioRef.current.pause();
      setState("paused");
      return;
    }
    try {
      if (!audioRef.current) {
        setState("loading");
        const blob = await loadMedia(code, m.mediaId, m.mime);
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        const a = new Audio(url);
        a.ontimeupdate = () =>
          setProgress(Math.min(1, a.currentTime / (m.duration || a.duration || 1)));
        a.onended = () => {
          setState("idle");
          setProgress(0);
          a.currentTime = 0;
        };
        a.onerror = () => setState("error");
        audioRef.current = a;
      }
      await audioRef.current.play();
      setState("playing");
    } catch {
      setState("error");
    }
  }

  const btn = mine ? "bg-[#0B0B0C] text-[#C9A44C]" : "bg-[#C9A44C] text-[#0B0B0C]";
  const track = mine ? "bg-[#0B0B0C]/25" : "bg-[#2A2823]";
  const fill = mine ? "bg-[#0B0B0C]" : "bg-[#C9A44C]";

  return (
    <div className="flex items-center gap-3 min-w-[190px]">
      <button
        onClick={toggle}
        aria-label="Play voice note"
        className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${btn}`}
      >
        {state === "playing" ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <div className="flex-1">
        <div className={`h-1.5 rounded-full overflow-hidden ${track}`}>
          <div className={`h-full ${fill}`} style={{ width: Math.round(progress * 100) + "%" }} />
        </div>
        <div className="text-[11px] mt-1 opacity-80">
          {state === "loading"
            ? "Loading..."
            : state === "error"
            ? "Can't play this on your device"
            : fmtTime(m.duration)}
        </div>
      </div>
    </div>
  );
}

export function FileBubble({ code, m, mine }) {
  const isImage = /^image\/(jpeg|png|gif|webp)$/.test(m.mime || "");
  const [url, setUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isImage) return;
    let alive = true;
    let made = null;
    loadMedia(code, m.mediaId, m.mime)
      .then(blob => {
        if (!alive) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [code, m.mediaId, m.mime, isImage]);

  async function save() {
    setBusy(true);
    try {
      const blob = await loadMedia(code, m.mediaId, m.mime);
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = m.fileName || "file";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 5000);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (isImage) {
    return (
      <div>
        {url ? (
          <img
            src={url}
            alt={m.fileName || "photo"}
            onClick={() => window.open(url, "_blank")}
            className="rounded-xl max-w-full max-h-64"
          />
        ) : (
          <div className="text-[12px] opacity-80 py-6 px-8">
            {failed ? "Photo not available" : "Loading photo..."}
          </div>
        )}
        {url && (
          <button onClick={save} disabled={busy} className="text-[11px] underline mt-1 opacity-80">
            {busy ? "Saving..." : "Save"}
          </button>
        )}
      </div>
    );
  }

  const btn = mine ? "bg-[#0B0B0C] text-[#C9A44C]" : "bg-[#C9A44C] text-[#0B0B0C]";
  return (
    <div className="flex items-center gap-3 min-w-[200px]">
      <div className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center opacity-80">
        <FileText size={22} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold truncate">{m.fileName || "File"}</div>
        <div className="text-[11px] opacity-80">
          {failed ? "File not available" : fmtSize(m.fileSize)}
        </div>
      </div>
      <button
        onClick={save}
        disabled={busy}
        aria-label="Download file"
        className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${btn}`}
      >
        <Download size={16} />
      </button>
    </div>
  );
    }
