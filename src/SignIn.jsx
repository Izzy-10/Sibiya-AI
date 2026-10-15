import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import Logo from "./Logo.jsx";
import { signInWithGoogle } from "./firebase.js";

export default function SignIn({ onBack }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    setBusy(true);
    setError("");
    try {
      await signInWithGoogle();
    } catch (e) {
      const quiet = ["auth/popup-closed-by-user", "auth/cancelled-popup-request"];
      if (!quiet.includes(e?.code)) {
        setError(
          "Couldn't sign in. Check that Google sign-in is enabled in Firebase and that this site's domain is authorized."
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="min-h-[100dvh] bg-[#0B0B0C] text-[#F5F1E8] flex flex-col"
      style={{
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="px-4 py-3">
        <button
          onClick={onBack}
          aria-label="Back"
          className="w-8 h-8 rounded-full text-[#8A8580] hover:text-[#C9A44C] flex items-center justify-center"
        >
          <ArrowLeft size={18} />
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center space-y-4">
        <Logo size={64} />
        <div>
          <div className="font-bold text-[18px] tracking-tight">Sign in to chat with Sibiya AI</div>
          <div className="text-[13px] text-[#8A8580] mt-2 max-w-xs">
            Sibiya AI needs to know who is typing. Sign in with Google and it will greet you by name.
          </div>
        </div>
        <button
          onClick={go}
          disabled={busy}
          className="w-full max-w-xs bg-[#C9A44C] text-[#0B0B0C] rounded-xl px-4 py-3 text-[14px] font-semibold disabled:bg-[#2A2823] disabled:text-[#5C5850] transition-colors"
        >
          {busy ? "Opening Google..." : "Continue with Google"}
        </button>
        {error && <div className="text-[12px] text-[#E07A66] max-w-xs">{error}</div>}
      </div>
    </div>
  );
}
