// Checks a Firebase sign-in token on the server, without using the Firebase API key.
// It verifies the token's signature against Google's public certificates, so it keeps
// working even when the API key is restricted to your website.
import crypto from "node:crypto";

const PROJECT_ID = "sibiya-ai";
const CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

let certs = null;
let certsAt = 0;

async function getCerts(force) {
  if (!force && certs && Date.now() - certsAt < 60 * 60 * 1000) return certs;
  const r = await fetch(CERTS_URL);
  if (!r.ok) throw new Error("certs " + r.status);
  certs = await r.json();
  certsAt = Date.now();
  return certs;
}

function readPart(part) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

export async function verifyFirebaseToken(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;

    const header = readPart(parts[0]);
    const payload = readPart(parts[1]);
    if (header.alg !== "RS256" || !header.kid) return null;

    let list = await getCerts(false);
    let cert = list[header.kid];
    if (!cert) {
      list = await getCerts(true);
      cert = list[header.kid];
    }
    if (!cert) return null;

    const validSignature = crypto
      .createVerify("RSA-SHA256")
      .update(parts[0] + "." + parts[1])
      .verify(cert, Buffer.from(parts[2], "base64url"));
    if (!validSignature) return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.aud !== PROJECT_ID) return null;
    if (payload.iss !== "https://securetoken.google.com/" + PROJECT_ID) return null;
    if (!payload.sub || typeof payload.sub !== "string") return null;
    if (typeof payload.exp !== "number" || payload.exp <= now) return null;
    if (typeof payload.iat !== "number" || payload.iat > now + 300) return null;

    const fb = payload.firebase || {};
    return {
      uid: payload.sub,
      email: String(payload.email || "").toLowerCase(),
      verified: payload.email_verified === true,
      name: payload.name || "",
      google: fb.sign_in_provider === "google.com",
      token,
    };
  } catch {
    return null;
  }
}
