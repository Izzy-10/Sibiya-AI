// Lets the server read and write Firestore as the app itself (not as a user).
// Needs one Vercel variable: FIREBASE_SERVICE_ACCOUNT (the service account key JSON).
import crypto from "node:crypto";

const PROJECT_ID = "sibiya-ai";
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

let account = null;
let cached = null;

function loadAccount() {
  if (account) return account;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const a = JSON.parse(raw);
    if (!a.client_email || !a.private_key) return null;
    a.private_key = String(a.private_key).replace(/\\n/g, "\n");
    account = a;
    return account;
  } catch {
    return null;
  }
}

const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");

// Returns an access token, or null when the service account is not set up.
export async function adminToken() {
  const a = loadAccount();
  if (!a) return null;
  if (cached && cached.exp - Date.now() > 60000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "RS256", typ: "JWT" });
  const claims = b64({
    iss: a.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });
  const sig = crypto.createSign("RSA-SHA256").update(head + "." + claims).sign(a.private_key).toString("base64url");

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: head + "." + claims + "." + sig,
    }),
  });
  if (!r.ok) return null;
  const d = await r.json();
  cached = { token: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return cached.token;
}

function decode(v) {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) return decodeFields(v.mapValue.fields || {});
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decode);
  return null;
}

function decodeFields(fields) {
  const out = {};
  for (const k of Object.keys(fields || {})) out[k] = decode(fields[k]);
  return out;
}

// Reads one document. Returns null if it does not exist.
export async function getDocument(path, token) {
  const r = await fetch(`${FS}/${path}`, { headers: { Authorization: "Bearer " + token } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("firestore get " + r.status);
  const d = await r.json();
  return decodeFields(d.fields || {});
}

// Newest messages of a group, newest first.
export async function recentMessages(code, count, token) {
  const r = await fetch(`${FS}/chats/${code}:runQuery`, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "messages" }],
        orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
        limit: count,
      },
    }),
  });
  if (!r.ok) throw new Error("firestore query " + r.status);
  const rows = await r.json();
  return rows.filter(x => x.document).map(x => decodeFields(x.document.fields || {}));
}

// Posts a message from Sibiya AI into a group.
export async function addAiMessage(code, text, token) {
  const r = await fetch(`${FS}/chats/${code}/messages`, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        text: { stringValue: String(text).slice(0, 4000) },
        uid: { stringValue: "sibiya-ai" },
        name: { stringValue: "Sibiya AI" },
        ai: { booleanValue: true },
        createdAt: { timestampValue: new Date().toISOString() },
      },
    }),
  });
  if (!r.ok) throw new Error("firestore write " + r.status);
}
