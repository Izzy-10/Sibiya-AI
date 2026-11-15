import { useState, useRef, useEffect } from "react";
import { Send, Volume2, Paperclip, X } from "lucide-react";
import { db, getToken } from "./firebase.js";
import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import MessageText, { speechText } from "./MessageText.jsx";
import Menu from "./Menu.jsx";
import { THEMES, getTheme, setTheme, applyTheme } from "./theme.js";
import "./theme.css";

const GREETING = { role: "assistant", content: "Sawubona. I'm Sibiya AI. What are we working on today?" };
const ERROR_TEXT = "Something broke on my end — try again.";
const KEEP = 40;

function uidFromToken(token) {
  try {
    const part = String(token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part)).sub || null;
  } catch { return null; }
}
function toApiMessages(messages) {
  return messages.filter(m => m && (m.role === "user" || m.role === "assistant")).filter(m => !(m.role === "assistant" && m.content === GREETING.content)).map(m => ({ role: m.role, content: String(typeof m.content === "string" ? m.content : m._display || "").slice(0, 8000) })).filter(m => m.content).slice(-KEEP);
}
function toSaved(messages) {
  return messages.map(m => ({ role: m.role, content: String(typeof m.content === "string" ? m.content : m._display || "").slice(0, 8000) })).filter(m => m.content && m.content !== ERROR_TEXT).slice(-KEEP);
}
function loadSaved(uid) {
  try {
    const list = JSON.parse(localStorage.getItem("sibiya_solo:" + uid) || "null");
    if (!Array.isArray(list) || list.length < 2) return null;
    return list.filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-KEEP);
  } catch { return null; }
}
function readCloud(data) {
  if (!data || !Array.isArray(data.messages)) return null;
  const list = data.messages.filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-KEEP);
  return list.length >= 2 ? list : null;
}
function pickVoice() {
  const voices = window.speechSynthesis?.getVoices() || [];
  return voices.find(v => ["daniel","fred","alex","arthur"].some(n => v.name.toLowerCase().includes(n))) || voices.find(v => v.lang?.startsWith("en")) || voices[0];
}
function speak(text, enabled) {
  if (!enabled || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if (v) u.voice = v;
  u.pitch = 0.85; u.rate = 0.98;
  window.speechSynthesis.speak(u);
}

export default function App() {
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [pendingFile, setPendingFile] = useState(null);
  const [uid, setUid] = useState(null);
  const [historyReady, setHistoryReady] = useState(false);
  const [theme, setThemeState] = useState(getTheme());
  const [showThemes, setShowThemes] = useState(false);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const dirtyRef = useRef(false);
  const lastJsonRef = useRef("");
  const loadingRef = useRef(false);
  loadingRef.current = loading;

  useEffect(() => { applyTheme(theme); }, [theme]);

  useEffect(() => {
    let alive = true;
    getToken().then(token => {
      if (!alive) return;
      const id = uidFromToken(token);
      if (!id) return;
      setUid(id);
      const saved = loadSaved(id);
      if (saved) setMessages(prev => (prev.length === 1 ? saved : prev));
      setHistoryReady(true);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!uid) return;
    let first = true;
    const unsub = onSnapshot(doc(db, "soloChats", uid), snap => {
      if (snap.metadata.hasPendingWrites) return;
      const remote = snap.exists() ? readCloud(snap.data()) : null;
      if (first) { first = false; if (!remote) return; }
      if (dirtyRef.current || loadingRef.current) return;
      const json = JSON.stringify(remote || []);
      if (json === lastJsonRef.current) return;
      lastJsonRef.current = json;
      setMessages(remote || [GREETING]);
    }, () => {});
    return unsub;
  }, [uid]);

  useEffect(() => {
    if (!uid || !historyReady) return;
    try { localStorage.setItem("sibiya_solo:" + uid, JSON.stringify(toSaved(messages))); } catch {}
    const list = toSaved(messages);
    const json = JSON.stringify(list);
    if (list.length < 2 || json === lastJsonRef.current) { dirtyRef.current = false; return; }
    dirtyRef.current = true;
    if (loading) return;
    const t = setTimeout(() => {
      setDoc(doc(db, "soloChats", uid), { messages: list, updatedAt: serverTimestamp() }).then(() => { lastJsonRef.current = json; dirtyRef.current = false; }).catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [messages, uid, historyReady, loading]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  function changeTheme(key) {
    setTheme(key);
    setThemeState(key);
    setShowThemes(false);
  }

  function newChat() {
    if (!window.confirm("Start a new chat? This deletes the saved conversation.")) return;
    window.speechSynthesis?.cancel();
    setMessages([GREETING]); setPendingFile(null);
    dirtyRef.current = false; lastJsonRef.current = "";
    if (uid) { try { localStorage.removeItem("sibiya_solo:" + uid); } catch {} deleteDoc(doc(db, "soloChats", uid)).catch(() => {}); }
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") { setMessages(prev => [...prev, { role: "assistant", content: "I can only read PDF files for now — try uploading a .pdf." }]); return; }
    const reader = new FileReader();
    reader.onload = () => { setPendingFile({ name: file.name, base64: reader.result.split(",")[1] }); };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function sendMessage() {
    const text = input.trim();
    if ((!text && !pendingFile) || loading) return;
    const displayText = pendingFile ? `📎 ${pendingFile.name}${text ? "\n" + text : ""}` : text;
    const apiContent = pendingFile ? `[Attached PDF: ${pendingFile.name}] ${text || "What's in this PDF?"}` : text;
    const newMessages = [...messages, { role: "user", content: apiContent, _display: displayText }];
    setMessages(newMessages); setInput(""); setPendingFile(null); setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ messages: toApiMessages(newMessages), prompt: apiContent, message: apiContent }) });
      if (!res.ok) throw new Error("API " + res.status);
      const data = await res.json();
      const reply = data.content?.find(c => c.type === "text")?.text || data.reply || data.text || "...";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
      speak(speechText(reply), voiceOn);
    } catch (e) { console.error(e); setMessages(prev => [...prev, { role: "assistant", content: ERROR_TEXT }]); }
    finally { setLoading(false); }
  }

  function handleKey(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }

  return (
    <div className="w-full h-[100dvh] flex flex-col" style={{ background: "var(--bg)", color: "var(--text)", fontFamily: "system-ui, sans-serif" }}>
      <style>{`::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}@keyframes pulse-red{0%,100%{opacity:.35}50%{opacity:1}}.dot{animation:pulse-red 1.4s infinite}.dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}`}</style>

      <div className="flex items-center justify-between px-5 py-4 border-b relative" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg" style={{ background: "var(--panel)", color: "var(--accent)", border: "1px solid var(--border)" }}>S</div>
          <div><div className="font-bold text-[15px] tracking-tight">SIBIYA AI</div><div className="text-[10px] tracking-wide" style={{ color: "var(--muted)" }}>Umoya Wesizwe SakwaZulu</div></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowThemes(v => !v)} title="Change theme" className="w-8 h-8 rounded-full border flex items-center justify-center" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
            <span className="w-4 h-4 rounded-full inline-block" style={{ background: THEMES.find(t => t.key === theme)?.dot }} />
          </button>
          <button onClick={() => { if (voiceOn) window.speechSynthesis?.cancel(); setVoiceOn(v => !v); }} className="text-[10px] uppercase tracking-widest rounded-full px-2 py-1 border" style={{ color: voiceOn ? "var(--accent)" : "var(--muted)", borderColor: "var(--border)" }}>voice {voiceOn ? "on" : "off"}</button>
          <Menu />
        </div>

        {showThemes && (
          <div className="absolute top-[70px] right-4 z-50 rounded-2xl p-3 shadow-xl w-[220px]" style={{ background: "var(--panel)", border: "1px solid var(--border)" }}>
            <div className="text-[12px] font-bold mb-2" style={{ color: "var(--muted)" }}>CHOOSE THEME</div>
            {THEMES.map(t => (
              <button key={t.key} onClick={() => changeTheme(t.key)} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left" style={{ background: theme === t.key ? "var(--bg)" : "transparent" }}>
                <span className="w-6 h-6 rounded-full shrink-0" style={{ background: t.dot }} />
                <span className="flex-1 text-[14px] font-medium">{t.label}</span>
                {theme === t.key && <span style={{ color: "var(--accent)" }}>✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} items-end gap-2`}>
            <div className="max-w-[80%] px-4 py-3 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap break-words" style={m.role === "user" ? { background: "var(--bubble-user)", color: "var(--bubble-user-text)", borderBottomRightRadius: 4 } : { background: "var(--bubble-ai)", color: "var(--text)", border: "1px solid var(--border)", borderBottomLeftRadius: 4 }}>
              <MessageText text={typeof m.content === "string" ? m.content : m._display} mine={m.role === "user"} allowFiles={m.role === "assistant"} />
            </div>
            {m.role === "assistant" && <button onClick={() => speak(speechText(m.content), true)} className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center" style={{ color: "var(--muted)" }}><Volume2 size={14} /></button>}
          </div>
        ))}
        {loading && <div className="flex justify-start"><div className="rounded-2xl px-4 py-3 flex gap-1" style={{ background: "var(--panel)", border: "1px solid var(--border)" }}><span className="dot w-1.5 h-1.5 rounded-full" style={{ background: "var(--dot)" }} /><span className="dot w-1.5 h-1.5 rounded-full" style={{ background: "var(--dot)" }} /><span className="dot w-1.5 h-1.5 rounded-full" style={{ background: "var(--dot)" }} /></div></div>}
      </div>

      <div className="px-5 py-4 border-t" style={{ borderColor: "var(--border)", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
        {pendingFile && <div className="flex items-center gap-2 mb-2 text-[12px] rounded-full px-3 py-1.5 w-fit" style={{ color: "var(--accent)", background: "var(--panel)", border: "1px solid var(--border)" }}><span>📎 {pendingFile.name}</span><button onClick={() => setPendingFile(null)}><X size={12} /></button></div>}
        <div className="flex items-end gap-2 rounded-2xl px-4 py-2" style={{ background: "var(--panel)", border: "1px solid var(--border)" }}>
          <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleFileSelect} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="w-8 h-8 shrink-0 mb-1 rounded-full flex items-center justify-center" style={{ color: "var(--muted)" }}><Paperclip size={16} /></button>
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey} placeholder="Ask Sibiya AI..." rows={1} className="flex-1 bg-transparent resize-none outline-none text-[14px] py-2 max-h-32" style={{ color: "var(--text)" }} />
          <button onClick={sendMessage} disabled={loading || (!input.trim() && !pendingFile)} className="w-8 h-8 shrink-0 mb-1 rounded-full flex items-center justify-center" style={{ background: "var(--accent)", color: "var(--accent-text)" }}><Send size={14} /></button>
        </div>
        <div className="flex items-center justify-center gap-3 mt-3 text-[10px] tracking-wide">
          <button onClick={newChat} style={{ color: "var(--muted)" }}>New chat</button><span style={{ color: "var(--muted)" }}>·</span><a href="/privacy.html" style={{ color: "var(--muted)" }}>Privacy Policy</a>
        </div>
      </div>
    </div>
  );
                                                                                                                                                                                                                                                                                                                                                                                                                       }
