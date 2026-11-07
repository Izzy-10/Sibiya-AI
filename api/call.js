import * as LK from "livekit-server-sdk";
import { verifyFirebaseToken } from "../lib/auth.js";

const { AccessToken, RoomServiceClient } = LK;

const PROJECT_ID = "sibiya-ai";
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function verifyUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return verifyFirebaseToken(token);
}

async function readDoc(path, token) {
  try {
    const r = await fetch(`${FS}/${path}`, { headers: { Authorization: "Bearer " + token } });
    if (r.status === 404) return { exists: false, fields: {}, error: false };
    if (!r.ok) throw new Error(`firestore get ${r.status}`);
    const d = await r.json();
    return { exists: true, fields: d.fields || {}, error: false };
  } catch {
    return { exists: false, fields: {}, error: true };
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
    const rawCode = String(body.code || "").trim();
    if (!/^[A-Za-z0-9-]{6,40}$/.test(rawCode)) {
      return res.status(400).json({ error: "Invalid group code." });
    }
    const code = rawCode.toLowerCase();
    const roomName = "sibiya-" + code;

    const memberDoc = await readDoc(`chats/${rawCode}/members/${encodeURIComponent(user.uid)}`, user.token);
    if (memberDoc.error) {
      return res.status(500).json({ error: "Could not verify group membership." });
    }
    const member = memberDoc.exists ? memberDoc.fields : null;
    if (member && member.removed && member.removed.booleanValue === true) {
      return res.status(403).json({ error: "The host removed you from this group." });
    }
    const muted = !!(member && member.muted && member.muted.booleanValue === true);

    const metaDoc = await readDoc(`chats/${rawCode}/info/meta`, user.token);
    if (metaDoc.error) {
      return res.status(500).json({ error: "Could not verify group settings." });
    }
    const mf = metaDoc.exists ? (metaDoc.fields || {}) : {};
    const hostUid = (mf.hostUid && mf.hostUid.stringValue) || "";
    const coHosts = ((mf.coHosts && mf.coHosts.arrayValue && mf.coHosts.arrayValue.values) || [])
      .map(v => v.stringValue)
      .filter(Boolean);
    const locked = !!(mf.locked && mf.locked.booleanValue === true);
    const isHost = !!hostUid && hostUid === user.uid;
    const isCoHost = coHosts.includes(user.uid);

    if (locked && !member && !isHost) {
      return res.status(403).json({ error: "This group is locked by the host." });
    }

    const action = String(body.action || "join");

    if (action === "end" || action === "kick") {
      if (!isHost && !isCoHost) {
        return res.status(403).json({ error: "Only the host or a co-host can do that." });
      }
      const svc = new RoomServiceClient(url.replace(/^ws/, "http"), key, secret);
      try {
        if (action === "end") {
          await svc.deleteRoom(roomName);
        } else {
          const target = String(body.target || "").slice(0, 128);
          if (target === hostUid) {
            return res.status(403).json({ error: "The host can't be removed." });
          }
          if (!isHost && coHosts.includes(target)) {
            return res.status(403).json({ error: "Only the host can remove a co-host." });
          }
          if (target) await svc.removeParticipant(roomName, target);
        }
      } catch {
        // the call may already be empty, which is fine
      }
      return res.status(200).json({ ok: true });
    }

    const name =
      String(body.name || user.name || "Guest")
        .replace(/[^\p{L}\p{N} .'_-]/gu, "")
        .trim()
        .slice(0, 24) || "Guest";

    const staff = isHost || isCoHost;
    const role = isHost ? "host" : isCoHost ? "co-host" : "member";

    const grant = {
      roomJoin: true,
      room: roomName,
      canPublish: !muted,
      canSubscribe: true,
    };
    const TS = LK.TrackSource;
    if (TS && TS.MICROPHONE !== undefined) {
      grant.canPublishSources = [TS.MICROPHONE, TS.CAMERA];
      if (staff) grant.canPublishSources.push(TS.SCREEN_SHARE, TS.SCREEN_SHARE_AUDIO);
    }

    const at = new AccessToken(key, secret, { identity: user.uid, name, ttl: 21600 });
    at.addGrant(grant);
    const token = await at.toJwt();

    return res.status(200).json({ token, url, role, canScreenShare: staff && !muted, muted });
  } catch (error) {
    console.error("Sibiya AI call error:", error);
    return res.status(500).json({ error: "Couldn't start the call." });
  }
}
