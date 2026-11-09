import { useState } from "react";
import { deleteField, doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase.js";
import { Sheet } from "./ui.jsx";
import { postNotice } from "./toolApi.js";

export const PERSONAS = [
  { key: "", label: "Sibiya AI", desc: "Calm, clear and helpful. The default." },
  { key: "gogo", label: "Gogo", desc: "Warm grandmother wisdom, proverbs and gentle humour." },
  { key: "coach", label: "Study coach", desc: "Short, structured and pushes you to learn." },
  { key: "comedian", label: "Comedian", desc: "Light jokes and playful answers, never mean." },
  { key: "storyteller", label: "Kasi storyteller", desc: "Explains things through short stories, in a Durban mix of languages." },
];

export function personaLabel(key) {
  return (PERSONAS.find(p => p.key === (key || "")) || PERSONAS[0]).label;
}

export default function Persona({ room, onClose }) {
  const { code, name, user, meta, isHost } = room;
  const current = meta?.persona || "";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function pick(key) {
    if (!isHost || key === current) return;
    setBusy(true);
    setError("");
    try {
      await updateDoc(doc(db, "chats", code, "info", "meta"), { persona: key || deleteField() });
      await postNotice(code, user.uid, name, `${name} set Sibiya AI's personality to ${personaLabel(key)}.`);
    } catch {
      setError("Couldn't change it. Try again.");
    }
    setBusy(false);
  }

  return (
    <Sheet title="AI personality" onClose={onClose}>
      <p className="text-[13px] text-[#D8D2C4] mb-3">
        {isHost ? "Choose how Sibiya AI sounds in this group." : "The host chooses how Sibiya AI sounds in this group."}
      </p>
      <div className="space-y-2">
        {PERSONAS.map(p => {
          const on = p.key === current;
          return (
            <button
              key={p.key || "default"}
              onClick={() => pick(p.key)}
              disabled={busy || !isHost}
              className={`w-full text-left rounded-xl border px-4 py-3 ${on ? "border-[#C9A44C] bg-[#C9A44C]/10" : "border-[#232019] bg-[#0B0B0C]"} disabled:opacity-80`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold">{p.label}</span>
                {on && <span className="text-[10px] uppercase tracking-widest text-[#C9A44C]">Active</span>}
              </div>
              <div className="text-[12px] text-[#B5A284] mt-0.5">{p.desc}</div>
            </button>
          );
        })}
      </div>
      {error && <div className="mt-3 text-[12px] text-[#E07A66]">{error}</div>}
    </Sheet>
  );
}
