import { useEffect, useRef, useState } from "react";
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase.js";
import { callTool, currentUid, savedName } from "./toolApi.js";

export default function GroupChat({ code, onBack }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [myName, setMyName] = useState(savedName() || "You");
  const bottomRef = useRef(null);

  // Load messages live from Firestore
  useEffect(() => {
    if (!code) return;
    const q = query(collection(db, "chats", code, "messages"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [code]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(e) {
    e?.preventDefault();
    const raw = text.trim();
    if (!raw || sending) return;
    setText("");
    setSending(true);

    try {
      const uid = await currentUid();
      const name = myName || "You";

      // 1. Save YOUR message
      await addDoc(collection(db, "chats", code, "messages"), {
        text: raw,
        uid,
        name,
        ai: false,
        type: "text",
        replyTo: replyTo ? { id: replyTo.id, text: replyTo.text?.slice(0, 100), name: replyTo.name } : null,
        createdAt: serverTimestamp(),
      });

      // 2. Should AI answer? Only if @sibiya OR replying to AI
      const isMention = raw.toLowerCase().includes("@sibiya");
      const isReplyToAI = replyTo?.ai === true;
      setReplyTo(null);

      if (!isMention && !isReplyToAI) {
        setSending(false);
        return;
      }

      // Clean @sibiya from question
      const question = raw.replace(/@sibiya/gi, "").trim() || "Hello";

      // 3. Show thinking
      const thinkingRef = await addDoc(collection(db, "chats", code, "messages"), {
        text: "Thinking...",
        uid: "sibiya-ai",
        name: "Sibiya AI",
        ai: true,
        type: "text",
        createdAt: serverTimestamp(),
      });

      // 4. Call AI
      let aiText = "";
      try {
        const data = await callTool({
          tool: "chat",
          message: question,
          prompt: question,
          messages: [{ role: "user", content: question }]
        });
        aiText = data?.reply || data?.text || data?.content?.[0]?.text || "Sorry, I didn't get an answer.";
      } catch (err) {
        aiText = "Sibiya AI couldn't respond: " + err.message;
      }

      // 5. Save AI answer as new message (we can't edit, so add new + delete thinking via new one)
      // Simple: just add AI reply, thinking will stay - we delete it by adding reply and user sees latest
      await addDoc(collection(db, "chats", code, "messages"), {
        text: aiText,
        uid: "sibiya-ai",
        name: "Sibiya AI",
        ai: true,
        type: "text",
        createdAt: serverTimestamp(),
      });

    } catch (err) {
      alert(err.message);
    }
    setSending(false);
  }

  function formatTime(ts) {
    if (!ts?.toDate) return "";
    return ts.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#efeae2", fontFamily: "system-ui" }}>
      {/* Header */}
      <div style={{ background: "#075e54", color: "white", padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "white", fontSize: 22, cursor: "pointer" }}>←</button>
        <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#25d366", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🤖</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>Group Chat: {code}</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Type @sibiya to talk to AI • Tap a message to reply</div>
        </div>
        <input value={myName} onChange={e => { setMyName(e.target.value); localStorage.setItem("sibiya_name", e.target.value); }} placeholder="Your name" style={{ width: 90, padding: "6px 8px", borderRadius: 8, border: "none" }} />
      </div>

      {/* Quick buttons */}
      <div style={{ display: "flex", gap: 8, padding: "8px 10px", overflowX: "auto", background: "#fff" }}>
        <button onClick={() => setText("@sibiya What is today's date?")} style={chip}>📅 Today's date</button>
        <button onClick={() => setText("@sibiya Write izibongo for me")} style={chip}>✨ Izibongo</button>
        <button onClick={() => setText("@sibiya Catch me up")} style={chip}>💬 Catch me up</button>
        <button onClick={() => setText("@sibiya Give me a quiz")} style={chip}>🎯 Quiz</button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
        {messages.length === 0 && (
          <div style={{ background: "#fff3cd", padding: 12, borderRadius: 10, fontSize: 14, textAlign: "center" }}>
            👋 Welcome! Type <b>@sibiya What is today's date?</b> to test the AI.
          </div>
        )}
        {messages.map(m => {
          if (m.type === "notice") return <div key={m.id} style={{ textAlign: "center", fontSize: 12, color: "#666", background: "#fff", padding: "4px 8px", borderRadius: 10, alignSelf: "center" }}>{m.text}</div>;
          const isAI = m.ai;
          const isMe = !isAI && m.name === myName;
          return (
            <div key={m.id}
              onClick={() => setReplyTo(m)}
              style={{
                maxWidth: "80%",
                alignSelf: isMe ? "flex-end" : "flex-start",
                background: isAI ? "#dcf8c6" : isMe ? "#dcf8c6" : "#fff",
                border: isAI ? "1px solid #25d366" : "none",
                padding: "8px 10px", borderRadius: 10, cursor: "pointer"
              }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: isAI ? "#075e54" : "#128c7e" }}>{m.name}</div>
              {m.replyTo && <div style={{ fontSize: 11, background: "rgba(0,0,0,0.06)", padding: "4px 6px", borderRadius: 6, margin: "4px 0" }}>↩ {m.replyTo.name}: {m.replyTo.text}</div>}
              <div style={{ fontSize: 15, whiteSpace: "pre-wrap" }}>{m.text}</div>
              <div style={{ fontSize: 10, color: "#888", textAlign: "right" }}>{formatTime(m.createdAt)}</div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply preview */}
      {replyTo && (
        <div style={{ background: "#fff", padding: "8px 10px", display: "flex", justifyContent: "space-between", borderTop: "1px solid #ddd" }}>
          <span style={{ fontSize: 13 }}>Replying to <b>{replyTo.name}</b>: {replyTo.text?.slice(0, 60)}</span>
          <button onClick={() => setReplyTo(null)} style={{ border: "none", background: "none", fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* Input */}
      <form onSubmit={sendMessage} style={{ display: "flex", gap: 8, padding: 10, background: "#fff", alignItems: "center" }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Type @sibiya, or reply to an AI message" style={{ flex: 1, padding: "12px 14px", borderRadius: 25, border: "1px solid #ddd", outline: "none" }} />
        <button type="submit" disabled={sending} style={{ width: 48, height: 48, borderRadius: "50%", background: "#25d366", color: "white", border: "none", fontSize: 20, cursor: "pointer" }}>{sending ? "…" : "➤"}</button>
      </form>
    </div>
  );
}

const chip = { padding: "7px 12px", borderRadius: 20, border: "1px solid #ddd", background: "#f0f2f5", cursor: "pointer", whiteSpace: "nowrap", fontSize: 13 };
