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
