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
  Search,
  Images,
  Timer,
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
  Timestamp,
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
import { getGroupMuteUntil, getSoundOn, isGroupMuted, playChime, setGroupMute, setSoundOn } from "./sound.js";
import Linkify from "./Linkify.jsx";
import MessageText, { previewText } from "./MessageText.jsx";
import Menu from "./Menu.jsx";
import { useIsOwner } from "./owner.js";

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

const ROW = "w-full flex items-center gap-3 px-4 py-3 text-[14px] text-[#F5F1E8] bg-[#161514]";
const CHIP = "rounded-full border border-[#C9A44C]/50 px-4 py-1.5 text-[12px]";

const DISAPPEAR_OPTIONS = [
  { label: "Off", seconds: 0 },
  { label: "24 hours", seconds: 86400 },
  { label: "7 days", seconds: 604800 },
  { label: "90 days", seconds: 7776000 },
];
const MUTE_OPTIONS = [
  { label: "8 hours", ms: 8 * 3600 * 1000 },
  { label: "1 week", ms: 7 * 24 * 3600 * 1000 },
  { label: "Always", ms: -1 },
];

function disappearLabel(sec) {
  const o = DISAPPEAR_OPTIONS.find(x => x.seconds === sec);
  return o ? o.label : "On";
}

function muteLabel(until) {
  if (until === -1) return "Always";
  if (until > Date.now())
    return "Until " + new Date(until).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
  return "Off";
}

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
  const [showSearch, setShowSearch] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [muteMenu, setMuteMenu] = useState(false);
  const [disMenu, setDisMenu] = useState(false);
  const [editDesc, setEditDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [muteUntil, setMuteUntil] = useState(() => getGroupMuteUntil(code));
  const inputRef = useRef(null);
  const [, setTick] = useState(0);
  const scrollRef = useRef(null);
  const nearBottomRef = useRef(true); // is the person reading the latest messages?
  const prevCountRef = useRef(null);
  const messagesRef = useRef([]);
  const fileInputRef = useRef(null);
  const kickedRef = useRef(false);
  // when this group was last read before this visit (used by "Catch me up")
  const prevReadRef = useRef(null);
  if (prevReadRef.current === null) {
    try {
      prevReadRef.current = Number(localStorage.getItem("sibiya-lastread:" + code)) || 0;
    } catch {
      prevReadRef.current = 0;
    }
  }

  const isOwner = useIsOwner(); // master key: no group rule applies to the owner
  const hostUid = meta?.hostUid || "";
  const coHosts = Array.isArray(meta?.coHosts) ? meta.coHosts : [];
  const isHost = (!!hostUid && hostUid === user.uid) || isOwner;
  const isCoHost = coHosts.includes(user.uid);
  const isStaff = isHost || isCoHost;
  const aiOn = meta?.aiEnabled !== false;
  const description = typeof meta?.description === "string" ? meta.description : "";
  const disappearAfter = Number(meta?.disappearAfter) || 0;
  const nowTs = Date.now();
  const groupMuted = muteUntil === -1 || muteUntil > nowTs;
  // messages whose disappearing time has passed are hidden right away
  const visibleMessages = messages.filter(m => {
    const t = m.expireAt?.toMillis?.();
    return !t || t > nowTs;
  });
  const mediaMessages = visibleMessages
    .filter(m => (m.type === "voice" || m.type === "file") && m.mediaId)
    .reverse();
  const q = searchQ.trim().toLowerCase();
  const searchResults =
    q.length >= 2
      ? visibleMessages
          .filter(m => m.type !== "notice" && typeof m.text === "string" && m.text.toLowerCase().includes(q))
          .reverse()
          .slice(0, 50)
      : [];
  const locked = meta?.locked === true;
  const pinned = meta?.pinned?.text ? meta.pinned : null;
  const me = members.find(m => m.id === user.uid);
  const iAmRemoved = !isOwner && !!me?.removed;
  const iAmMuted = !isOwner && !!me?.muted;
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
    if (m.id === user.uid) return false;
    if (isOwner) return true;
    if (m.id === hostUid) return false;
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
            return d.uid !== user.uid && d.type !=
