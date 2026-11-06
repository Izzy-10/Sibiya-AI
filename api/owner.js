import { useEffect, useState } from "react";
import { callTool } from "./toolApi.js";

// True when the person signed in holds the master key (the owner's verified Google account).
// The server decides this, so nobody can fake it from the app.
export function useIsOwner() {
  const [owner, setOwner] = useState(false);
  useEffect(() => {
    let alive = true;
    callTool({ tool: "whoami" })
      .then(d => alive && setOwner(!!d.owner))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return owner;
}
