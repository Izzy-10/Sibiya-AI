import { useEffect, useState } from "react";
import { Share2, Check, X, Bell, BellOff } from "lucide-react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "./firebase.js";
import Logo from "./Logo.jsx";
import { getSoundOn, playChime, setSoundOn } from "./sound.js";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const GROUPS_KEY = "sibiya_groups";

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

// Groups this device has opened (kept on this device only)
function loadGroups() {
  try {
    const a = JSON.parse(localStorage.getItem(GROUPS_KEY) || "[]");
    return Array.isArray(a)
      ? a.filter(g => g && typeof g.code === "string").slice(0, 20)
      : [];
  } catch {
    return [];
  }
}

function saveGroups(list) {
  try {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(list.slice(0, 20)));
  } catch {}
}

function rememberGroup(code, title) {
  const all = loadGroups();
  const old = all.find(g => g.code === code);
  const rest = all.filter(g => g.code !== code);
  rest.unshift({ code, title: title || old?.title || "", at: Date.now() });
  saveGroups(rest);
}

function niceName(u) {
  if (!u.displayName) return u.email || "";
  return u.displayName.replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}

const inputCls =
  "w-full bg-[#0B0B0C] border border-[#232019] rounded-xl px-3 py-2.5 text-[14px] outline-none placeholder:text-[#5C5850] focus:border-[#C9A44C]/60 transition-colors";
const goldBtn =
  "w-full bg-[#C9A44C] text-[#0B0B0C] rounded-xl px-4 py-2.5 text-[13px] font-semibold disabled:bg-[#2A2823] disabled:text-[#5C5850] transition-colors";
const outlineBtn =
  "w-full border border-[#C9A44C]/50 text-[#C9A44C] rounded-xl px-4 py-2.5 text-[13px] font-semibold disabled:border-[#2A2823] disabled:text-[#5C5850] transition-colors";
const cardCls = "rounded-2xl border border-[#232019] bg-[#161514] p-4 space-y-3";
const labelCls = "text-[10px] uppercase tracking-widest text-[#C9A44C]";

