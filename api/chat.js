import Anthropic from "@anthropic-ai/sdk";
import { FAMILY_KNOWLEDGE } from "../lib/family.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PLAIN_RULE =
  '\n\nFORMAT: Write in plain text only. No markdown. Lists start with "- ".';

function plainText(t) {
  return String(t || "")
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/__([\s\S]+?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*\*\s+/gm, "- ")
    .replace(/`([^`]+)`/g, "$1");
}

const anthropic = {
  messages: {
    create: async params => {
      const response = await client.messages.create({
        ...params,
        system: params.system + PLAIN_RULE,
      });
      response.content = (response.content || []).map(b =>
        b.type === "text" ? { ...b, text: plainText(b.text) } : b
      );
      return response;
    },
  },
};

const FIREBASE_API_KEY = "AIzaSyByw2cQQXcWjVl2ESpiPJ32-6VLETvBOx0";
const OWNER_EMAIL = (process.env.OWNER_EMAIL || "").trim().toLowerCase();

const hits = new Map();
function tooMany(key, limit) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter(t => now - t < 60000);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > limit;
}
function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
}

const ALLOWED_BLOCKS = new Set(["text", "image", "document"]);
function cleanMessages(list, keep) {
  return (Array.isArray(list) ? list : [])
    .filter(m => m && (m.role === "user" || m.role === "assistant"))
    .map(m => {
      if (typeof m.content === "string") {
        const text = m.content.slice(0, 8000);
        return text.trim() ? { role: m.role, content: text } : null;
      }
      if (Array.isArray(m.content)) {
        const blocks = m.content
          .filter(b => b && ALLOWED_BLOCKS.has(b.type))
          .map(b => (b.type === "text" ? { type: "text", text: String(b.text || "").slice(0, 8000) } : b))
          .filter(b => b.type !== "text" || b.text.trim());
        return blocks.length ? { role: m.role, content: blocks } : null;
      }
      return null;
    })
    .filter(Boolean)
    .slice(keep);
}

// --- PROMPTS THAT UNDERSTAND EVERYTHING ---
const OWNER_PROMPT = `You are Sibiya AI - Umoya WeSizwe, built by Sizwe Sicelimpilo Sibiya from Jozini, KZN. WeThinkCode_ Durban, DevMzansi founder.

You understand EVERYTHING: isiZulu, English, codeswitching like "Olwesingaki namuhla", Tsotsitaal (aye, sharpo, danka), SA English, Gen Z slang. If user speaks Zulu, answer FULL Zulu. If English, English. If mixed, mix naturally like Durban.

Philosophy: good food, good music, great movie, solid sleep - calm, intentional. Direct, sharp, no fluff.`;

const ROOM_PROMPT = `You are Sibiya AI in a group chat. Transcript is "Name: message". Reply only to who tagged @sibiya.

UNDERSTAND EVERYTHING:
- isiZulu deep + kasi Zulu, English SA, codeswitch, Tsotsitaal, slang. "Olwesingaki namuhla" = what day is today. "Ungisiza ngani" = how can you help.
- SA context: Durban, Jozini, WeThinkCode_, loadshedding, Amapiano, kasi.
- Keep replies 1-3 sentences max.

GREETING RULE: Sawubona ONLY once per person. Check transcript - if you already said Sawubona to asker, NEVER again.

DATE: Real date is provided below. Use it. Never say knowledge cutoff. Zulu days: Msombuluko=Monday, Lwesibili=Tuesday, Lwesithathu=Wednesday, Lwesine=Thursday, Lwesihlanu=Friday, Mgqibelo=Saturday, Sonto=Sunday.`;

function generalPrompt(rawName) {
  const first = String(rawName || "").replace(/[^\p{L}\p{N} .'-]/gu, "").trim().split(" ")[0].slice(0, 30);
  const name = first || "mfowethu";
  return `You are Sibiya AI built by Sizwe Sibiya from Jozini. Talking to ${name}. Not Sizwe.

You understand everything: Zulu, English, codeswitching, slang. Answer in user's language. Keep calm, concise, helpful. Today's date is provided - use it, never say cutoff.`;
}

async function verifyUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json", Referer: "https://sibiya-ai.vercel.app/" }, body: JSON.stringify({ idToken: token }) }
    );
    if (!r.ok) return null;
    const data = await r.json();
    const u = data.users && data.users[0];
    if (!u) return null;
    return {
      uid: u.localId,
      email: (u.email || "").toLowerCase(),
      verified: u.emailVerified === true,
      name: u.displayName || "",
      google: (u.providerUserInfo || []).some(p => p.providerId === "google.com"),
    };
  } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Please sign in." });
  if (tooMany("u:" + user.uid, 30) || tooMany("ip:" + clientIp(req), 60)) {
    return res.status(429).json({ error: "Too many messages. Wait a minute." });
  }

  try {
    const body = req.body || {};

    if (body.mode === "room") {
      const lines = (Array.isArray(body.transcript) ? body.transcript : [])
        .filter(m => m && typeof m === "object").slice(-20)
        .map(m => `${String(m.name || "Someone").slice(0, 24)}: ${String(m.text || "").slice(0, 1000)}`).join("\n");
      const asker = String(body.asker || "Someone").slice(0, 24);
      const title = String(body.title || "").slice(0, 40);

      const lowerLines = lines.toLowerCase();
      const alreadyGreeted = lowerLines.includes("sawubona");

      const now = new Date();
      const realDateStr = now.toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Johannesburg' });
      const realTimeStr = now.toLocaleTimeString('en-ZA', { timeZone: 'Africa/Johannesburg' });

      const userMessage = `Group chat${title ? ` "${title}"` : ""}:\n${lines}\n\n${asker} just tagged you. Reply to ${asker}.` +
        (alreadyGreeted ? ` You already greeted with Sawubona - DO NOT greet again.` : ` First interaction - you MAY greet once.`);

      const systemWithDate = `${ROOM_PROMPT}\n\n${FAMILY_KNOWLEDGE || ""}\n\nCURRENT REAL DATE: ${realDateStr} ${realTimeStr} SAST Africa/Johannesburg. Today is ${realDateStr}. USE THIS. Never say cutoff.`;

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 600,
        system: systemWithDate,
        messages: [{ role: "user", content: userMessage }],
      });
      return res.status(200).json(response);
    }

    if (!user.google) return res.status(403).json({ error: "Sign in with Google." });

    const isOwner = !!OWNER_EMAIL && user.verified && user.email === OWNER_EMAIL;
    let messages = cleanMessages(body.messages, isOwner ? -40 : -20);
    while (messages.length && messages[0].role !== "user") messages.shift();
    if (!messages.length) return res.status(400).json({ error: "No message." });

    const now = new Date();
    const realDateStr = now.toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Johannesburg' });
    const systemWithDate = `${isOwner ? OWNER_PROMPT : generalPrompt(user.name)}\n\n${FAMILY_KNOWLEDGE || ""}\n\nTODAY: ${realDateStr} SAST. Use it. Never say cutoff.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: isOwner ? 1000 : 700,
      system: systemWithDate,
      messages,
    });
    return res.status(200).json(response);
  } catch (error) {
    console.error("Sibiya AI API error:", error);
    return res.status(500).json({ error: "Something went wrong talking to Sibiya AI." });
  }
}
