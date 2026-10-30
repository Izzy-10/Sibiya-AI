import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  Send,
  Share2,
  Check,
  Smile,
  Mic,
  Paperclip,
  Trash2,
  Phone,
  Users,
  Crown,
  VolumeX,
  Volume2,
  UserX,
  Bot,
  Pencil,
  X,
  Lock,
  Unlock,
  Pin,
  Shield,
  ShieldCheck,
  Bell,
  BellOff,
} from "lucide-react";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  Bytes,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db, getToken } from "./firebase.js";
import {
  FileBubble,
  MAX_BYTES,
  MAX_SECONDS,
  VoiceBubble,
  fmtTime,
  prepareFile,
  useVoiceRecorder,
} from "./Media.jsx";
import CallView from "./Call.jsx";
import { getSoundOn, playChime, setSoundOn } from "./sound.js";
import Linkify from "./Linkify.jsx";

const MENTION = /@sibiya\b/i;
const ONLINE_WINDOW_MS = 75000;

const BTN =
  "w-full flex items-center gap-2 rounded-xl border border-[#232019] bg-[#0B0B0C] px-4 py-2.5 text-[13px] text-[#F5F1E8]";

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

function isOnline(m) {
  const t = m.lastSeen?.toMillis?.() || 0;
  return m.online === true && Date.now() - t < ONLINE_WINDOW_MS;
}

