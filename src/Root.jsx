import { useState, useEffect } from "react";
import App from "./App.jsx";
import Lobby from "./Lobby.jsx";
import Room from "./Room.jsx";
import SignIn from "./SignIn.jsx";
import { watchAuth, signOutUser } from "./firebase.js";

const OWNER_EMAIL = (import.meta.env.VITE_OWNER_EMAIL || "").trim().toLowerCase();

export default function Root() {
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState("");
  const [view, setView] = useState("lobby");
  const [room, setRoom] = useState(null);
  const [initialCode] = useState(
    () => new URLSearchParams(window.location.search).get("room") || ""
  );

  useEffect(() => {
    return watchAuth(setUser, e =>
      setAuthError(
        "Couldn't connect to Sibiya chat (" +
          (e?.code || "unknown error") +
          "). Check that Anonymous sign-in is enabled in Firebase."
      )
    );
  }, []);

  useEffect(() => {
    const onPop = () => setView("lobby");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function go(nextView, nextRoom = null) {
    window.history.pushState({}, "");
    setRoom(nextRoom);
    setView(nextView);
  }

  const isOwner = !!OWNER_EMAIL && !!user && !user.isAnonymous && String(user.email || "").toLowerCase() === OWNER_EMAIL;

  if (view === "solo") {
    if (isOwner) {
      return (
        <div className="min-h-[100dvh] bg-[#0B0B0C] text-[#F5F1E8] flex items-center justify-center px-6">
          <div className="max-w-md rounded-2xl border border-[#232019] bg-[#161514] p-6 text-center">
            <div className="text-[12px] uppercase tracking-[0.2em] text-[#C9A44C]">Access</div>
            <h2 className="mt-3 text-[22px] font-bold">Public AI is unavailable for this account.</h2>
            <p className="mt-3 text-[14px] text-[#D8D2C4]">
              The founder/admin account is restricted from the public AI chat.
            </p>
            <button
              onClick={() => window.history.back()}
              className="mt-5 rounded-xl bg-[#C9A44C] px-4 py-2 text-[13px] font-semibold text-[#0B0B0C]"
            >
              Back
            </button>
          </div>
        </div>
      );
    }
    if (user && !user.isAnonymous) return <App onHome={() => window.history.back()} />;
    return <SignIn onBack={() => window.history.back()} />;
  }

  if (view === "room" && room && user) {
    return (
      <Room
        user={user}
        code={room.code}
        name={room.name}
        title={room.title}
        onBack={() => window.history.back()}
      />
    );
  }

  return (
    <Lobby
      user={user}
      authError={authError}
      initialCode={initialCode}
      onEnterRoom={(code, name, title) => go("room", { code, name, title })}
      onSolo={() => go("solo")}
      onSignOut={signOutUser}
    />
  );
}
