import { useEffect, useState } from "react";
import { collection, doc, getDoc, onSnapshot, query, serverTimestamp, Timestamp, where, writeBatch } from "firebase/firestore";
import { db } from "./firebase.js";
import { Sheet, inputCls, goldBtn, lineBtn, labelCls } from "./ui.jsx";
import { currentUid, postNotice, savedGroups, savedName } from "./toolApi.js";

const DAY = 24 * 60 * 60 * 1000;

// Is the capsule open yet, and what should it say?
export function capsuleState(openAtMs, now = Date.now()) {
  if (openAtMs <= now) return { open: true, label: "Ready to open" };
  const days = Math.ceil((openAtMs - now) / DAY);
  return { open: false, label: days <= 1 ? "Opens tomorrow" : `Opens in ${days} days` };
}

export function dateLabel(ms) {
  return new Date(ms).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
}

function isoDate(ms) {
  const d = new Date(ms);
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Sept 24 (Heritage Day), this year or the next one
function nextHeritageDay(now = Date.now()) {
  const y = new Date(now).getFullYear();
  const d = new Date(y, 8, 24, 7, 0, 0);
  return d.getTime() > now + DAY ? d.getTime() : new Date(y + 1, 8, 24, 7, 0, 0).getTime();
}

export default function Capsule({ room, onClose }) {
  const [uid, setUid] = useState(room?.user?.uid || null);
  const [own, setOwn] = useState([]);
  const [shared, setShared] = useState([]);
  const [mode, setMode] = useState("list"); // list | new
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [date, setDate] = useState(isoDate(Date.now() + 30 * DAY));
  const [to, setTo] = useState("me"); // "me" or a group code
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reading, setReading] = useState({}); // id -> text
  const groups = room ? [] : savedGroups();
  const ownerName = room?.name || savedName() || "Someone";

  useEffect(() => {
    if (!uid) currentUid().then(setUid);
  }, []);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, "capsules"), where("ownerUid", "==", uid)),
      s => setOwn(s.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {}
    );
  }, [uid]);

  useEffect(() => {
    if (!room) return;
    return onSnapshot(
      query(collection(db, "capsules"), where("groupCode", "==", room.code)),
      s => setShared(s.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {}
    );
  }, [room?.code]);

  const all = [...own];
  shared.forEach(c => {
    if (!all.some(x => x.id === c.id)) all.push(c);
  });
  const ms = c => (c.openAt && c.openAt.toMillis ? c.openAt.toMillis() : 0);
  all.sort((a, b) => ms(a) - ms(b));

  async function seal() {
    const openAt = new Date(date + "T07:00:00").getTime();
    if (!title.trim()) return setError("Give the capsule a title.");
    if (!text.trim()) return setError("Write your message first.");
    if (!(openAt > Date.now() + 60 * 60 * 1000)) return setError("Pick a date in the future.");
    if (!uid) return setError("Please wait a moment and try again.");
    const groupCode = room ? (to === "group" ? room.code : "") : to === "me" ? "" : to;
    setBusy(true);
    setError("");
    try {
      const ref = doc(collection(db, "capsules"));
      const when = Timestamp.fromMillis(openAt);
      const batch = writeBatch(db);
      batch.set(ref, { ownerUid: uid, ownerName, title: title.trim().slice(0, 80), openAt: when, createdAt: serverTimestamp(), groupCode });
      batch.set(doc(db, "capsulesSealed", ref.id), { ownerUid: uid, groupCode, openAt: when, text: text.trim().slice(0, 2000) });
      await batch.commit();
      if (groupCode) {
        await postNotice(groupCode, uid, ownerName, `🔒 ${ownerName} sealed a time capsule for the group: "${title.trim().slice(0, 80)}". It opens on ${dateLabel(openAt)}.`).catch(() => {});
      }
      setTitle("");
      setText("");
      setMode("list");
    } catch {
      setError("Couldn't seal the capsule. Try again.");
    }
    setBusy(false);
  }

  async function read(c) {
    try {
      const snap = await getDoc(doc(db, "capsulesSealed", c.id));
      setReading(r => ({ ...r, [c.id]: snap.exists() ? snap.data().text : "This capsule is empty." }));
    } catch {
      setReading(r => ({ ...r, [c.id]: "It isn't time yet. Come back on the day." }));
    }
  }

  async function remove(c) {
    if (!window.confirm("Delete this capsule? Its message will be gone for good.")) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, "capsules", c.id));
      batch.delete(doc(db, "capsulesSealed", c.id));
      await batch.commit();
    } catch {
      setError("Couldn't delete it. Try again.");
    }
  }

  const presets = [
    ["1 month", Date.now() + 30 * DAY],
    ["6 months", Date.now() + 182 * DAY],
    ["1 year", Date.now() + 365 * DAY],
    ["Heritage Day", nextHeritageDay()],
  ];

  return (
    <Sheet title="Time capsule" onClose={onClose}>
      {mode === "new" ? (
        <div className="space-y-3">
          <p className="text-[13px] text-[#D8D2C4]">Write a message now. It stays locked until the day you choose, even for you.</p>
          <div>
            <div className={labelCls}>Title</div>
            <input className={inputCls + " mt-1"} value={title} maxLength={80} placeholder="e.g. To me, after my exams" onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <div className={labelCls}>Your message</div>
            <textarea className={inputCls + " mt-1 resize-none"} rows={5} maxLength={2000} value={text} onChange={e => setText(e.target.value)} />
          </div>
          <div>
            <div className={labelCls}>Opens on</div>
            <input type="date" className={inputCls + " mt-1"} value={date} min={isoDate(Date.now() + DAY)} onChange={e => setDate(e.target.value)} />
            <div className="flex flex-wrap gap-2 mt-2">
              {presets.map(([label, t]) => (
                <button key={label} onClick={() => setDate(isoDate(t))} className="text-[11px] border border-[#3A2F20] rounded-full px-3 py-1 text-[#C9A44C]">
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className={labelCls}>Who can open it?</div>
            {room ? (
              <select className={inputCls + " mt-1"} value={to} onChange={e => setTo(e.target.value)}>
                <option value="me">Just me</option>
                <option value="group">Everyone in this group</option>
              </select>
            ) : (
              <select className={inputCls + " mt-1"} value={to} onChange={e => setTo(e.target.value)}>
                <option value="me">Just me</option>
                {groups.map(g => (
                  <option key={g.code} value={g.code}>
                    Group: {g.title || g.code}
                  </option>
                ))}
              </select>
            )}
          </div>
          {error && <div className="text-[12px] text-[#E07A66]">{error}</div>}
          <button className={goldBtn} onClick={seal} disabled={busy}>
            {busy ? "Sealing..." : "Seal the capsule"}
          </button>
          <button className={lineBtn} onClick={() => setMode("list")}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <button className={goldBtn} onClick={() => setMode("new")}>
            Write a new capsule
          </button>
          {error && <div className="text-[12px] text-[#E07A66]">{error}</div>}
          {all.length === 0 && <p className="text-[13px] text-[#B5A284]">No capsules yet. Seal a message for your future self, or for your group.</p>}
          {all.map(c => {
            const st = capsuleState(ms(c));
            const mine = c.ownerUid === uid;
            return (
              <div key={c.id} className="rounded-xl border border-[#232019] bg-[#0B0B0C] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold truncate">{(st.open ? "🔓 " : "🔒 ") + c.title}</div>
                    <div className="text-[11px] text-[#8A8580]">
                      {c.groupCode ? "For the group" : "For me"} · from {mine ? "you" : c.ownerName || "someone"} · {dateLabel(ms(c))}
                    </div>
                  </div>
                  <span className={`text-[11px] shrink-0 ${st.open ? "text-[#5FBF7A]" : "text-[#C9A44C]"}`}>{st.label}</span>
                </div>
                {st.open && !reading[c.id] && (
                  <button className={lineBtn + " mt-3"} onClick={() => read(c)}>
                    Open it
                  </button>
                )}
                {reading[c.id] && <div className="mt-3 rounded-lg bg-[#161514] p-3 text-[14px] whitespace-pre-line">{reading[c.id]}</div>}
                {mine && (
                  <button className="mt-2 text-[11px] text-[#8A8580] hover:text-[#E07A66] underline" onClick={() => remove(c)}>
                    Delete
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
