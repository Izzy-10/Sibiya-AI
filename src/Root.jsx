import { useState, useEffect } from "react";
import App from "./App.jsx";
import Lobby from "./Lobby.jsx";
import Room from "./Room.jsx";
import SignIn from "./SignIn.jsx";
import { watchAuth, signOutUser } from "./firebase.js";

export default function Root() {
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState("");
  const [view, setView] = useState("lobby");
  const [room, setRoom] = useState(null);
  const [initialCode] = useState(
    () => new URLSearchParams(window.location.search).get("room") || ""
  );

  useEffect(() => {
    return watchAuth(setUser, () =>
      setAuthError(
        "Couldn't connect to Sibiya chat. Check that Anonymous sign-in is enabled in Firebase."
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

  if (view === "solo") {
    if (user && !user.isAnonymous) return <App />;
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
