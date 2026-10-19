import { AccessToken } from "livekit-server-sdk";

const FIREBASE_API_KEY = "AIzaSyByw2cQQXcWjVl2ESpiPJ32-6VLETvBOx0";

async function verifyUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
      }
    );
    if (!r.ok) return null;
    const data = await r.json();
    const u = data.users && data.users[0];
    if (!u) return null;
    return { uid: u.localId, name: u.displayName || "" };
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyUser(req);
  if (!user) {
    return res.status(401).json({ error: "Please sign in." });
  }

  const url = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
 
  if (!url || !key || !secret) {
    const missing = [!url && "LIVEKIT_URL", !key && "LIVEKIT_API_KEY", !secret && "LIVEKIT_API_SECRET"]
      .filter(Boolean)
      .join(", ");
    return res.status(500).json({ error: "Calls are not set up yet. Missing in Vercel: " + missing + "." });
  }
  try {
    const body = req.body || {};
    const code = String(body.code || "").trim().toLowerCase();
    if (!/^[a-z0-9-]{6,40}$/.test(code)) {
      return res.status(400).json({ error: "Invalid group code." });
    }

    const name =
      String(body.name || user.name || "Guest")
        .replace(/[^\p{L}\p{N} .'_-]/gu, "")
        .trim()
        .slice(0, 24) || "Guest";

    const at = new AccessToken(key, secret, { identity: user.uid, name, ttl: 21600 });
    at.addGrant({
      roomJoin: true,
      room: "sibiya-" + code,
      canPublish: true,
      canSubscribe: true,
    });
    const token = await at.toJwt();

    return res.status(200).json({ token, url });
  } catch (error) {
    console.error("Sibiya AI call error:", error);
    return res.status(500).json({ error: "Couldn't start the call." });
  }
}
