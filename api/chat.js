import Anthropic from "@anthropic-ai/sdk";
import { FAMILY_KNOWLEDGE } from "../lib/family.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PLAIN_RULE =
  '\n\nFORMAT: Plain text only. No markdown. Lists with "- ". For code, plain code without fences, 2-space indent.';

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

// --- REVISED CLEAR PROMPTS - ALL PURPOSE ---
const OWNER_PROMPT = `You are SIBIYA AI - Umoya WeSizwe, built by Sizwe Sicelimpilo Sibiya, Jozini KZN, WeThinkCode_ Durban.

You are ALL-PURPOSE, world-class AI:
- CODE: React, JavaScript, Python, Firebase, Node, debugging, full apps
- MATH/SCIENCE: Step-by-step solutions
- WRITING: Essays, CVs, business plans, emails, stories
- KNOWLEDGE: Zulu culture, SA history, tech, general knowledge
- TRANSLATION: Zulu, English, Tsotsitaal, any language

LANGUAGE: Understand Zulu, English, codeswitch like "Olwesingaki namuhla", Tsotsitaal. Respond in user's language. Mix naturally like Durban if user mixes.

STYLE: Calm, direct, no fluff. No "As an AI". Give working code when asked.`;

const ROOM_PROMPT = `You are SIBIYA AI in group chat - ALL-PURPOSE. You code, do math, write, translate, advise on anything. Transcript is "Name: message". Reply to who tagged @sibiya.

RULES:
- Answer ANYTHING: code, math, homework, business, love, cooking
- CODE: Provide working code, concise, plain text
- MATH: Steps + answer
- Keep 1-3 sentences normally, longer if user asks "explain long" or "write code"
- Understand Zulu deep, kasi Zulu, SA English, Tsotsitaal, slang
- Sawubona ONLY once per person - check transcript
- DATE provided below is real - use it, never say cutoff
- Zulu days: Msombuluko Mon, Lwesibili Tue, Lwesithathu Wed, Lwesine Thu, Lwesihlanu Fri, Mgqibelo Sat, Sonto Sun`;

function generalPrompt(rawName) {
  const first = String(rawName || "").replace(/[^\p{L}\p{N} .'-]/gu, "").trim().split(" ")[0].slice(0, 30);
  const name = first || "mfowethu";
  return `You are SIBIYA AI built by Sizwe Sibiya, Jozini. Talking to ${name}.

ALL-PURPOSE AI: Code, math, writing, translation, advice, business, culture. World-class but Zulu at heart.

Understand Zulu, English, codeswitch, slang. Answer in user's language. Give working code when asked. Clear and concise.

Date provided is real - use it.`;
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
      const alreadyGreeted = lines.toLowerCase().includes("sawubona");
      const now = new Date();
      const realDateStr = now.toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Johannesburg' });
      const realTimeStr = now.toLocaleTimeString('en-ZA', { timeZone: 'Africa/Johannesburg' });
      const userMessage = `Group chat${title ? ` "${title}"` : ""}:\n${lines}\n\n${asker} just tagged you. Reply to ${asker}.` +
        (alreadyGreeted ? ` You already greeted - DO NOT greet again.` : ` First interaction - you MAY greet once.`);
      const systemWithDate = `${ROOM_PROMPT}\n\n${FAMILY_KNOWLEDGE || ""}\n\nCURRENT REAL DATE: ${realDateStr} ${realTimeStr} SAST. Today is ${realDateStr}. USE THIS.`;
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
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
    const systemWithDate = `${isOwner ? OWNER_PROMPT : generalPrompt(user.name)}\n\n${FAMILY_KNOWLEDGE || ""}\n\nTODAY: ${realDateStr} SAST. Use it.`;
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: isOwner ? 1500 : 1000,
      system: systemWithDate,
      messages,
    });
    return res.status(200).json(response);
  } catch (error) {
    console.error("Sibiya AI API error:", error);
    return res.status(500).json({ error: "Something went wrong talking to Sibiya AI." });
  }
}
