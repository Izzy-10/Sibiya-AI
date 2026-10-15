import { useState } from "react";
import Logo from "./Logo.jsx";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function makeCode() {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, b => ALPHABET[b % ALPHABET.length]);
  return chars.slice(0, 5).join("") + "-" + chars.slice(5).join("");
}

function cleanCode(raw) {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

function loadName() {
  try {
    return localStorage.getItem("sibiya_name") || "";
  } catch {
    return "";
  }
}

function saveName(n) {
  try {
    localStorage.setItem("sibiya_name", n);
  } catch {}
}

const inputCls =
  "w-full bg-[#0B0B0C] border border-[#232019] rounded-xl px-3 py-2.5 text-[14px] outline-none placeholder:text-[#5C5850] focus:border-[#C9A44C]/60 transition-colors";
const goldBtn =
  "w-full bg-[#C9A44C] text-[#0B0B0C] rounded-xl px-4 py-2.5 text-[13px] font-semibold disabled:bg-[#2A2823] disabled:text-[#5C5850] transition-colors";
const outlineBtn =
  "w-full border border-[#C9A44C]/50 text-[#C9A44C] rounded-xl px-4 py-2.5 text-[13px] font-semibold disabled:border-[#2A2823] disabled:text-[#5C5850] transition-colors";
const cardCls = "rounded-2xl border border-[#232019] bg-[#161514] p-4 space-y-3";
const labelCls = "text-[10px] uppercase tracking-widest text-[#C9A44C]";

export default function Lobby({ user, authError, initialCode, onEnterRoom, onSolo, onSignOut }) {
  const [name, setName] = useState(loadName);
  const [title, setTitle] = useState("");
  const [code, setCode] = useState(initialCode || "");
  const [error, setError] = useState("");
  const ready = !!user;

  function requireName() {
    const n = name.trim();
    if (!n) {
      setError("Type your name first so people know who you are.");
      return null;
    }
    saveName(n);
    setError("");
    return n;
  }

  function create() {
    const n = requireName();
    if (!n) return;
    onEnterRoom(makeCode(), n, title.trim() || "Sibiya group");
  }

  function join() {
    const n = requireName();
    if (!n) return;
    const c = cleanCode(code);
    if (c.length < 6) {
      setError("That code looks too short.");
      return;
    }
    onEnterRoom(c, n, "");
  }

  return (
    <div
      className="min-h-[100dvh] bg-[#0B0B0C] text-[#F5F1E8]"
      style={{
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="max-w-md mx-auto px-5 py-8 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <Logo size={44} />
          <div>
            <div className="font-bold text-[16px] tracking-tight">SIBIYA AI</div>
            <div className="text-[10px] text-[#8A8580] tracking-wide">Umoya Wesizwe SakwaZulu</div>
          </div>
        </div>

               {user && !user.isAnonymous && (
          <div className="flex items-center justify-between rounded-xl border border-[#232019] bg-[#161514] px-3 py-2 text-[12px]">
            <span className="truncate text-[#D8D2C4]">
              Signed in as {user.displayName || user.email}
            </span>
            <button
              onClick={onSignOut}
              className="text-[#C9A44C] uppercase tracking-widest text-[10px] ml-3 shrink-0"
            >
              Sign out
            </button>
          </div>
        )}

        {authError && (
          <div className="rounded-xl border border-[#A13D2D]/60 bg-[#A13D2D]/10 px-3 py-2 text-[12px] text-[#F5F1E8]">
            {authError}
          </div>
        )}

        {initialCode && (
          <div className="rounded-xl border-l-4 border-[#A13D2D] bg-[#161514] px-3 py-2 text-[13px]">
            You've been invited to a room. Type your name, then tap Join.
          </div>
        )}

        <div className={cardCls}>
          <div className={labelCls}>Your name</div>
          <input
            className={inputCls}
            placeholder="e.g. Sizwe"
            value={name}
            maxLength={24}
            onChange={e => setName(e.target.value)}
          />
          {error && <div className="text-[12px] text-[#E07A66]">{error}</div>}
        </div>

        <div className={cardCls}>
          <div className={labelCls}>Chat with Sibiya AI</div>
          <div className="text-[13px] text-[#D8D2C4]">Just you and the assistant, like before.</div>
          <button className={outlineBtn} onClick={onSolo}>
            Start solo chat
          </button>
        </div>

        <div className={cardCls}>
          <div className={labelCls}>Start a group</div>
          <input
            className={inputCls}
            placeholder="Group name (optional)"
            value={title}
            maxLength={40}
            onChange={e => setTitle(e.target.value)}
          />
          <button className={goldBtn} onClick={create} disabled={!ready}>
            {ready ? "Create group" : "Connecting..."}
          </button>
        </div>

        <div className={cardCls}>
          <div className={labelCls}>Join with a code</div>
          <input
            className={inputCls}
            placeholder="e.g. k7x2m-9qpwa"
            value={code}
            onChange={e => setCode(e.target.value)}
            onKeyDown={e => e.key === "Enter" && ready && join()}
          />
          <button className={goldBtn} onClick={join} disabled={!ready}>
            {ready ? "Join group" : "Connecting..."}
          </button>
        </div>

        <div className="text-center pt-2">
          <a href="/privacy.html" className="text-[10px] text-[#5C5850] hover:text-[#C9A44C] tracking-wide">
            Privacy Policy
          </a>
        </div>
      </div>
    </div>
  );
}
