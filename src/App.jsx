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

function loadSaved(uid) {
  try {
    const list = JSON.parse(localStorage.getItem("sibiya_solo:" + uid) || "null");
    if (!Array.isArray(list) || list.length < 2) return null;
    return list
      .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-KEEP);
  } catch { return null; }
}

// FIXED: Convert messages to API format - strip greeting, strip _display, handle PDF
function toApiMessages(messages) {
  return messages
    .filter(m => m && (m.role === "user" || m.role === "assistant"))
    .filter(m => {
      // Do NOT send the initial greeting to the AI - it makes AI reply with greeting
      if (m.role === "assistant" && m.content === GREETING.content) return false;
      return true;
    })
    .map(m => {
      // If content is string, send as string
      if (typeof m.content === "string") return { role: m.role, content: m.content.slice(0, 8000) };
      // If content is array (PDF), convert to text for chat.js which only reads text
      if (Array.isArray(m.content)) {
        const textParts = m.content.filter(c => c.type === "text").map(c => c.text).join("\n");
        const hasPdf = m.content.some(c => c.type === "document");
        const finalText = hasPdf ? `[User attached a PDF] ${textParts}` : textParts;
        return { role: m.role, content: finalText.slice(0, 8000) };
      }
      return { role: m.role, content: String(m._display || "").slice(0, 8000) };
    })
    .filter(m => m.content)
    .slice(-KEEP);
}

function toSaved(messages) {
  return messages
    .map(m => ({
      role: m.role,
      content: String(typeof m.content === "string" ? m.content : m._display || "").slice(0, 8000),
    }))
    .filter(m => m.content && m.content !== ERROR_TEXT)
    .slice(-KEEP);
}

function saveChat(uid, messages) {
  try { localStorage.setItem("sibiya_solo:" + uid, JSON.stringify(toSaved(messages))); } catch {}
}

function readCloud(data) {
  if (!data || !Array.isArray(data.messages)) return null;
  const list = data.messages
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-KEEP);
  return list.length >= 2 ? list : null;
}

function clearSaved(uid) {
  try { localStorage.removeItem("sibiya_solo:" + uid); } catch {}
}

function pickMaleVoice() {
  const voices = window.speechSynthesis?.getVoices() || [];
  const maleNames = ["daniel", "male", "guy", "fred", "alex", "arthur", "rishi", "thomas"];
  return (
    voices.find(v => maleNames.some(n => v.name.toLowerCase().includes(n))) ||
    voices.find(v => v.lang?.startsWith("en")) ||
    voices[0]
  );
}

function speak(text, enabled) {
  if (!enabled || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  const voice = pickMaleVoice();
  if (voice) utter.voice = voice;
  utter.pitch = 0.85;
  utter.rate = 0.98;
  window.speechSynthesis.speak(utter);
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
  const nearBottomRef = useRef(true);
  const prevCountRef = useRef(null);
  const fileInputRef = useRef(null);
  const dirtyRef = useRef(false);
  const lastJsonRef = useRef("");
  const loadingRef = useRef(false);
  loadingRef.current = loading;

  useEffect(() => {
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => {};
  }, []);

  useEffect(() => {
    let alive = true;
    getToken()
      .then(token => {
        if (!alive) return;
        const id = uidFromToken(token);
        if (!id) return;
        setUid(id);
        const saved = loadSaved(id);
        if (saved) setMessages(prev => (prev.length === 1 ? saved : prev));
        setHistoryReady(true);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!uid) return;
    let first = true;
    const unsub = onSnapshot(
      doc(db, "soloChats", uid),
      snap => {
        if (snap.metadata.hasPendingWrites) return;
        const remote = snap.exists() ? readCloud(snap.data()) : null;
        if (first) {
          first = false;
          if (!remote) return;
        }
        if (dirtyRef.current || loadingRef.current) return;
        const json = JSON.stringify(remote || []);
        if (json === lastJsonRef.current) return;
        lastJsonRef.current = json;
        setMessages(remote || [GREETING]);
      },
      () => {}
    );
    return unsub;
  }, [uid]);

  useEffect(() => {
    if (!uid || !historyReady) return;
    saveChat(uid, messages);
    const list = toSaved(messages);
    const json = JSON.stringify(list);
    if (list.length < 2 || json === lastJsonRef.current) {
      dirtyRef.current = false;
      return;
    }
    dirtyRef.current = true;
    if (loading) return;
    const t = setTimeout(() => {
      setDoc(doc(db, "soloChats", uid), { messages: list, updatedAt: serverTimestamp() })
        .then(() => { lastJsonRef.current = json; dirtyRef.current = false; })
       
