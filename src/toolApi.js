import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, getToken } from "./firebase.js";

var OWNER_EMAIL = "sizwescelimpilo5@gmail.com";
var MASTER_KEY_STORAGE = "sibiya_master_key";

function decodeToken(token) {
  try {
    var p = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(p));
  } catch (e) {
    return {};
  }
}

function getMasterKey() {
  try {
    return localStorage.getItem(MASTER_KEY_STORAGE) || "";
  } catch (e) {
    return "";
  }
}

function isMaster(token) {
  try {
    var email = (decodeToken(token).email || "").toLowerCase();
    return email === OWNER_EMAIL.toLowerCase() || !!getMasterKey();
  } catch (e) {
    return false;
  }
}

export async function callTool(body) {
  var token = await getToken();
  var master = isMaster(token);
  var mkey = getMasterKey();

  var headers = {};
  headers["Content-Type"] = "application/json";
  headers["Authorization"] = "Bearer " + token;
  if (mkey) headers["X-Master-Key"] = mkey;
  if (master) headers["X-Is-Owner"] = "true";

  var payload = {};
  Object.assign(payload, body);
  payload._isOwner = master;
  payload._ownerEmail = OWNER_EMAIL;

  var res = await fetch("/api/tool", {
    method: "POST",
    headers: headers,
    body: JSON.stringify(payload)
  });

  var data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }

  if (!res.ok) {
    var msg = (data && data.error) ? data.error : "Server error " + res.status;
    throw new Error(msg);
  }
  return data || {};
}

export function uidFromToken(token) {
  try {
    var d = decodeToken(token);
    return d.sub || d.user_id || null;
  } catch (e) {
    return null;
  }
}

export async function currentUid() {
  try {
    var t = await getToken();
    return uidFromToken(t);
  } catch (e) {
    return null;
  }
}

export function savedName() {
  try {
    return localStorage.getItem("sibiya_name") || "";
  } catch (e) {
    return "";
  }
}

export function savedGroups() {
  try {
    var a = JSON.parse(localStorage.getItem("sibiya_groups") || "[]");
    if (!Array.isArray(a)) return [];
    return a.filter(function(g) { return g && typeof g.code === "string"; });
  } catch (e) {
    return [];
  }
}

export async function postNotice(code, uid, name, text) {
  await addDoc(collection(db, "chats", code, "messages"), {
    text: String(text).slice(0, 500),
    uid: uid,
    name: name,
    ai: false,
    type: "notice",
    createdAt: serverTimestamp()
  });
}

export function copyToClipboard(text) {
  try {
    return navigator.clipboard.writeText(text);
  } catch (e) {
    return Promise.reject();
  }
}
