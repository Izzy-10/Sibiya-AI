import { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "./firebase.js";
import { Sheet, inputCls, goldBtn, lineBtn, labelCls } from "./ui.jsx";
import { callTool } from "./toolApi.js";

const pad = n => String(n).padStart(2, "0");

export function thisMonth(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}
export function shiftMonth(month, delta) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function monthLabel(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}
export function monthIndex(startMonth, month) {
  const [sy, sm] = startMonth.split("-").map(Number);
  const [y, m] = month.split("-").map(Number);
  return (y - sy) * 12 + (m - sm);
}

// Whose turn it is to receive the pot in a given month
export function payoutFor(config, month) {
  const order = config.order || [];
  if (!order.length || !config.startMonth) return null;
  const i = monthIndex(config.startMonth, month);
  if (i < 0) return null;
  return { turn: (i % order.length) + 1, of: order.length, person: order[i % order.length] };
}

// Who has paid, who says they paid, and who has not paid
export function summarise(config, payments) {
  const rows = (config.order || []).map(p => {
    const pay = payments.find(x => x.uid === p.uid);
    return { uid: p.uid, name: p.name, status: pay ? pay.status : "unpaid" };
  });
  return {
    rows,
    confirmed: rows.filter(r => r.status === "confirmed").length,
    claimed: rows.filter(r => r.status === "claimed").length,
    unpaid: rows.filter(r => r.status === "unpaid").map(r => r.name),
  };
}

const BADGE = {
  confirmed: ["Paid", "text-[#5FBF7A] border-[#5FBF7A]/50"],
  claimed: ["Says paid", "text-[#C9A44C] border-[#C9A44C]/50"],
  unpaid: ["Not paid", "text-[#E07A66] border-[#E07A66]/50"],
};

export default function Stokvel({ room, onClose }) {
  const { code, name, user, isHost, isStaff, members } = room;
  const [config, setConfig] = useState(undefined);
  const [month, setMonth] = useState(thisMonth());
  const [payments, setPayments] = useState([]);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ name: "", amount: "", startMonth: thisMonth(), payoutDay: "25", order: [] });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(
    () =>
      onSnapshot(
        doc(db, "chats", code, "stokvel", "config"),
        s => setConfig(s.exists() ? s.data() : null),
        () => setConfig(null)
      ),
    [code]
  );
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "chats", code, "stokvelPayments"), where("month", "==", month)),
        s => setPayments(s.docs.map(d => d.data())),
        () => {}
      ),
    [code, month]
  );

  // first set-up: start the payout order with everyone in the group
  useEffect(() => {
    if (config === null && members.length) {
      setF(prev => (prev.order.length ? prev : { ...prev, order: members.map(m => ({ uid: m.id, name: m.name || "Someone" })) }));
    }
  }, [config]);

  function startEdit() {
    const base = config || {};
    setF({
      name: base.name || "",
      amount: base.amount != null ? String(base.amount) : "",
      startMonth: base.startMonth || thisMonth(),
      payoutDay: String(base.payoutDay || 25),
      order: base.order && base.order.length ? base.order : members.map(m => ({ uid: m.id, name: m.name || "Someone" })),
    });
    setEditing(true);
    setError("");
  }
  function move(i, d) {
    const o = [...f.order];
    const j = i + d;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    setF({ ...f, order: o });
  }
  async function saveConfig() {
    const amount = Number(f.amount);
    if (!f.name.trim()) return setError("Give the stokvel a name.");
    if (!(amount > 0)) return setError("Type the monthly amount in rand.");
    if (f.order.length < 2) return setError("Add at least two members.");
    setBusy(true);
    setError("");
    try {
      await setDoc(doc(db, "chats", code, "stokvel", "config"), {
        name: f.name.trim().slice(0, 60),
        amount,
        startMonth: f.startMonth,
        payoutDay: Math.min(28, Math.max(1, Number(f.payoutDay) || 25)),
        order: f.order,
        updatedBy: name,
      });
      setEditing(false);
    } catch {
      setError("Couldn't save. Try again.");
    }
    setBusy(false);
  }

  const payRef = uid => doc(db, "chats", code, "stokvelPayments", `${month}_${uid}`);
  const claim = () =>
    setDoc(payRef(user.uid), { month, uid: user.uid, name, amount: config.amount, status: "claimed", createdAt: serverTimestamp() }).catch(() => setError("Couldn't save. Try again."));
  const confirm = r =>
    setDoc(payRef(r.uid), { month, uid: r.uid, name: r.name, amount: config.amount, status: "confirmed", confirmedBy: name, createdAt: serverTimestamp() }).catch(() => setError("Couldn't save. Try again."));
  const undo = r => deleteDoc(payRef(r.uid)).catch(() => setError("Couldn't undo. Try again."));

  async function remind(unpaid) {
    setBusy(true);
    setError("");
    try {
      const d = await callTool({ tool: "reminder", group: config.name, month: monthLabel(month), amount: config.amount, unpaid });
      setDraft(d.text);
    } catch (e) {
      setError(e.message || "Couldn't write the reminder.");
    }
    setBusy(false);
  }
  async function postDraft() {
    try {
      await addDoc(collection(db, "chats", code, "messages"), { text: draft.slice(0, 1000), uid: user.uid, name, ai: false, createdAt: serverTimestamp() });
      setDraft("");
    } catch {
      setError("Couldn't post. Try again.");
    }
  }

  let body;
  if (config === undefined) body = <div className="text-[13px] text-[#B5A284]">Loading...</div>;
  else if (editing || (config === null && isHost)) {
    body = (
      <div className="space-y-3">
        <p className="text-[13px] text-[#D8D2C4]">Set up the stokvel. Sibiya AI only keeps the record. It does not move any money.</p>
        <div>
          <div className={labelCls}>Name</div>
          <input className={inputCls + " mt-1"} value={f.name} maxLength={60} placeholder="e.g. Ladies Stokvel" onChange={e => setF({ ...f, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className={labelCls}>Monthly (rand)</div>
            <input className={inputCls + " mt-1"} inputMode="numeric" value={f.amount} placeholder="500" onChange={e => setF({ ...f, amount: e.target.value.replace(/[^0-9.]/g, "") })} />
          </div>
          <div>
            <div className={labelCls}>Payout day</div>
            <input className={inputCls + " mt-1"} inputMode="numeric" value={f.payoutDay} onChange={e => setF({ ...f, payoutDay: e.target.value.replace(/[^0-9]/g, "") })} />
          </div>
        </div>
        <div>
          <div className={labelCls}>First month</div>
          <input type="month" className={inputCls + " mt-1"} value={f.startMonth} onChange={e => setF({ ...f, startMonth: e.target.value })} />
        </div>
        <div>
          <div className={labelCls}>Payout order</div>
          <div className="mt-1 space-y-1">
            {f.order.map((p, i) => (
              <div key={p.uid} className="flex items-center gap-2 rounded-lg bg-[#0B0B0C] border border-[#232019] px-3 py-1.5 text-[14px]">
                <span className="text-[#C9A44C] w-5">{i + 1}</span>
                <span className="flex-1 truncate">{p.name}</span>
                <button aria-label="Move up" className="px-1 text-[#8A8580]" onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button aria-label="Move down" className="px-1 text-[#8A8580]" onClick={() => move(i, 1)}>
                  ↓
                </button>
                <button aria-label="Remove" className="px-1 text-[#E07A66]" onClick={() => setF({ ...f, order: f.order.filter(x => x.uid !== p.uid) })}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <button className="mt-2 text-[12px] text-[#C9A44C] underline" onClick={() => setF({ ...f, order: members.map(m => ({ uid: m.id, name: m.name || "Someone" })) })}>
            Use everyone in this group
          </button>
        </div>
        {error && <div className="text-[12px] text-[#E07A66]">{error}</div>}
        <button className={goldBtn} onClick={saveConfig} disabled={busy}>
          Save stokvel
        </button>
        {config && (
          <button className={lineBtn} onClick={() => setEditing(false)}>
            Cancel
          </button>
        )}
      </div>
    );
  } else if (config === null) {
    body = <p className="text-[14px] text-[#D8D2C4]">No stokvel yet. The host can set one up for this group.</p>;
  } else {
    const sum = summarise(config, payments);
    const turn = payoutFor(config, month);
    const me = sum.rows.find(r => r.uid === user.uid);
    body = (
      <div className="space-y-3">
        <div>
          <div className="text-[16px] font-bold">{config.name}</div>
          <div className="text-[12px] text-[#8A8580]">
            R{config.amount} each month · payout on day {config.payoutDay}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <button className="w-9 h-9 rounded-full border border-[#232019] text-[#C9A44C]" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
            ‹
          </button>
          <div className="text-[14px] font-semibold">{monthLabel(month)}</div>
          <button className="w-9 h-9 rounded-full border border-[#232019] text-[#C9A44C]" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>
            ›
          </button>
        </div>
        <div className="rounded-xl border border-[#3A2F20] bg-[#0B0B0C] p-3">
          {turn ? (
            <>
              <div className={labelCls}>This month's payout</div>
              <div className="text-[15px] font-semibold mt-1">
                {turn.person.name} · R{config.amount * turn.of}
              </div>
              <div className="text-[11px] text-[#8A8580]">
                Turn {turn.turn} of {turn.of}
              </div>
            </>
          ) : (
            <div className="text-[13px] text-[#B5A284]">The stokvel starts in {monthLabel(config.startMonth)}.</div>
          )}
        </div>
        <div className="text-[12px] text-[#B5A284]">
          {sum.confirmed} of {sum.rows.length} paid
          {sum.claimed ? ` · ${sum.claimed} waiting to be confirmed` : ""}
        </div>
        <div className="space-y-1.5">
          {sum.rows.map(r => (
            <div key={r.uid} className="flex items-center gap-2 rounded-lg bg-[#0B0B0C] border border-[#232019] px-3 py-2 text-[14px]">
              <span className="flex-1 truncate">{r.name}</span>
              <span className={`text-[10px] border rounded-full px-2 py-0.5 ${BADGE[r.status][1]}`}>{BADGE[r.status][0]}</span>
              {isStaff && r.status !== "confirmed" && (
                <button className="text-[11px] text-[#0B0B0C] bg-[#C9A44C] rounded-lg px-2 py-1 font-semibold" onClick={() => confirm(r)}>
                  Confirm
                </button>
              )}
              {isStaff && r.status !== "unpaid" && (
                <button className="text-[11px] text-[#8A8580] underline" onClick={() => undo(r)}>
                  Undo
                </button>
              )}
            </div>
          ))}
        </div>
        {me && me.status === "unpaid" && (
          <button className={goldBtn} onClick={claim}>
            I've paid for {monthLabel(month)}
          </button>
        )}
        {me && me.status === "claimed" && !isStaff && (
          <button className="text-[12px] text-[#8A8580] underline" onClick={() => undo(me)}>
            I haven't paid yet (undo)
          </button>
        )}
        {isStaff && sum.unpaid.length > 0 && !draft && (
          <button className={lineBtn} onClick={() => remind(sum.unpaid)} disabled={busy}>
            {busy ? "Writing..." : `Write a reminder for ${sum.unpaid.length} ${sum.unpaid.length === 1 ? "person" : "people"}`}
          </button>
        )}
        {draft && (
          <div className="space-y-2">
            <textarea className={inputCls + " resize-none"} rows={4} value={draft} onChange={e => setDraft(e.target.value)} />
            <button className={goldBtn} onClick={postDraft}>
              Post in the group
            </button>
            <button className={lineBtn} onClick={() => setDraft("")}>
              Discard
            </button>
          </div>
        )}
        {isHost && (
          <button className="text-[12px] text-[#C9A44C] underline" onClick={startEdit}>
            Change the stokvel settings
          </button>
        )}
        {error && <div className="text-[12px] text-[#E07A66]">{error}</div>}
        <p className="text-[11px] text-[#8A8580]">Sibiya AI only keeps the record. It does not move or hold any money.</p>
      </div>
    );
  }

  return (
    <Sheet title="Stokvel" onClose={onClose}>
      {body}
    </Sheet>
  );
}
