import { useState, useRef, useEffect } from "react";
import { Send, Volume2, Paperclip, X } from "lucide-react";
import { db, getToken } from "./firebase.js";
import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import MessageText, { speechText } from "./MessageText.jsx";
import Menu from "./Menu.jsx";

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
  return messages
    .filter(m => m && (m.role === "user" || m.role === "assistant"))
    .filter(m => !(m.role === "assistant" && m.content === GREETING.content))
    .map(m => ({ role: m.role, content: String(typeof m.content === "string" ? m.content : m._display || "").slice(0, 8000) }))
    .filter(m => m.content)
    .slice(-KEEP);
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
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const dirtyRef = useRef(false);
  const lastJsonRef = useRef("");
  const loadingRef = useRef(false);
  loadingRef.current = loading;

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
    <div className="w-full h-[100dvh] flex flex-col bg-[#0B0B0C] text-[#F5F1E8]" style={{ fontFamily: "system-ui, sans-serif" }}>
      <style>{`::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:#2A2823;border-radius:3px}@keyframes pulse-red{0%,100%{opacity:.35}50%{opacity:1}}.dot{animation:pulse-red 1.4s infinite}.dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}`}</style>
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E1D1A]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#141311] border border-[#C9A44C]/60 flex items-center justify-center text-[#C9A44C] font-bold text-lg">S</div>
          <div><div className="font-bold text-[15px] tracking-tight">SIBIYA AI</div><div className="text-[10px] text-[#8A8580] tracking-wide">Umoya Wesizwe SakwaZulu</div></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { if (voiceOn) window.speechSynthesis?.cancel(); setVoiceOn(v => !v); }} className={`text-[10px] uppercase tracking-widest rounded-full px-2 py-1 border ${voiceOn ? "text-[#C9A44C] border-[#C9A44C]/40" : "text-[#5C5850] border-[#2A2823]"}`}>voice {voiceOn ? "on" : "off"}</button>
          <Menu />
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} items-end gap-2`}>
            <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap break-words ${m.role === "user" ? "bg-[#C9A44C] text-[#0B0B0C] rounded-br-sm" : "bg-[#161514] text-[#F5F1E8] rounded-bl-sm border border-[#232019]"}`}>
              <MessageText text={typeof m.content === "string" ? m.content : m._display} mine={m.role === "user"} allowFiles={m.role === "assistant"} />
            </div>
            {m.role === "assistant" && <button onClick={() => speak(speechText(m.content), true)} className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[#8A8580] hover:text-[#C9A44C]"><Volume2 size={14} /></button>}
          </div>
        ))}
        {loading && <div className="flex justify-start"><div className="bg-[#161514] border border-[#232019] rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1"><span className="dot w-1.5 h-1.5 rounded-full bg-[#A13D2D]" /><span className="dot w-1.5 h-1.5 rounded-full bg-[#A13D2D]" /><span className="dot w-1.5 h-1.5 rounded-full bg-[#A13D2D]" /></div></div>}
      </div>
      <div className="px-5 py-4 border-t border-[#1E1D1A]" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
        {pendingFile && <div className="flex items-center gap-2 mb-2 text-[12px] text-[#C9A44C] bg-[#161514] border border-[#232019] rounded-full px-3 py-1.5 w-fit"><span>📎 {pendingFile.name}</span><button onClick={() => setPendingFile(null)}><X size={12} /></button></div>}
        <div className="flex items-end gap-2 bg-[#161514] border border-[#232019] rounded-2xl px-4 py-2">
          <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleFileSelect} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="w-8 h-8 shrink-0 mb-1 rounded-full text-[#8A8580] hover:text-[#C9A44C] flex items-center justify-center"><Paperclip size={16} /></button>
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey} placeholder="Ask Sibiya AI..." rows={1} className="flex-1 bg-transparent resize-none outline-none text-[14px] py-2 placeholder:text-[#5C5850] max-h-32" />
          <button onClick={sendMessage} disabled={loading || (!input.trim() && !pendingFile)} className="w-8 h-8 shrink-0 mb-1 rounded-full bg-[#C9A44C] disabled:bg-[#2A2823] disabled:text-[#5C5850] text-[#0B0B0C] flex items-center justify-center"><Send size={14} /></button>
        </div>
        <div className="flex items-center justify-center gap-3 mt-3 text-[10px] tracking-wide">
          <button onClick={newChat} className="text-[#8A8580] hover:text-[#C9A44C]">New chat</button><span className="text-[#5C5850]">·</span><a href="/privacy.html" className="text-[#8A8580] hover:text-[#C9A44C]">Privacy Policy</a>
        </div>
      </div>
    </div>
  );
    }