// One row in "Your groups": shows the group name and how many new messages
function GroupRow({ g, user, onOpen, onForget, onTitle }) {
  const [unread, setUnread] = useState(0);
  const [title, setTitle] = useState(g.title || "");

  useEffect(() => {
    const unsubMeta = onSnapshot(
      doc(db, "chats", g.code, "info", "meta"),
      snap => {
        const t = snap.exists() ? snap.data().title : "";
        if (t) {
          setTitle(t);
          onTitle(g.code, t);
        }
      },
      () => {}
    );

    let since = 0;
    try {
      since = Number(localStorage.getItem("sibiya-lastread:" + g.code)) || 0;
    } catch {}
    if (!since) since = g.at || Date.now();

    const q = query(
      collection(db, "chats", g.code, "messages"),
      where("createdAt", ">", Timestamp.fromMillis(since)),
      orderBy("createdAt", "desc"),
      limit(10)
    );
    let first = true;
    let prev = 0;
    const unsubMsgs = onSnapshot(
      q,
      snap => {
        const n = snap.docs.filter(d => d.data().uid !== user.uid).length;
        if (!first && n > prev) playChime();
        first = false;
        prev = n;
        setUnread(n);
      },
      () => setUnread(0)
    );

    return () => {
      unsubMeta();
      unsubMsgs();
    };
  }, [g.code, user.uid]);

  return (
    <div className="flex items-center gap-1 rounded-xl border border-[#232019] bg-[#0B0B0C] pl-3 pr-1">
      <button
        onClick={() => onOpen(g)}
        className="flex-1 min-w-0 flex items-center gap-3 py-2.5 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className={`text-[14px] truncate ${unread > 0 ? "font-bold" : ""}`}>
            {title || "Group chat"}
          </div>
          <div className="text-[10px] text-[#5C5850] tracking-wide truncate">{g.code}</div>
        </div>
        {unread > 0 && (
          <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#C9A44C] text-[#0B0B0C] text-[11px] font-bold flex items-center justify-center">
            {unread >= 10 ? "9+" : unread}
          </span>
        )}
      </button>
      <button
        onClick={() => onForget(g)}
        aria-label="Remove from this list"
        className="w-8 h-8 shrink-0 rounded-full text-[#5C5850] hover:text-[#E07A66] flex items-center justify-center"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default function Lobby({ user, authError, initialCode, onEnterRoom, onSolo, onSignOut }) {
  const [name, setName] = useState(loadName);
  const [title, setTitle] = useState("");
  const [code, setCode] = useState(initialCode || "");
  const [error, setError] = useState("");
  const [shared, setShared] = useState(false);
  const [groups, setGroups] = useState(loadGroups);
  const [soundEnabled, setSoundEnabled] = useState(getSoundOn);
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
    const newCode = makeCode();
    const t = title.trim() || "Sibiya group";
    rememberGroup(newCode, t);
    onEnterRoom(newCode, n, t);
  }

  function join() {
    const n = requireName();
    if (!n) return;
    const c = cleanCode(code);
    if (c.length < 6) {
      setError("That code looks too short.");
      return;
    }
    rememberGroup(c, "");
    onEnterRoom(c, n, "");
  }

  function openGroup(g) {
    const n = requireName();
    if (!n) return;
    rememberGroup(g.code, g.title);
    onEnterRoom(g.code, n, "");
  }

  function forgetGroup(g) {
    if (!window.confirm("Remove this group from your list? You can join again with the code.")) return;
    const next = groups.filter(x => x.code !== g.code);
    saveGroups(next);
    setGroups(next);
  }

  function updateTitle(groupCode, t) {
    setGroups(list => {
      if (!list.some(g => g.code === groupCode && g.title !== t)) return list;
      const next = list.map(g => (g.code === groupCode ? { ...g, title: t } : g));
      saveGroups(next);
      return next;
    });
  }

  function toggleSound() {
    const next = !soundEnabled;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) playChime();
  }

  async function shareApp() {
    const url = "https://sibiya-ai.vercel.app";
    const text =
      "Sawubona! Try Sibiya AI, an AI assistant made in South Africa. It speaks isiZulu and English, and has group chats, voice notes and calls.";
    try {
      if (navigator.share) {
        await navigator.share({ title: "Sibiya AI", text, url });
        return;
      }
    } catch {
      return;
    }
    try {
      await navigator.clipboard.writeText(text + " " + url);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      window.prompt("Copy this to share:", text + " " + url);
    }
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
            <span className="truncate text-[#D8D2C4]">Signed in as {niceName(user)}</span>
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

        {user && groups.length > 0 && (
          <div className={cardCls}>
            <div className="flex items-center justify-between">
              <div className={labelCls}>Your groups</div>
              <button
                onClick={toggleSound}
                aria-label={soundEnabled ? "Turn message sound off" : "Turn message sound on"}
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[#8A8580] hover:text-[#C9A44C]"
              >
                {soundEnabled ? <Bell size={13} /> : <BellOff size={13} />}
                Sound {soundEnabled ? "on" : "off"}
              </button>
            </div>
            <div className="space-y-2">
              {groups.slice(0, 15).map(g => (
                <GroupRow
                  key={g.code}
                  g={g}
                  user={user}
                  onOpen={openGroup}
                  onForget={forgetGroup}
                  onTitle={updateTitle}
                />
              ))}
            </div>
            <div className="text-[11px] text-[#5C5850]">
              A gold number means new messages since you last opened that group on this device.
            </div>
          </div>
        )}

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

        <div className="pt-8 border-t border-[#232019]">
          <div className="font-bold text-[18px] tracking-[0.15em]" style={{ fontFamily: "Georgia, serif" }}>
            SIBIYA <span className="text-[#C9A44C]">AI</span>
          </div>
          <p className="text-[13px] text-[#8A8580] mt-2">
            Made in South Africa, rooted in Zulu culture. Chat on your own or bring friends into a group.
          </p>
          <p className="flex items-center gap-2 text-[12px] text-[#D8D2C4] mt-3">
            <span className="w-2 h-2 rounded-full bg-[#A13D2D]" />
            Available for projects &amp; collaborations
          </p>

          <div className="flex flex-wrap gap-3 mt-4">
            <a
              href="/about.html"
              className="inline-block bg-[#C9A44C] text-[#0B0B0C] rounded-xl px-5 py-2.5 text-[13px] font-semibold"
            >
              About Sibiya AI →
            </a>
            <button
              onClick={shareApp}
              className="inline-flex items-center gap-2 border border-[#C9A44C]/60 text-[#C9A44C] rounded-xl px-5 py-2.5 text-[13px] font-semibold"
            >
              {shared ? <Check size={15} /> : <Share2 size={15} />}
              {shared ? "Link copied" : "Share Sibiya AI"}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-6 mt-8">
            <div className="space-y-2.5">
              <div className="text-[10px] uppercase tracking-widest text-[#C9A44C]">Pages</div>
              <a href="/about.html" className="block text-[13px] hover:text-[#C9A44C]">About</a>
              <a href="/support.html" className="block text-[13px] hover:text-[#C9A44C]">Support</a>
              <a href="/privacy.html" className="block text-[13px] hover:text-[#C9A44C]">Privacy</a>
            </div>
            <div className="space-y-2.5">
              <div className="text-[10px] uppercase tracking-widest text-[#C9A44C]">Connect</div>
              <a
                href="https://www.tiktok.com/@sizwesibiya7"
                target="_blank"
                rel="noopener"
                className="block text-[13px] hover:text-[#C9A44C]"
              >
                Follow me on TikTok
              </a>
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-[#1E1D1A] text-[11px] text-[#5C5850] space-y-1">
            <div>© 2026 Sibiya AI. All rights reserved.</div>
            <div>Built by Sizwe Sicelimpilo Sibiya · Durban, South Africa</div>
          </div>
        </div>
      </div>
    </div>
  );
}
