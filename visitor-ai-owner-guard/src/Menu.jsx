import { useState } from "react";
import { Menu as MenuIcon, X, Feather, Hourglass, ScrollText, HelpCircle, Wallet, Sparkles, Home, Info, LifeBuoy, Shield, Share2, FileText, Bot } from "lucide-react";
import Izibongo from "./Izibongo.jsx";
import Capsule from "./Capsule.jsx";
import CatchUp from "./CatchUp.jsx";
import Quiz from "./Quiz.jsx";
import Stokvel from "./Stokvel.jsx";
import Persona, { personaLabel } from "./Persona.jsx";

// The ☰ menu. Inside a group it also shows the group tools (pass the `room` details).
export default function Menu({ room }) {
  const [open, setOpen] = useState(false);
  const [tool, setTool] = useState(null);

  function go(t) {
    setOpen(false);
    setTool(t);
  }

  async function shareApp() {
    const url = "https://sibiya-ai.vercel.app";
    const text = "Sawubona! Try Sibiya AI, an AI assistant made in South Africa. It speaks isiZulu and English, with group chats, quizzes and more.";
    try {
      if (navigator.share) await navigator.share({ title: "Sibiya AI", text, url });
      else await navigator.clipboard.writeText(text + " " + url);
    } catch {}
    setOpen(false);
  }

  const create = [
    { id: "izibongo", icon: Feather, label: "Izibongo maker", desc: "A praise poem in isiZulu for someone you love" },
    { id: "capsule", icon: Hourglass, label: "Time capsule", desc: "Seal a message to open on a future date" },
  ];
  const group = room
    ? [
        { id: "catchup", icon: ScrollText, label: "Catch me up", desc: "A short summary of what you missed" },
        { id: "quiz", icon: HelpCircle, label: "Quiz night", desc: "AI-hosted quiz with live scores" },
        { id: "stokvel", icon: Wallet, label: "Stokvel", desc: "Contributions, payout turns and reminders" },
        { id: "persona", icon: Sparkles, label: "AI personality", desc: personaLabel(room.meta && room.meta.persona) },
      ]
    : [];
  const pages = [
    { href: "/landing.html", icon: Home, label: "Home page" },
    { href: "/about.html", icon: Info, label: "About" },
    { href: "/support.html", icon: LifeBuoy, label: "Support" },
    { href: "/privacy.html", icon: Shield, label: "Privacy" },
    { href: "/terms-and-conditions.html", icon: FileText, label: "Terms" },
    { href: "/visitor-ai-policy.html", icon: Bot, label: "Visitor AI access" },
  ];

  const Item = ({ it }) => (
    <button onClick={() => go(it.id)} className="w-full flex items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[#0B0B0C]">
      <it.icon size={18} className="text-[#C9A44C] mt-0.5 shrink-0" />
      <span>
        <span className="block text-[14px] font-semibold">{it.label}</span>
        <span className="block text-[12px] text-[#8A8580]">{it.desc}</span>
      </span>
    </button>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Menu"
        className="w-9 h-9 shrink-0 rounded-full border border-[#C9A44C]/50 text-[#C9A44C] flex items-center justify-center"
      >
        <MenuIcon size={16} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setOpen(false)}>
          <div
            onClick={e => e.stopPropagation()}
            className="w-[86%] max-w-sm h-full overflow-y-auto bg-[#161514] border-l border-[#232019] p-5 text-[#F5F1E8]"
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="font-bold tracking-[0.15em] text-[15px]" style={{ fontFamily: "Georgia, serif" }}>
                SIBIYA <span className="text-[#C9A44C]">AI</span>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="w-8 h-8 rounded-full text-[#8A8580] hover:text-[#C9A44C] flex items-center justify-center">
                <X size={18} />
              </button>
            </div>

            {group.length > 0 && (
              <>
                <div className="text-[10px] uppercase tracking-widest text-[#C9A44C] mb-1">In this group</div>
                {group.map(it => (
                  <Item key={it.id} it={it} />
                ))}
                <div className="h-3" />
              </>
            )}

            <div className="text-[10px] uppercase tracking-widest text-[#C9A44C] mb-1">Create</div>
            {create.map(it => (
              <Item key={it.id} it={it} />
            ))}

            <div className="h-3" />
            <div className="text-[10px] uppercase tracking-widest text-[#C9A44C] mb-1">Sibiya AI</div>
            {pages.map(p => (
              <a key={p.href} href={p.href} className="flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] hover:bg-[#0B0B0C]">
                <p.icon size={18} className="text-[#C9A44C]" />
                {p.label}
              </a>
            ))}
            <button onClick={shareApp} className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] text-left hover:bg-[#0B0B0C]">
              <Share2 size={18} className="text-[#C9A44C]" />
              Share Sibiya AI
            </button>
          </div>
        </div>
      )}

      {tool === "izibongo" && <Izibongo onClose={() => setTool(null)} />}
      {tool === "capsule" && <Capsule room={room} onClose={() => setTool(null)} />}
      {room && tool === "catchup" && <CatchUp room={room} onClose={() => setTool(null)} />}
      {room && tool === "quiz" && <Quiz room={room} onClose={() => setTool(null)} />}
      {room && tool === "stokvel" && <Stokvel room={room} onClose={() => setTool(null)} />}
      {room && tool === "persona" && <Persona room={room} onClose={() => setTool(null)} />}
    </>
  );
}