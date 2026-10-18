import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Send, Share2, Check, Smile } from "lucide-react";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db, getToken } from "./firebase.js";

const MENTION = /@sibiya\b/i;

const REACTIONS = [
  { key: "like", emoji: "👍" },
  { key: "love", emoji: "❤️" },
  { key: "laugh", emoji: "😂" },
  { key: "wow", emoji: "😮" },
  { key: "sad", emoji: "😢" },
  { key: "pray", emoji: "🙏" },
];

function timeOf(m) {
  const d = m.createdAt?.toDate?.();
  if (!d) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Room({ user, code, name, title, onBack }) {
  const [messages, setMessages] = useState([]);
  const [meta, setMeta] = useState(null);
  const [input, setInput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pickerFor, setPickerFor] = useState(null);
  const scrollRef = useRef(null);
  const messagesRef = useRef([]);

  useEffect(() => {
    const metaRef = doc(db, "chats", code, "info", "meta");
    if (title) {
      setDoc(metaRef, { title, createdAt: serverTimestamp() }, { merge: true }).catch(() => {});
    }
    const unsubMeta = onSnapshot(
      metaRef,
      snap => setMeta(snap.exists() ? snap.data() : null),
      () => {}
    );
    const q = query(
      collection(db, "chats", code, "messages"),
      orderBy("createdAt", "asc"),
      limitToLast(100)
    );
    const unsubMsgs = onSnapshot(
      q,
      snap => {
        const list = snap.docs.map(d => ({
          id: d.id,
          ...d.data({ serverTimestamps: "estimate" }),
        }));
        messagesRef.current = list;
        setMessages(list);
        setError("");
      },
      () => setError("Couldn't load this group. Check that the Firestore rules are published.")
    );
    return () => {
      unsubMeta();
      unsubMsgs();
    };
  }, [code, title]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, aiBusy]);

  async function askAI(asker) {
    setAiBusy(true);
    try {
      const recent = messagesRef.current.slice(-20).map(m => ({ name: m.name, text: m.text }));
      const token = await getToken();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          mode: "room",
          title: meta?.title || title || "",
          asker,
          transcript: recent,
        }),
      });
      if (!res.ok) throw new Error("api " + res.status);
      const data = await res.json();
      const reply = data.content?.find(c => c.type === "text")?.text;
      if (!reply) throw new Error("empty");
      await addDoc(collection(db, "chats", code, "messages"), {
        text: reply.slice(0, 4000),
        uid: "sibiya-ai",
        name: "Sibiya AI",
        ai: true,
        createdAt: serverTimestamp(),
      });
    } catch {
      setError("Sibiya AI couldn't answer just now. Try again in a moment.");
    } finally {
      setAiBusy(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setError("");
    try {
      await addDoc(collection(db, "chats", code, "messages"), {
        text: text.slice(0, 1000),
        uid: user.uid,
        name,
        ai: false,
        createdAt: serverTimestamp(),
      });
    } catch {
      setError("Message didn't send. Check your connection.");
      setInput(text);
      return;
    }
    if (MENTION.test(text) && !aiBusy) askAI(name);
  }

  async function react(m, key) {
    setPickerFor(null);
    const already = Array.isArray(m.reactions?.[key]) && m.reactions[key].includes(user.uid);
    try {
      await updateDoc(doc(db, "chats", code, "messages", m.id), {
        ["reactions." + key]: already ? arrayRemove(user.uid) : arrayUnion(user.uid),
      });
    } catch {
      setError("Couldn't add your reaction. Try again.");
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function share() {
    const link = `${window.location.origin}/?room=${code}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Sibiya AI",
          text: "Join my group on Sibiya AI: " + link,
          url: link,
        });
        return;
      }
    } catch {
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this invite link:", link);
    }
  }

  return (
    <div
      style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}
      className="w-full h-[100dvh] flex flex-col bg-[#0B0B0C] text-[#F5F1E8]"
    >
      <style>{`
        @keyframes pulse-red { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
        .dot { animation: pulse-red 1.4s infinite ease-in-out; }
        .dot:nth-child(2) { animation-delay: 0.2s; }
        .dot:nth-child(3) { animation-delay: 0.4s; }
      `}</style>

      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1E1D1A]">
        <button
          onClick={onBack}
          aria-label="Back"
          className="w-8 h-8 shrink-0 rounded-full text-[#8A8580] hover:text-[#C9A44C] flex items-center justify-center"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[15px] truncate">{meta?.title || title || "Group chat"}</div>
          <div className="text-[10px] text-[#8A8580] tracking-wide truncate">Code: {code}</div>
        </div>
        <button
          onClick={share}
          className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest rounded-full px-3 py-1.5 border border-[#C9A44C]/50 text-[#C9A44C]"
        >
          {copied ? <Check size={13} /> : <Share2 size={13} />}
          {copied ? "Copied" : "Invite"}
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-3">
        {messages.length === 0 && !error && (
          <div className="text-center text-[13px] text-[#8A8580] pt-10 px-6">
            Say sawubona. Tap Invite to bring people in, and type @sibiya to ask the AI.
          </div>
        )}
        {messages.map(m => {
          const mine = m.uid === user.uid;
          const ai = !!m.ai;
          const counts = REACTIONS.map(r => ({
            ...r,
            users: Array.isArray(m.reactions?.[r.key]) ? m.reactions[r.key] : [],
          })).filter(r => r.users.length > 0);
          const reactBtn = (
            <button
              onClick={() => setPickerFor(p => (p === m.id ? null : m.id))}
              aria-label="Add reaction"
              className="w-6 h-6 shrink-0 mb-5 rounded-full flex items-center justify-center text-[#5C5850] hover:text-[#C9A44C] transition-colors"
            >
              <Smile size={15} />
            </button>
          );
          return (
            <div
              key={m.id}
              className={`flex ${mine ? "justify-end" : "justify-start"} items-end gap-1.5`}
            >
              {mine && reactBtn}
              <div className={`max-w-[78%] flex flex-col ${mine ? "items-end" : "items-start"}`}>
                {!mine && (
                  <div
                    className={`text-[10px] uppercase tracking-widest mb-1 ${
                      ai ? "text-[#E07A66]" : "text-[#C9A44C]"
                    }`}
                  >
                    {m.name}
                  </div>
                )}
                <div
                  className={`px-4 py-2.5 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap break-words ${
                    mine
                      ? "bg-[#C9A44C] text-[#0B0B0C] rounded-br-sm"
                      : ai
                      ? "bg-[#161514] border border-[#232019] border-l-4 border-l-[#A13D2D] rounded-bl-sm"
                      : "bg-[#161514] border border-[#232019] rounded-bl-sm"
                  }`}
                >
                  {m.text}
                </div>

                {pickerFor === m.id && (
                  <div className="flex gap-1 mt-1.5 bg-[#161514] border border-[#232019] rounded-full px-2 py-1 w-fit">
                    {REACTIONS.map(r => (
                      <button
                        key={r.key}
                        onClick={() => react(m, r.key)}
                        className="text-[18px] leading-none px-1 py-0.5 rounded-full hover:bg-[#232019]"
                      >
                        {r.emoji}
                      </button>
                    ))}
                  </div>
                )}

                {counts.length > 0 && (
                  <div className={`flex flex-wrap gap-1 mt-1 ${mine ? "justify-end" : ""}`}>
                    {counts.map(r => {
                      const iReacted = r.users.includes(user.uid);
                      return (
                        <button
                          key={r.key}
                          onClick={() => react(m, r.key)}
                          className={`flex items-center gap-1 text-[12px] px-2 py-0.5 rounded-full border transition-colors ${
                            iReacted
                              ? "border-[#C9A44C] bg-[#C9A44C]/15 text-[#F5F1E8]"
                              : "border-[#232019] bg-[#161514] text-[#D8D2C4]"
                          }`}
                        >
                          <span>{r.emoji}</span>
                          <span>{r.users.length}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className={`text-[10px] text-[#5C5850] mt-1 ${mine ? "text-right" : ""}`}>
                  {timeOf(m)}
                </div>
              </div>
              {!mine && reactBtn}
            </div>
          );
        })}
        {aiBusy && (
          <div className="flex justify-start">
            <div className="bg-[#161514] border border-[#232019] rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
              <span className="dot w-1.5 h-1.5 rounded-full bg-[#A13D2D]" />
              <span className="dot w-1.5 h-1.5 rounded-full bg-[#A13D2D]" />
              <span className="dot w-1.5 h-1.5 rounded-full bg-[#A13D2D]" />
            </div>
          </div>
        )}
      </div>

      <div
        className="px-4 pt-3 border-t border-[#1E1D1A]"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        {error && <div className="text-[12px] text-[#E07A66] mb-2">{error}</div>}
        <div className="flex items-end gap-2 bg-[#161514] border border-[#232019] rounded-2xl px-4 py-2 focus-within:border-[#C9A44C]/60 transition-colors">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Message the group..."
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-[14px] py-2 placeholder:text-[#5C5850] max-h-32"
          />
          <button
            onClick={send}
            disabled={!input.trim()}
            aria-label="Send"
            className="w-8 h-8 shrink-0 mb-1 rounded-full bg-[#C9A44C] disabled:bg-[#2A2823] disabled:text-[#5C5850] text-[#0B0B0C] flex items-center justify-center transition-colors"
          >
            <Send size={14} />
          </button>
        </div>
        <div className="text-center text-[10px] text-[#5C5850] mt-2 tracking-wide">
          Type @sibiya to ask the AI
        </div>
      </div>
    </div>
  );
}
