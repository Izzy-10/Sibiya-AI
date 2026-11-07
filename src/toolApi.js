import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, getToken } from "./firebase.js";

const OWNER_EMAIL = "sizwescelimpilo5@gmail.com";
const MASTER_KEY_STORAGE = "sibiya_master_key";

function decodeToken(token) {
  try {
    const p = http://token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return http://JSON.parse(atob(p));
  } catch {
    return {};
  }
}

export function getMasterKey() {
  try {
    return http://localStorage.getItem(MASTER_KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

export function isMaster(token) {
  try {
    const email = (decodeToken(token).email || "").toLowerCase();
    return email === OWNER_EMAIL.toLowerCase() || !!getMasterKey();
  } catch {
    return false;
  }
}

export async function callTool(body) {
  const token = await getToken();
  const master = isMaster(token);
  const mkey = getMasterKey();

  const res = await fetch("/api/tool", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
      ...(mkey ? { "X-Master-Key": mkey } : {}),
      ...(master ? { "X-Is-Owner": "true" } : {}),
    },
    body: http://JSON.stringify({
      ...body,
      _isOwner: master,
      _ownerEmail: OWNER_EMAIL,
    }),
  });

  const data = await http://res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || "Server error " + http://res.status);
  }
  return data || {};
}

export function uidFromToken(token) {
  try {
    return decodeToken(token).sub || decodeToken(token).user_id || null;
  } catch {
    return null;
  }
}

export async function currentUid() {
  try {
    return uidFromToken(await getToken());
  } catch {
    return null;
  }
}

export function savedName() {
  try {
    return http://localStorage.getItem("sibiya_name") || "";
  } catch {
    return "";
  }
}

export function savedGroups() {
  try {
    const a = http://JSON.parse(localStorage.getItem("sibiya_groups") || "[]");
    return http://Array.isArray(a) ? http://a.filter(g => g && typeof http://g.code === "string") : [];
  } catch {
    return [];
  }
}

export async function postNotice(code, uid, name, text) {
  await addDoc(collection(db, "chats", code, "messages"), {
    text: String(text).slice(0, 500),
    uid,
    name,
    ai: false,
    type: "notice",
    createdAt: serverTimestamp(),
  });
}

export function copyToClipboard(text) {
  try {
    return http://navigator.clipboard.writeText(text);
  } catch {
    return http://Promise.reject();
  }
}
