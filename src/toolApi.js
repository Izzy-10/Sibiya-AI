import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, getToken } from "./firebase.js";

const OWNER_EMAIL = "sizwescelimpilo5@gmail.com";

function decodeToken(token) {
  try {
    const p = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(p));
  } catch {
    return {};
  }
}

function getTokenClaims(token) {
  try {
    return decodeToken(token);
  } catch {
    return {};
  }
}

export async function callTool(body) {
  const token = await getToken();
  const headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer " + token,
  };

  const res = await fetch("/api/tool", {
    method: "POST",
    headers,
    body: JSON.stringify(body || {}),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg = data && data.error ? data.error : "Server error " + res.status;
    throw new Error(msg);
  }

  return data || {};
}

export function uidFromToken(token) {
  try {
    const d = getTokenClaims(token);
    return d.sub || d.user_id || null;
  } catch {
    return null;
  }
}

export async function currentUid() {
  try {
    const token = await getToken();
    return uidFromToken(token);
  } catch {
    return null;
  }
}

export function savedName() {
  try {
    return localStorage.getItem("sibiya_name") || "";
  } catch {
    return "";
  }
}

export function savedGroups() {
  try {
    const parsed = JSON.parse(localStorage.getItem("sibiya_groups") || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(g => g && typeof g.code === "string");
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
    return navigator.clipboard.writeText(text);
  } catch {
    return Promise.reject();
  }
}

export function isOwnerToken(token) {
  try {
    const email = (getTokenClaims(token).email || "").toLowerCase();
    return email === OWNER_EMAIL.toLowerCase();
  } catch {
    return false;
  }
}
