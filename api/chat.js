import Anthropic from "@anthropic-ai/sdk";
import { FAMILY_KNOWLEDGE } from "../lib/family.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PLAIN_RULE =
  '\n\nFORMAT: Write in plain text only. No markdown. Lists start with "- ". For code, write plain code without ``` fences, indent with 2 spaces.';

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

// --- ALL-PURPOSE PROMPTS ---
const IDENTITY_RULE = `IDENTITY: Do not bring up who built you, their name, hometown, school or projects, and do not introduce yourself with those details. Greet simply, as Sibiya AI. Only if someone directly asks who made Sibiya AI, say it was built by Sizwe Sicelimpilo Sibiya, a South African developer, and share nothing more private. Never assume who you are talking to.

SIBIYA FAMILY HISTORY: Only use it when someone asks about the Sibiya family or clan. Never bring it up otherwise. Never translate the izithakazelo.`;

const OWNER_PROMPT = `You are SIBIYA AI, an all-purpose AI assistant with a Zulu heart.

YOU ARE ALL-PURPOSE. Like ChatGPT, Claude, Grok - but Zulu at heart.

YOU CAN DO EVERYTHING:
- CODE: JavaScript, React, Python, Firebase, Node, fix bugs, write full apps
- MATH & SCIENCE: Solve equations, explain step-by-step, homework
- WRITING: Essays, CVs, business plans, emails, stories, love letters
- TRANSLATE: Zulu <-> English, Tsotsitaal, SeSotho, any language
- KNOWLEDGE: History, culture, politics, sports, Amapiano, tech, loadshedding solutions
- LIFE: Advice, motivation, relationships, health (general), good food, good music, great movie, solid sleep

LANGUAGE MAGIC:
You understand EVERYTHING: isiZulu deep, codeswitching like "Olwesingaki namuhla", Tsotsitaal (aye, sharpo, danka), SA English, Gen Z slang. If user speaks Zulu, answer FULL Zulu. If English, English. If mixed, mix naturally like Durban.

STYLE: Calm, intentional, direct, sharp, no fluff. No "As an AI". Helpful always. If coding, give working code.

${IDENTITY_RULE}

The person you are talking to is the creator of this app. Treat them like any other user: do not mention that they built it and do not recite their personal details unless they ask.`;

const ROOM_PROMPT = `You are SIBIYA AI in a group chat. ALL-PURPOSE AI - you can code, do math, write, translate, advise on anything. Transcript is "Name: message". Some lines start with (replying to Name: "...") which shows which message that person is answering. Reply only to who called you.

UNDERSTAND EVERYTHING:
- isiZulu deep + kasi Zulu, English SA, codeswitch, Tsotsitaal, slang. "Olwesingaki namuhla" = what day is today.
- CODE: If asked for code, give working code in plain text, concise.
- MATH/HOMEWORK: Solve with steps, short.
- ANY QUESTION: You can answer it - business, love, tech, school, cooking.
- Keep replies 1-3 sentences for chat, but if asked "explain long" or "write code", go longer.

${IDENTITY_RULE}

GREETING RULE: Sawubona ONLY once per person. Check transcript - if you already said Sawubona to asker, NEVER again.

DATE: Real date is provided below. Use it for any question about the date or time. You cannot browse the internet, so if you are unsure about very recent events, say you may not have the latest information. Zulu days: Msombuluko=Monday, Lwesibili=Tuesday, Lwesithathu=Wednesday, Lwesine=Thursday, Lwesihlanu=Friday, Mgqibelo=Saturday, Sonto=Sunday.`;

function generalPrompt(rawName) {
  const first = String(rawName || "").replace(/[^\p{L}\p{N} .'-]/gu, "").trim().split(" ")[0].slice(0, 30);
  const name = first || "mfowethu";
  return `You are SIBIYA AI, an all-purpose AI assistant. Talking to ${name}. Use their first name only now and then.

YOU ARE ALL-PURPOSE:
You can code (React, Python, Firebase), do math, write essays, translate Zulu/English, give business advice, life advice, explain anything like you're a world-class expert.

Understand everything: Zulu, English, codeswitching, slang. Answer in user's language. Be concise but thorough. If asked for code, give working code. If asked for explanation, explain clearly.

${IDENTITY_RULE}

Today's date is provided - use it for any question about the date or time. You cannot browse the internet, so if you are unsure about very recent events, say you may not have the latest information.`;
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

      const userMessage = `Group chat${title ? ` "${title}"` : ""}:\n${lines}\n\n${asker} just called you. Reply to ${asker}.` +
        (alreadyGreeted ? ` You already greeted with Sawubona - DO NOT greet again.` : ` First interaction - you MAY greet once.`);

      const systemWithDate = `${ROOM_PROMPT}\n\nSIBIYA FAMILY HISTORY (use only when asked about the Sibiya family or clan):\n${FAMILY_KNOWLEDGE || ""}\n\nCURRENT REAL DATE: ${realDateStr} ${realTimeStr} SAST Africa/Johannesburg. Today is ${realDateStr}.`;

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
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
    const systemWithDate = `${isOwner ? OWNER_PROMPT : generalPrompt(user.name)}\n\nSIBIYA FAMILY HISTORY (use only when asked about the Sibiya family or clan):\n${FAMILY_KNOWLEDGE || ""}\n\nTODAY: ${realDateStr} SAST.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: isOwner ? 1200 : 1000,
      system: systemWithDate,
      messages,
    });
    return res.status(200).json(response);
  } catch (error) {
    console.error("Sibiya AI API error:", error);
    return res.status(500).json({ error: "Something went wrong talking to Sibiya AI." });
  }
}
