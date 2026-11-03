import { X } from "lucide-react";

// A panel that slides up from the bottom of the screen
export function Sheet({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md max-h-[88dvh] overflow-y-auto bg-[#161514] border border-[#232019] rounded-t-3xl p-5 text-[#F5F1E8]"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="font-bold text-[16px]">{title}</div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full text-[#8A8580] hover:text-[#C9A44C] flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const inputCls =
  "w-full bg-[#0B0B0C] border border-[#232019] rounded-xl px-3 py-2.5 text-[14px] outline-none placeholder:text-[#8A8580] focus:border-[#C9A44C]/60 text-[#F5F1E8]";
export const goldBtn =
  "w-full bg-[#C9A44C] text-[#0B0B0C] rounded-xl px-4 py-2.5 text-[13px] font-semibold disabled:bg-[#2A2823] disabled:text-[#8A8580]";
export const lineBtn =
  "w-full border border-[#C9A44C]/50 text-[#C9A44C] rounded-xl px-4 py-2.5 text-[13px] font-semibold disabled:opacity-40";
export const labelCls = "text-[10px] uppercase tracking-widest text-[#C9A44C]";
