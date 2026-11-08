import chatHandler from "./chat.js";
import { verifyFirebaseToken } from "../lib/auth.js";

// Keep /api/chat's existing implementation, but enforce visitor-only access
// before it can call the AI provider or process a group AI request.
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
      return res.status(403).json({
        error: "Public AI access is not available to the founder/admin account.",
      });
    }
  }

  return chatHandler(req, res);
}
