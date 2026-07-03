mimport { useState, useRef, useEffect } from "react";
import { Send, Volume2, Paperclip, X } from "lucide-react";

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
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Sawubona. I'm Sibiya AI. What are we working on today?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [pendingFile, setPendingFile] = useState(null);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => {};
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setMessages(prev => [...prev, { role: "assistant", content: "I can only read PDF files for now — try uploading a .pdf." }]);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      setPendingFile({ name: file.name, base64 });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function sendMessage() {
    const text = input.trim();
    if ((!text && !pendingFile) || loading) return;

    const userContent = pendingFile
      ? [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pendingFile.base64 } },
          { type: "text", text: text || `What's in ${pendingFile.name}?` },
        ]
      : text;

    const displayText = pendingFile ? `📎 ${pendingFile.name}${text ? "\n" + text : ""}` : text;

    const newMessages = [...messages, { role: "user", content: userContent, _display: displayText }];
    setMessages(newMessages);
    setInput("");
    setPendingFile(null);
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json();
      const reply = data.content?.find(c => c.type === "text")?.text || "...";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
      speak(reply, voiceOn);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: "Something broke on my end — try again." }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
}
return (
    <div
      style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}
      className="w-full h-screen flex flex-col bg-[#0B0B0C] text-[#F5F1E8]"
    >
      <style>{`
        .sg { font-family: 'Trebuchet MS', 'Arial Narrow', sans-serif; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #2A2823; border-radius: 3px; }
        @keyframes pulse-gold { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
        .dot { animation: pulse-gold 1.4s infinite ease-in-out; }
        .dot:nth-child(2) { animation-delay: 0.2s; }
        .dot:nth-child(3) { animation-delay: 0.4s; }
      `}</style>

      <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E1D1A]">
        <div className="flex items-center gap-3">
          <svg width="36" height="36" viewBox="0 0 176 176" className="shrink-0">
            <defs>
              <linearGradient id="sgGold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#E8C97A" />
                <stop offset="55%" stopColor="#C9A44C" />
                <stop offset="100%" stopColor="#9C7C33" />
              </linearGradient>
            </defs>
            <rect width="176" height="176" rx="38" fill="#141311" stroke="#C9A44C" strokeWidth="1.5" opacity="0.5" />
            <path
              transform="translate(28,28) scale(0.5)"
              d="M 176 152 L 304 152 L 304 196 L 208 196 L 208 220 L 304 220 L 304 328 L 176 328 L 176 284 L 272 284 L 272 260 L 176 260 Z"
              fill="url(#sgGold)"
            />
          </svg>
          <div>
            <div className="sg font-bold text-[15px] tracking-tight">SIBIYA AI</div>
            <div className="text-[10px] text-[#8A8580] tracking-wide">Umoya Wesizwe SakwaZulu</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (voiceOn) window.speechSynthesis?.cancel();
              setVoiceOn(v => !v);
            }}
            className={`text-[10px] uppercase tracking-widest rounded-full px-2 py-1 border transition-colors ${
              voiceOn ? "text-[#C9A44C] border-[#C9A44C]/40" : "text-[#5C5850] border-[#2A2823]"
            }`}
          >
            voice {voiceOn ? "on" : "off"}
          </button>
          <div className="text-[10px] uppercase tracking-widest text-[#C9A44C] border border-[#C9A44C]/40 rounded-full px-2 py-1">
            online
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} items-end gap-2`}>
            <div
              className={`max-w-[80%] px-4 py-3 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-[#C9A44C] text-[#0B0B0C] rounded-br-sm"
                  : "bg-[#161514] text-[#F5F1E8] rounded-bl-sm border border-[#232019]"
              }`}
            >
              {typeof m.content === "string" ? m.content : m._display}
            </div>
            {m.role === "assistant" && (
              <button
                onClick={() => speak(m.content, true)}
                className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[#8A8580] hover:text-[#C9A44C] transition-colors"
                aria-label="Play message"
              >
                <Volume2 size={14} />
              </button>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-[#161514] border border-[#232019] rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
              <span className="dot w-1.5 h-1.5 rounded-full bg-[#C9A44C]" />
              <span className="dot w-1.5 h-1.5 rounded-full bg-[#C9A44C]" />
              <span className="dot w-1.5 h-1.5 rounded-full bg-[#C9A44C]" />
            </div>
          </div>
        )}
      </div>
      <div className="px-5 py-4 border-t border-[#1E1D1A]">
        {pendingFile && (
          <div className="flex items-center gap-2 mb-2 text-[12px] text-[#C9A44C] bg-[#161514] border border-[#232019] rounded-full px-3 py-1.5 w-fit">
            <span>📎 {pendingFile.name}</span>
            <button onClick={() => setPendingFile(null)} className="text-[#8A8580] hover:text-[#F5F1E8]">
              <X size={12} />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2 bg-[#161514] border border-[#232019] rounded-2xl px-4 py-2 focus-within:border-[#C9A44C]/60 transition-colors">
          <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleFileSelect} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-8 h-8 shrink-0 mb-1 rounded-full text-[#8A8580] hover:text-[#C9A44C] flex items-center justify-center transition-colors"
            aria-label="Attach PDF"
          >
            <Paperclip size={16} />
          </button>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask Sibiya AI..."
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-[14px] py-2 placeholder:text-[#5C5850] max-h-32"
          />
          <button
            onClick={sendMessage}
            disabled={loading || (!input.trim() && !pendingFile)}
            className="w-8 h-8 shrink-0 mb-1 rounded-full bg-[#C9A44C] disabled:bg-[#2A2823] disabled:text-[#5C5850] text-[#0B0B0C] flex items-center justify-center transition-colors"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
