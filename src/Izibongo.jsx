import { useState } from "react";
import { Sheet, inputCls, goldBtn, lineBtn, labelCls } from "./ui.jsx";
import { callTool, copyToClipboard } from "./toolApi.js";

const OCCASIONS = ["Birthday", "Graduation", "Wedding", "Thank you", "Welcome home", "Just because"];

export default function Izibongo({ onClose }) {
  const [name, setName] = useState("");
  const [occasion, setOccasion] = useState(OCCASIONS[0]);
  const [relation, setRelation] = useState("");
  const [proud, setProud] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [poem, setPoem] = useState(null);
  const [copied, setCopied] = useState(false);

  async function make() {
    if (!name.trim()) {
      setError("Type the person's name first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await callTool({ tool: "izibongo", name: name.trim(), occasion, relation, proud });
      if (!data.izibongo) setError(data.meaning || "Could not write the poem. Try again.");
      else setPoem(data);
    } catch (e) {
      setError(e.message || "Could not write the poem. Try again.");
    }
    setBusy(false);
  }

  const full = poem ? `${poem.title}\n\n${poem.izibongo}\n\nMeaning:\n${poem.meaning}` : "";

  async function copy() {
    try {
      await copyToClipboard(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: poem.title || "Izibongo", text: full });
      else await copy();
    } catch {}
  }
  function download() {
    const blob = new Blob([full], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "izibongo-" + name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  return (
    <Sheet title="Izibongo maker" onClose={onClose}>
      {!poem ? (
        <div className="space-y-3">
          <p className="text-[13px] text-[#D8D2C4]">
            A personal praise poem in isiZulu, with an English meaning. Tell me about the person.
          </p>
          <div>
            <div className={labelCls}>Who is it for?</div>
            <input className={inputCls + " mt-1"} value={name} maxLength={60} placeholder="Their name" onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <div className={labelCls}>Occasion</div>
            <select className={inputCls + " mt-1"} value={occasion} onChange={e => setOccasion(e.target.value)}>
              {OCCASIONS.map(o => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <div className={labelCls}>Who are they to you? (optional)</div>
            <input className={inputCls + " mt-1"} value={relation} maxLength={60} placeholder="e.g. my sister, my teacher" onChange={e => setRelation(e.target.value)} />
          </div>
          <div>
            <div className={labelCls}>What should the poem praise?</div>
            <textarea
              className={inputCls + " mt-1 resize-none"}
              rows={4}
              maxLength={600}
              value={proud}
              placeholder="e.g. works hard, first in the family to graduate, loves football, always makes people laugh"
              onChange={e => setProud(e.target.value)}
            />
          </div>
          {error && <div className="text-[12px] text-[#E07A66]">{error}</div>}
          <button className={goldBtn} onClick={make} disabled={busy}>
            {busy ? "Writing..." : "Write izibongo"}
          </button>
          <p className="text-[11px] text-[#8A8580]">This is a personal praise poem. It is not anyone's clan izithakazelo.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[#3A2F20] bg-[#0B0B0C] p-4">
            {poem.title && (
              <div className="text-[18px] font-bold text-[#C9A44C]" style={{ fontFamily: "Georgia, serif" }}>
                {poem.title}
              </div>
            )}
            <div className="mt-3 text-[15px] leading-7 whitespace-pre-line" style={{ fontFamily: "Georgia, serif" }}>
              {poem.izibongo}
            </div>
            {poem.meaning && (
              <div className="mt-4 pt-3 border-t border-[#232019]">
                <div className={labelCls}>Meaning</div>
                <div className="mt-1 text-[13px] text-[#B5A284] whitespace-pre-line">{poem.meaning}</div>
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button className={lineBtn} onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
            <button className={lineBtn} onClick={share}>
              Share
            </button>
            <button className={lineBtn} onClick={download}>
              Save
            </button>
          </div>
          <button className={goldBtn} onClick={() => setPoem(null)}>
            Write another
          </button>
        </div>
      )}
    </Sheet>
  );
}
