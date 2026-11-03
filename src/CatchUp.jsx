import { useEffect, useState } from "react";
import { Sheet, goldBtn, lineBtn } from "./ui.jsx";
import { callTool, copyToClipboard } from "./toolApi.js";

// Messages worth summarising: after the last visit, or the latest few if none are new
export function pickMessages(messages, prevRead, fallback = 30) {
  const real = (messages || []).filter(m => m && m.type !== "notice" && m.type !== "call" && typeof m.text === "string");
  const stamp = m => (m.createdAt && m.createdAt.toMillis ? m.createdAt.toMillis() : 0);
  const fresh = prevRead > 0 ? real.filter(m => stamp(m) > prevRead) : [];
  return { fresh, list: (fresh.length ? fresh : real.slice(-fallback)).slice(-80) };
}

export default function CatchUp({ room, onClose }) {
  const { fresh, list } = pickMessages(room.messages, room.prevRead);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [started, setStarted] = useState(fresh.length > 0);

  useEffect(() => {
    if (!started || !list.length) return;
    let alive = true;
    setBusy(true);
    callTool({
      tool: "catchup",
      asker: room.name,
      messages: list.map(m => ({ name: m.name, text: m.text })),
    })
      .then(d => alive && setText(d.text))
      .catch(e => alive && setError(e.message || "Could not summarise. Try again."))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [started]);

  async function copy() {
    try {
      await copyToClipboard(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  return (
    <Sheet title="Catch me up" onClose={onClose}>
      {!started ? (
        <div className="space-y-3">
          <p className="text-[14px] text-[#D8D2C4]">You're all caught up. Nothing new since you last opened this group.</p>
          {list.length > 0 && (
            <button className={goldBtn} onClick={() => setStarted(true)}>
              Summarise the last {list.length} messages
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-[11px] text-[#8A8580]">
            {fresh.length > 0 ? `${list.length} new messages since you were last here` : `The last ${list.length} messages`}
          </div>
          {busy && <div className="text-[14px] text-[#B5A284]">Reading the chat...</div>}
          {error && <div className="text-[12px] text-[#E07A66]">{error}</div>}
          {text && (
            <>
              <div className="rounded-2xl border border-[#232019] bg-[#0B0B0C] p-4 text-[14px] leading-relaxed whitespace-pre-line text-[#F5F1E8]">{text}</div>
              <button className={lineBtn} onClick={copy}>
                {copied ? "Copied" : "Copy summary"}
              </button>
            </>
          )}
          <p className="text-[11px] text-[#8A8580]">Only you see this. Nothing is posted in the group.</p>
        </div>
      )}
    </Sheet>
  );
}
