import chatHandler from "./chat.js";
import { verifyFirebaseToken } from "../lib/auth.js";

// Keep /api/chat's existing implementation while allowing the founder/admin account.
export default async function visitorChat(req, res) {
  if (req.method !== "POST") {
    return chatHandler(req, res);
  }

  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const user = await verifyFirebaseToken(token);

  if (user) {
    const ownerEmail = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
    const isOwner = !!ownerEmail && user.verified && user.email === ownerEmail;

    if (isOwner) {
      // allow founder/admin access to the public AI
      return chatHandler(req, res);
    }
  }

  return chatHandler(req, res);
}