export default function Room({ user, code, name, title, onBack }) {
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [meta, setMeta] = useState(null);
  const [input, setInput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pickerFor, setPickerFor] = useState(null);
  const [inCall, setInCall] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(getSoundOn);
  const [replyTo, setReplyTo] = useState(null);
  const inputRef = useRef(null);
  const [, setTick] = useState(0);
  const scrollRef = useRef(null);
  const messagesRef = useRef([]);
  const fileInputRef = useRef(null);
  const kickedRef = useRef(false);

  const hostUid = meta?.hostUid || "";
  const coHosts = Array.isArray(meta?.coHosts) ? meta.coHosts : [];
  const isHost = !!hostUid && hostUid === user.uid;
  const isCoHost = coHosts.includes(user.uid);
  const isStaff = isHost || isCoHost;
  const aiOn = meta?.aiEnabled !== false;
  const locked = meta?.locked === true;
  const pinned = meta?.pinned?.text ? meta.pinned : null;
  const me = members.find(m => m.id === user.uid);
  const iAmRemoved = !!me?.removed;
  const iAmMuted = !!me?.muted;
  const activeMembers = members.filter(m => !m.removed);
  const removedMembers = members.filter(m => m.removed);
  const onlineCount = activeMembers.filter(isOnline).length;
  const sortedMembers = [...activeMembers].sort(
    (a, b) =>
      (b.id === hostUid) - (a.id === hostUid) ||
      coHosts.includes(b.id) - coHosts.includes(a.id) ||
      isOnline(b) - isOnline(a) ||
      String(a.name || "").localeCompare(String(b.name || ""))
  );

  // Who this person is allowed to mute or remove
  function canManage(m) {
    if (m.id === user.uid || m.id === hostUid) return false;
    if (isHost) return true;
    return isCoHost && !coHosts.includes(m.id);
  }

  const recorder = useVoiceRecorder({
    onDone: v => sendMedia({ type: "voice", blob: v.blob, mime: v.mime, duration: v.duration }),
    onError: setError,
  });

  function metaDoc() {
    return doc(db, "chats", code, "info", "meta");
  }

  // Create the group info (and make the creator the host) the first time only
  useEffect(() => {
    const metaRef = metaDoc();
    if (title) {
      getDoc(metaRef)
        .then(snap => {
          if (snap.exists()) return;
          return setDoc(metaRef, {
            title,
            hostUid: user.uid,
            createdAt: serverTimestamp(),
          });
        })
        .catch(() => {});
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
    let firstSnap = true;
    const unsubMsgs = onSnapshot(
      q,
      snap => {
        if (!firstSnap) {
          const incoming = snap.docChanges().some(c => {
            if (c.type !== "added" || c.doc.metadata.hasPendingWrites) return false;
            const d = c.doc.data({ serverTimestamps: "estimate" });
            const t = d.createdAt?.toMillis?.() || 0;
            return d.uid !== user.uid && Date.now() - t < 20000;
          });
          if (incoming) playChime();
        }
        firstSnap = false;
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

  // Members list (who is in the group, who is online)
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "chats", code, "members"),
      snap => {
        setMembers(
          snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }))
        );
        setMembersLoaded(true);
      },
      () => {}
    );
    return unsub;
  }, [code]);

  // Presence heartbeat: online while this screen is open and visible
  useEffect(() => {
    const ref = doc(db, "chats", code, "members", user.uid);
    const beat = online =>
      setDoc(
        ref,
        { uid: user.uid, name, lastSeen: serverTimestamp(), online },
        { merge: true }
      ).catch(() => {});
    beat(true);
    const iv = setInterval(() => {
      if (!document.hidden) beat(true);
    }, 30000);
    const onVis = () => beat(!document.hidden);
    const onHide = () => beat(false);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
      beat(false);
    };
  }, [code, user.uid, name]);

  // Re-check who is online every 15 seconds
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 15000);
    return () => clearInterval(iv);
  }, []);

  // If the host removes me, leave the group
  useEffect(() => {
    if (iAmRemoved && !kickedRef.current) {
      kickedRef.current = true;
      window.alert("The host removed you from this group.");
      onBack();
    }
  }, [iAmRemoved]);

  // If the group is locked and I was never a member, I can't get in
  useEffect(() => {
    if (locked && membersLoaded && !me && !isHost && !kickedRef.current) {
      kickedRef.current = true;
      window.alert("This group is locked by the host. Ask the host to unlock it so you can join.");
      onBack();
    }
  }, [locked, membersLoaded, me]);

  // Remember when this group was last read on this device (used for unread badges)
  useEffect(() => {
    const mark = () => {
      try {
        localStorage.setItem("sibiya-lastread:" + code, String(Date.now()));
      } catch {}
    };
    mark();
    return mark;
  }, [code, messages.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, aiBusy]);

  async function askAI(asker) {
    setAiBusy(true);
    try {
      const recent = messagesRef.current.slice(-20).map(m => ({
        name: m.name,
        text: m.replyTo
          ? `(replying to ${m.replyTo.name}: "${m.replyTo.text}") ${m.text}`
          : m.text,
      }));
      const token = await getToken();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          mode: "room",
          code,
          title: meta?.title || title || "",
          asker,
          transcript: recent,
        }),
      });
      if (!res.ok) {
        const info = await res.json().catch(() => ({}));
        if (res.status === 403 && info.error) {
          setError(info.error);
          return;
        }
        throw new Error("api " + res.status);
      }
      const data = await res.json();
      if (data.written) return; // the server already posted the reply into the group
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
    if (iAmMuted) {
      setError("The host has muted you in this group.");
      return;
    }
    const reply = replyTo;
    setInput("");
    setError("");
    try {
      const msg = {
        text: text.slice(0, 1000),
        uid: user.uid,
        name,
        ai: false,
        createdAt: serverTimestamp(),
      };
      if (reply) {
        msg.replyTo = {
          id: reply.id,
          uid: reply.uid || "",
          name: reply.name,
          text: reply.text,
        };
      }
      await addDoc(collection(db, "chats", code, "messages"), msg);
      setReplyTo(null);
    } catch {
      setError("Message didn't send. Check your connection.");
      setInput(text);
      return;
    }
    // @sibiya, or a reply to one of the AI's own messages, calls the AI
    if ((MENTION.test(text) || reply?.uid === "sibiya-ai") && !aiBusy) {
      if (aiOn) askAI(name);
      else setError("The host turned Sibiya AI off in this group.");
    }
  }

  function startReply(m) {
    setReplyTo({
      id: m.id,
      uid: m.uid || "",
      name: m.name || "Someone",
      text: String(m.text || "").slice(0, 120),
    });
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function jumpTo(id) {
    const el = document.getElementById("msg-" + id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.transition = "background-color 0.4s";
    el.style.backgroundColor = "rgba(201,164,76,0.18)";
    setTimeout(() => {
      el.style.backgroundColor = "";
    }, 1200);
  }

  async function sendMedia(info) {
    if (iAmMuted) {
      setError("The host has muted you in this group.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const buf = new Uint8Array(await info.blob.arrayBuffer());
      if (buf.length > MAX_BYTES) {
        setError("That is too big to send. Voice notes up to 60 seconds and files up to 900 KB work.");
        return;
      }
      const mediaRef = await addDoc(collection(db, "chats", code, "media"), {
        data: Bytes.fromUint8Array(buf),
        mime: info.mime,
        uid: user.uid,
        createdAt: serverTimestamp(),
      });
      const msg = {
        text: info.type === "voice" ? "🎤 Voice note" : "📎 " + info.fileName,
        uid: user.uid,
        name,
        ai: false,
        type: info.type,
        mediaId: mediaRef.id,
        mime: info.mime,
        createdAt: serverTimestamp(),
      };
      if (info.type === "voice") {
        msg.duration = Math.round(info.duration);
      } else {
        msg.fileName = info.fileName.slice(0, 100);
        msg.fileSize = buf.length;
      }
      await addDoc(collection(db, "chats", code, "messages"), msg);
    } catch {
      setError("Couldn't send that. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  async function pickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    try {
      const f = await prepareFile(file);
      await sendMedia({ type: "file", blob: f.blob, mime: f.mime, fileName: f.name });
    } catch (err) {
      setError(
        err?.message === "blocked"
          ? "That file type can't be shared."
          : err?.message === "too-big"
          ? "That file is too big. Files up to about 900 KB work, and photos are shrunk automatically."
          : "Couldn't read that file."
      );
    }
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

  async function removeMessage(m) {
    const ownMsg = m.uid === user.uid;
    const ask = ownMsg
      ? "Delete this message for everyone?"
      : "Remove " + (m.name || "this person") + "'s message for everyone?";
    if (!window.confirm(ask)) return;
    try {
      await deleteDoc(doc(db, "chats", code, "messages", m.id));
    } catch {
      setError("Couldn't delete that message. Try again.");
      return;
    }
    if (m.mediaId) {
      deleteDoc(doc(db, "chats", code, "media", m.mediaId)).catch(() => {});
    }
  }

  // ---- Host and co-host controls ----
  async function setMemberFlag(uid, key, value) {
    setError("");
    try {
      await updateDoc(doc(db, "chats", code, "members", uid), { [key]: value });
    } catch {
      setError("Couldn't update that member. Try again.");
    }
  }

  function removeMember(m) {
    if (!window.confirm("Remove " + (m.name || "this person") + " from the group?")) return;
    setMemberFlag(m.id, "removed", true);
    getToken()
      .then(token =>
        fetch("/api/call", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ code, action: "kick", target: m.id }),
        })
      )
      .catch(() => {});
  }

  function toggleSound() {
    const next = !soundEnabled;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) playChime();
  }

  async function toggleAI() {
    setError("");
    try {
      await updateDoc(metaDoc(), { aiEnabled: !aiOn });
    } catch {
      setError("Couldn't change the AI setting. Try again.");
    }
  }

  async function toggleLock() {
    setError("");
    try {
      await updateDoc(metaDoc(), { locked: !locked });
    } catch {
      setError("Couldn't change the lock. Try again.");
    }
  }

  async function toggleCoHost(m) {
    setError("");
    const is = coHosts.includes(m.id);
    try {
      await updateDoc(metaDoc(), { coHosts: is ? arrayRemove(m.id) : arrayUnion(m.id) });
    } catch {
      setError("Couldn't change co-hosts. Try again.");
    }
  }

  async function pinText(text) {
    const t = String(text || "").trim().slice(0, 500);
    if (!t) return;
    setError("");
    try {
      await updateDoc(metaDoc(), { pinned: { text: t, by: name } });
    } catch {
      setError("Couldn't pin that. Try again.");
    }
  }

  function writePin() {
    const t = window.prompt("Pinned note for the group:", pinned?.text || "");
    if (t) {
      pinText(t);
      setShowPanel(false);
    }
  }

  async function unpin() {
    setError("");
    try {
      await updateDoc(metaDoc(), { pinned: deleteField() });
    } catch {
      setError("Couldn't unpin that. Try again.");
    }
  }

  async function endCallForAll() {
    if (!window.confirm("End the call for everyone?")) return;
    setError("");
    try {
      const token = await getToken();
      const res = await fetch("/api/call", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ code, action: "end" }),
      });
      if (!res.ok) throw new Error("api " + res.status);
      await updateDoc(metaDoc(), { callEndedAt: serverTimestamp() });
      setInCall(false);
      setShowPanel(false);
    } catch {
      setError("Couldn't end the call. Try again.");
    }
  }

  async function renameGroup() {
    const t = window.prompt("New group name:", meta?.title || title || "");
    if (!t || !t.trim()) return;
    setError("");
    try {
      await updateDoc(metaDoc(), { title: t.trim().slice(0, 40) });
    } catch {
      setError("Couldn't rename the group. Try again.");
    }
  }

  async function startCall() {
    setError("");
    if (!liveCallId) {
      try {
        await addDoc(collection(db, "chats", code, "messages"), {
          text: "📞 " + name + " started a call",
          uid: user.uid,
          name,
          ai: false,
          type: "call",
          createdAt: serverTimestamp(),
        });
      } catch {
        setError("Couldn't start the call. Check your connection.");
        return;
      }
    }
    setInCall(true);
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

  const nowMs = Date.now();
  let liveCallId = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].type === "call") {
      const t = messages[i].createdAt?.toMillis?.() || nowMs;
      const endedAt = meta?.callEndedAt?.toMillis?.() || 0;
      if (nowMs - t < 2 * 60 * 60 * 1000 && t > endedAt) liveCallId = messages[i].id;
      break;
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
          <div className="text-[10px] text-[#8A8580] tracking-wide truncate">
            Code: {code} · <span className="text-[#5FBF7A]">{onlineCount} online</span>
            {locked && <span className="text-[#C9A44C]"> · 🔒 Locked</span>}
          </div>
        </div>
        <button
          onClick={() => setShowPanel(true)}
          aria-label="Members"
          className="relative w-9 h-9 shrink-0 rounded-full border border-[#C9A44C]/50 text-[#C9A44C] flex items-center justify-center"
        >
          <Users size={16} />
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#5FBF7A] text-[#0B0B0C] text-[10px] font-bold flex items-center justify-center">
            {onlineCount}
          </span>
        </button>
        <button
          onClick={startCall}
          aria-label="Start or join a call"
          className="w-9 h-9 shrink-0 rounded-full border border-[#C9A44C]/50 text-[#C9A44C] flex items-center justify-center"
        >
          <Phone size={16} />
        </button>
        <button
          onClick={share}
          className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest rounded-full px-3 py-1.5 border border-[#C9A44C]/50 text-[#C9A44C]"
        >
          {copied ? <Check size={13} /> : <Share2 size={13} />}
          {copied ? "Copied" : "Invite"}
        </button>
      </div>

      {pinned && (
        <div className="flex items-start gap-2 px-4 py-2 border-b border-[#1E1D1A] bg-[#161514]">
          <Pin size={14} className="text-[#C9A44C] mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0 text-[13px] text-[#D8D2C4] whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
            <Linkify text={pinned.text} />
            {pinned.by && <span className="text-[10px] text-[#5C5850]"> · pinned by {pinned.by}</span>}
          </div>
          {isStaff && (
            <button
              onClick={unpin}
              aria-label="Unpin"
              className="w-6 h-6 shrink-0 rounded-full text-[#8A8580] hover:text-[#E07A66] flex items-center justify-center"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

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
              id={"msg-" + m.id}
              className={`flex ${mine ? "justify-end" : "justify-start"} items-end gap-1.5 rounded-xl`}
            >
              {mine && reactBtn}
              <div className={`max-w-[78%] min-w-0 flex flex-col ${mine ? "items-end" : "items-start"}`}>
                {!mine && (
                  <div
                    className={`text-[10px] uppercase tracking-widest mb-1 ${
                      ai ? "text-[#E07A66]" : "text-[#C9A44C]"
                    }`}
                  >
                    {m.name}
                    {m.uid === hostUid && " · Host"}
                    {coHosts.includes(m.uid) && " · Co-host"}
                  </div>
                )}
                <div
                  className={`min-w-0 max-w-full overflow-hidden px-4 py-2.5 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap break-words ${
                    mine
                      ? "bg-[#C9A44C] text-[#0B0B0C] rounded-br-sm"
                      : ai
                      ? "bg-[#161514] border border-[#232019] border-l-4 border-l-[#A13D2D] rounded-bl-sm"
                      : "bg-[#161514] border border-[#232019] rounded-bl-sm"
                  }`}
                >
                  {m.replyTo && (
                    <button
                      onClick={() => jumpTo(m.replyTo.id)}
                      className={`block w-full min-w-0 max-w-full overflow-hidden text-left mb-2 pl-2 border-l-2 text-[12px] ${
                        mine
                          ? "border-[#0B0B0C]/50 text-[#0B0B0C]/80"
                          : "border-[#C9A44C] text-[#D8D2C4]/80"
                      }`}
                    >
                      <div className="font-semibold truncate">{m.replyTo.name}</div>
                      <div className="truncate opacity-80">{m.replyTo.text}</div>
                    </button>
                  )}
                  {m.type === "voice" && m.mediaId ? (
                    <VoiceBubble code={code} m={m} mine={mine} />
                  ) : m.type === "file" && m.mediaId ? (
                    <FileBubble code={code} m={m} mine={mine} />
                  ) : m.type === "call" ? (
                    <div className="min-w-[200px]">
                      <div className="flex items-center gap-2 font-semibold">
                        <Phone size={16} />
                        <span>Group call</span>
                      </div>
                      <div className="text-[12px] opacity-80 mt-0.5">{m.name} started a call</div>
                      {liveCallId === m.id ? (
                        <button
                          onClick={() => setInCall(true)}
                          className={`mt-2 w-full rounded-xl px-4 py-2 text-[13px] font-semibold ${
                            mine ? "bg-[#0B0B0C] text-[#C9A44C]" : "bg-[#C9A44C] text-[#0B0B0C]"
                          }`}
                        >
                          Join call
                        </button>
                      ) : (
                        <div className="text-[11px] opacity-70 mt-2">Earlier call</div>
                      )}
                    </div>
                  ) : (
                    <Linkify text={m.text} mine={mine} />
                  )}
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
                  {m.type !== "call" && !iAmMuted && (
                    <button
                      onClick={() => startReply(m)}
                      className="ml-2 text-[#5C5850] hover:text-[#C9A44C] underline"
                    >
                      Reply
                    </button>
                  )}
                  {isStaff && !m.type && m.text && (
                    <button
                      onClick={() => pinText(m.text)}
                      className="ml-2 text-[#5C5850] hover:text-[#C9A44C] underline"
                    >
                      Pin
                    </button>
                  )}
                  {(mine || isStaff) && (
                    <button
                      onClick={() => removeMessage(m)}
                      className="ml-2 text-[#5C5850] hover:text-[#E07A66] underline"
                    >
                      Delete
                    </button>
                  )}
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
        {iAmMuted && (
          <div className="text-[12px] text-[#C9A44C] mb-2">
            The host has muted you. You can read the chat but not send.
          </div>
        )}

        {replyTo && (
          <div className="flex items-center gap-2 mb-2 rounded-xl border border-[#232019] bg-[#161514] px-3 py-2">
            <div className="flex-1 min-w-0 border-l-2 border-[#C9A44C] pl-2">
              <div className="text-[11px] text-[#C9A44C] truncate">Replying to {replyTo.name}</div>
              <div className="text-[12px] text-[#8A8580] truncate">{replyTo.text}</div>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              aria-label="Cancel reply"
              className="w-7 h-7 shrink-0 rounded-full text-[#8A8580] hover:text-[#E07A66] flex items-center justify-center"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {recorder.recording ? (
          <div className="flex items-center gap-3 bg-[#161514] border border-[#A13D2D]/60 rounded-2xl px-4 py-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#E07A66] animate-pulse" />
            <span className="text-[14px] tabular-nums">
              {fmtTime(recorder.seconds)} / {fmtTime(MAX_SECONDS)}
            </span>
            <span className="flex-1" />
            <button
              onClick={recorder.cancel}
              aria-label="Cancel recording"
              className="w-8 h-8 rounded-full text-[#8A8580] hover:text-[#E07A66] flex items-center justify-center"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={recorder.stop}
              aria-label="Send voice note"
              className="w-8 h-8 rounded-full bg-[#C9A44C] text-[#0B0B0C] flex items-center justify-center"
            >
              <Send size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-2 bg-[#161514] border border-[#232019] rounded-2xl px-3 py-2 focus-within:border-[#C9A44C]/60 transition-colors">
            <input ref={fileInputRef} type="file" onChange={pickFile} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={sending || iAmMuted}
              aria-label="Attach file"
              className="w-8 h-8 shrink-0 mb-1 rounded-full text-[#8A8580] hover:text-[#C9A44C] disabled:opacity-40 flex items-center justify-center transition-colors"
            >
              <Paperclip size={16} />
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={iAmMuted ? "You are muted by the host" : "Message the group..."}
              disabled={iAmMuted}
              rows={1}
              className="flex-1 bg-transparent resize-none outline-none text-[14px] py-2 placeholder:text-[#5C5850] max-h-32"
            />
            {input.trim() ? (
              <button
                onClick={send}
                aria-label="Send"
                className="w-8 h-8 shrink-0 mb-1 rounded-full bg-[#C9A44C] text-[#0B0B0C] flex items-center justify-center transition-colors"
              >
                <Send size={14} />
              </button>
            ) : (
              <button
                onClick={recorder.start}
                disabled={sending || iAmMuted}
                aria-label="Record voice note"
                className="w-8 h-8 shrink-0 mb-1 rounded-full bg-[#C9A44C] disabled:bg-[#2A2823] disabled:text-[#5C5850] text-[#0B0B0C] flex items-center justify-center transition-colors"
              >
                <Mic size={15} />
              </button>
            )}
          </div>
        )}

        {sending && <div className="text-center text-[11px] text-[#8A8580] mt-2">Sending...</div>}
        <div className="text-center text-[10px] text-[#5C5850] mt-2 tracking-wide">
          {aiOn ? "Type @sibiya, or reply to an AI message" : "Sibiya AI is off in this group"}
        </div>
      </div>

      {showPanel && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/60"
          onClick={() => setShowPanel(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md max-h-[80dvh] overflow-y-auto bg-[#161514] border border-[#232019] rounded-t-3xl p-5"
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="font-bold text-[16px]">Members</div>
              <button
                onClick={() => setShowPanel(false)}
                aria-label="Close"
                className="w-8 h-8 rounded-full text-[#8A8580] hover:text-[#C9A44C] flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>
            <div className="text-[12px] text-[#5FBF7A] mb-4">
              {onlineCount} online · {activeMembers.length} in group
            </div>

            <div className="mb-4">
              <button onClick={toggleSound} className={BTN}>
                {soundEnabled ? (
                  <Bell size={14} className="text-[#C9A44C]" />
                ) : (
                  <BellOff size={14} className="text-[#C9A44C]" />
                )}
                Message sound is {soundEnabled ? "ON" : "OFF"} · tap to turn{" "}
                {soundEnabled ? "off" : "on"}
              </button>
            </div>

            {isStaff && (
              <div className="mb-4 space-y-2">
                {isHost && (
                  <button onClick={renameGroup} className={BTN}>
                    <Pencil size={14} className="text-[#C9A44C]" />
                    Rename group
                  </button>
                )}
                {isHost && (
                  <button onClick={toggleLock} className={BTN}>
                    {locked ? (
                      <Lock size={14} className="text-[#C9A44C]" />
                    ) : (
                      <Unlock size={14} className="text-[#C9A44C]" />
                    )}
                    {locked
                      ? "Group is LOCKED · tap to unlock"
                      : "Group is OPEN · tap to lock (no new members)"}
                  </button>
                )}
                <button onClick={toggleAI} className={BTN}>
                  <Bot size={14} className="text-[#C9A44C]" />
                  Sibiya AI is {aiOn ? "ON" : "OFF"} · tap to turn {aiOn ? "off" : "on"}
                </button>
                <button onClick={writePin} className={BTN}>
                  <Pin size={14} className="text-[#C9A44C]" />
                  {pinned ? "Change pinned note" : "Pin a note for the group"}
                </button>
                {liveCallId && (
                  <button
                    onClick={endCallForAll}
                    className="w-full flex items-center gap-2 rounded-xl border border-[#A13D2D]/60 bg-[#0B0B0C] px-4 py-2.5 text-[13px] text-[#E07A66]"
                  >
                    <Phone size={14} />
                    End call for everyone
                  </button>
                )}
              </div>
            )}

            <div className="space-y-1">
              {sortedMembers.map(m => {
                const online = isOnline(m);
                const isThisHost = m.id === hostUid;
                const isThisCoHost = coHosts.includes(m.id);
                const isMe = m.id === user.uid;
                const seen = m.lastSeen?.toDate?.();
                const manage = canManage(m);
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-[#0B0B0C]"
                  >
                    <span
                      className={`w-2.5 h-2.5 shrink-0 rounded-full ${
                        online ? "bg-[#5FBF7A]" : "bg-[#3A3731]"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] truncate flex items-center gap-1.5">
                        <span className="truncate">
                          {m.name || "Someone"}
                          {isMe ? " (you)" : ""}
                        </span>
                        {isThisHost && <Crown size={13} className="text-[#C9A44C] shrink-0" />}
                        {isThisCoHost && <ShieldCheck size={13} className="text-[#C9A44C] shrink-0" />}
                        {m.muted && <VolumeX size={13} className="text-[#E07A66] shrink-0" />}
                      </div>
                      <div className="text-[11px] text-[#5C5850]">
                        {online
                          ? "Online"
                          : seen
                          ? "Last seen " +
                            seen.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : "Offline"}
                        {isThisHost ? " · Host" : ""}
                        {isThisCoHost ? " · Co-host" : ""}
                      </div>
                    </div>
                    {manage && (
                      <div className="flex gap-1 shrink-0">
                        {isHost && (
                          <button
                            onClick={() => toggleCoHost(m)}
                            aria-label={isThisCoHost ? "Remove co-host" : "Make co-host"}
                            className="w-8 h-8 rounded-full border border-[#232019] text-[#C9A44C] flex items-center justify-center"
                          >
                            {isThisCoHost ? <ShieldCheck size={14} /> : <Shield size={14} />}
                          </button>
                        )}
                        <button
                          onClick={() => setMemberFlag(m.id, "muted", !m.muted)}
                          aria-label={m.muted ? "Unmute" : "Mute"}
                          className="w-8 h-8 rounded-full border border-[#232019] text-[#C9A44C] flex items-center justify-center"
                        >
                          {m.muted ? <Volume2 size={14} /> : <VolumeX size={14} />}
                        </button>
                        <button
                          onClick={() => removeMember(m)}
                          aria-label="Remove from group"
                          className="w-8 h-8 rounded-full border border-[#232019] text-[#E07A66] flex items-center justify-center"
                        >
                          <UserX size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {isStaff && removedMembers.length > 0 && (
              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-widest text-[#8A8580] mb-2">
                  Removed
                </div>
                {removedMembers.map(m => (
                  <div key={m.id} className="flex items-center gap-3 px-2 py-1.5">
                    <div className="flex-1 text-[13px] text-[#8A8580] truncate">
                      {m.name || "Someone"}
                    </div>
                    <button
                      onClick={() => setMemberFlag(m.id, "removed", false)}
                      className="text-[12px] rounded-full px-3 py-1 border border-[#C9A44C]/50 text-[#C9A44C]"
                    >
                      Let back in
                    </button>
                  </div>
                ))}
              </div>
            )}

            {isHost && (
              <div className="mt-4 text-[11px] text-[#5C5850]">
                Tap the shield next to a member to make them a co-host. Co-hosts can mute, remove,
                pin, delete messages, switch the AI and end calls. Only you can lock the group,
                rename it and manage co-hosts.
              </div>
            )}

            {!hostUid && (
              <div className="mt-4 text-[11px] text-[#5C5850]">
                This group was created before host controls existed, so it has no host yet.
              </div>
            )}
          </div>
        </div>
      )}

      {inCall && <CallView code={code} name={name} onClose={() => setInCall(false)} />}
    </div>
  );
}
