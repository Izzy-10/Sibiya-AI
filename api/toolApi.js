import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, getToken } from "./firebase.js";

// Calls the server for AI jobs: izibongo, catch me up, quiz questions, stokvel reminders
export async function callTool(body) {
  const token = await getToken();
  const res = await fetch("/api/tool", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (data && data.error) throw new Error(data.error);
    // the server did not answer with a normal message: say what happened
    if (res.status === 404) throw new Error("This tool isn't on the server yet (error 404). Check that api/tool.js is in the api folder.");
    if (res.status === 504 || res.status === 408) throw new Error("That took too long (error " + res.status + "). Try again in a moment.");
    throw new Error("The server had a problem (error " + res.status + "). Try again.");
  }
  return data || {};
}

export function uidFromToken(token) {
  try {
    const part = String(token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part)).sub || null;
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
    return localStorage.getItem("sibiya_name") || "";
  } catch {
    return "";
  }
}

// Groups this device has opened (the same list the lobby shows)
export function savedGroups() {
  try {
    const a = JSON.parse(localStorage.getItem("sibiya_groups") || "[]");
    return Array.isArray(a) ? a.filter(g => g && typeof g.code === "string") : [];
  } catch {
    return [];
  }
}

// A small grey line in the group chat, like "Mudesi started a quiz"
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
