// Shows a chat message. Normal text keeps its clickable links, and a file or code block
// written by the AI as [[FILE: name.ext]] ... [[/FILE]] becomes a card with Copy and Download.
import { useState } from "react";
import { Copy, Download, Check, ChevronDown } from "lucide-react";
import Linkify from "./Linkify.jsx";

const FILE_RE = /\[\[FILE:\s*([^\]\n]{1,100}?)\s*\]\]\r?\n?([\s\S]*?)\r?\n?\[\[\/FILE\]\]/g;

// Splits a message into plain text pieces and file pieces
export function splitMessage(text) {
  const s = String(text ?? "");
  const parts = [];
  let last = 0;
  let m;
  FILE_RE.lastIndex = 0;
  while ((m = FILE_RE.exec(s)) !== null) {
    if (m.index > last) parts.push({ type: "text", text: s.slice(last, m.index) });
    const content = m[2].replace(/^```[a-z]*[ \t]*\r?\n/i, "").replace(/\r?\n```[ \t]*$/, "");
    parts.push({ type: "file", name: cleanName(m[1]), content });
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push({ type: "text", text: s.slice(last) });
  return parts;
}

// Text for reading aloud: files are mentioned by name instead of being read out
export function speechText(text) {
  return splitMessage(text)
    .map(p => (p.type === "file" ? " File: " + p.name + ". " : p.text))
    .join("")
    .trim();
}
export const stripFiles = speechText;

// Short text for quotes and list previews: a file shows as its name
export function previewText(text) {
  return splitMessage(text)
    .map(p => (p.type === "file" ? "📎 " + p.name : p.text.trim()))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanName(raw) {
  const n = String(raw || "").replace(/[^\w.\- ]+/g, "_").trim().slice(0, 80);
  return n || "file.txt";
}

function downloadFile(name, content) {
  try {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  } catch {}
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function FileCard({ name, content }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const lines = content.split("\n").length;
  const long = lines > 8;
  const kb = Math.max(1, Math.round(new Blob([content]).size / 1024));

  async function copy() {
    if (await copyText(content)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <div className="my-2 rounded-xl border border-[#232019] bg-[#0B0B0C] overflow-hidden text-left max-w-full">
      <div className="flex items-center gap-2 px-3 py-2 bg-[#1B1916]">
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold text-[#C9A44C] truncate">{name}</div>
          <div className="text-[10px] text-[#8A8580]">
            {lines} {lines === 1 ? "line" : "lines"} · {kb} KB
          </div>
        </div>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-[11px] text-[#D8D2C4] border border-[#3A2F20] rounded-lg px-2 py-1 hover:text-[#C9A44C]"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          onClick={() => downloadFile(name, content)}
          className="flex items-center gap-1 text-[11px] text-[#0B0B0C] bg-[#C9A44C] rounded-lg px-2 py-1 font-semibold"
        >
          <Download size={12} />
          Download
        </button>
      </div>
      <pre
        className="px-3 py-2 text-[12px] leading-5 text-[#D8D2C4] whitespace-pre overflow-x-auto"
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          maxHeight: open || !long ? "none" : "10.5em",
          overflowY: "hidden",
          margin: 0,
        }}
      >
        {content}
      </pre>
      {long && (
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-center gap-1 py-1.5 text-[11px] text-[#8A8580] border-t border-[#232019] hover:text-[#C9A44C]"
        >
          <ChevronDown size={12} style={{ transform: open ? "rotate(180deg)" : "none" }} />
          {open ? "Show less" : "Show all " + lines + " lines"}
        </button>
      )}
    </div>
  );
}

export default function MessageText({ text, mine = false, allowFiles = false }) {
  if (!allowFiles) return <Linkify text={text} mine={mine} />;
  const parts = splitMessage(text);
  if (!parts.some(p => p.type === "file")) return <Linkify text={text} mine={mine} />;
  return (
    <>
      {parts.map((p, i) =>
        p.type === "file" ? (
          <FileCard key={i} name={p.name} content={p.content} />
        ) : (
          <Linkify key={i} text={p.text.replace(/^\n+|\n+$/g, "")} mine={mine} />
        )
      )}
    </>
  );
}
