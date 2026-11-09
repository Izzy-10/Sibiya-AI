import Anthropic from "@anthropic-ai/sdk";
import { FAMILY_KNOWLEDGE } from "../lib/family.js";
import { verifyFirebaseToken } from "../lib/auth.js";
import { adminToken, getDocument, recentMessages, addAiMessage } from "../lib/admin.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PLAIN_RULE =
  '\n\nFORMAT: Write in plain text only. No markdown. Lists start with "- ". For code, write plain code without ``` fences, indent with 2 spaces.';

// Cleans markdown out of ordinary text, but leaves code and files exactly as written
// (so Python comments, x**2, __init__ and template strings are not damaged).
function cleanProse(t) {
  return t
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/__([\s\S]+?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*\*\s+/gm, "- ")
    .replace(/`([^`]+)`/g, "$1");
}

function plainText(t) {
  const s = String(t || "");
  const re = /(\[\[FILE:[^\]\n]*\]\][\s\S]*?(?:\[\[\/FILE\]\]|$))|(```[a-z0-9_+-]*\n?[\s\S]*?(?:```|$))/gi;
  const parts = [];
  let last = 0;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m[0].length === 0) { re.lastIndex++; continue; }
    if (m.index > last) parts.push(cleanProse(s.slice(last, m.index)));
    if (m[1]) {
      // a file block: keep the content, only remove ``` lines the model may have added inside it
      parts.push(
        m[1]
          .replace(/(\[\[FILE:[^\]\n]*\]\]\n?)```[a-z0-9_+-]*\n?/i, "$1")
          .replace(/\n?```[ \t]*(\n?\[\[\/FILE\]\])/i, "$1")
      );
    } else {
      // a code block: keep the code, drop the ``` lines
      parts.push(m[2].replace(/^```[a-z0-9_+-]*\n?/i, "").replace(/\n?```$/, ""));
    }
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push(cleanProse(s.slice(last)));
  return parts.join("");
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

// --- SECURE: No hardcoded keys ---
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
const OWNER_EMAIL = (process.env.OWNER_EMAIL || "").trim().toLowerCase();

if (!FIREBASE_API_KEY) {
  console.warn("WARNING: FIREBASE_API_KEY env var not set");
}

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

const OWNER_PROMPT = `You are SIBIYA AI - Umoya WeSizwe, built by Sizwe Sicelimpilo Sibiya from Jozini, KZN. WeThinkCode_ Durban, DevMzansi founder.
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
// --- ALL-PURPOSE PROMPTS ---
const THINKING_RULE = `HOW TO ANSWER: When you answer a question, brainstorm first. Think through what the person may mean, consider more than one option or angle, and give your best reasoning with concrete suggestions and next steps. Do not just say you do not know. If you truly lack a fact, say what you do know, give your best guess clearly marked as a guess, and tell them exactly where or how to find out. Keep casual replies short, and go deeper when the question needs it.`;

const FILE_RULE = `FILES: You CAN create files for the person. When they ask for a file, or to share, save or download code, a document, a CV, a script, a table or any text content as a file, put the complete content inside a file block, exactly like this, with the markers on their own lines:
[[FILE: gpa_calculator.py]]
...the full content, unchanged...
[[/FILE]]
Choose a clear file name with the right extension (.py, .js, .html, .css, .txt, .md, .csv, .json). The app turns the block into a file card with Download, Share and Copy buttons. Write one short sentence before or after the block. Never say you cannot create or share files. Use one block per file, and do not put code fences inside a block. When you write more than about 15 lines of code, also put it in a file block so the person can download it.`;

const CREATOR_INFO = `ABOUT THE CREATOR (share this only when someone asks who made Sibiya AI, who Sizwe is, or how to find, contact or ask him; never bring him up otherwise):
Sibiya AI was built by Sizwe Sicelimpilo Sibiya, a South African developer from Jozini, KwaZulu-Natal, now based in Durban. There are many people named Sizwe Sibiya, so always use his full name and say he is the developer. He is a software development student at WeThinkCode_ Durban, the founder of DevMzansi (a free community for young South African developers) and a co-founder of Sim Wear (a South African streetwear brand). He works with HTML, CSS and JavaScript and is learning Python and Java. His GitHub is Izzy-10 (github.com/Izzy-10) and his portfolio is izzy-10.github.io.
If someone wants to know more about him, find him, contact him or ask him directly, tell them warmly to follow him on his social media accounts, and name them:
- TikTok: @sizwesibiya7 (tiktok.com/@sizwesibiya7)
- Instagram: @mudes2026 (instagram.com/mudes2026)
- Facebook: facebook.com/sizwe.sbiya.5439
Share only these public details. Never share anything private about him or anyone close to him, and never guess other details.`;

const IDENTITY_RULE = `IDENTITY: Greet simply, as Sibiya AI. Do not bring up who built you, their name, hometown, school or projects unless someone asks about them. Never assume who you are talking to.

${CREATOR_INFO}

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

${THINKING_RULE}

${FILE_RULE}

${IDENTITY_RULE}

The person you are talking to is the creator of this app. Treat them like any other user: do not mention that they built it and do not recite their personal details unless they ask.`;

const ROOM_PROMPT = `You are SIBIYA AI in a group chat. ALL-PURPOSE AI - you can code, do math, write, translate, advise on anything. Transcript is "Name: message". Some lines start with (replying to Name: "...") which shows which message that person is answering. Reply only to who called you.

UNDERSTAND EVERYTHING:
- isiZulu deep + kasi Zulu, English SA, codeswitch, Tsotsitaal, slang. "Olwesingaki namuhla" = what day is today.
- CODE: If asked for code, give working code in plain text, concise.
- MATH/HOMEWORK: Solve with steps, short.
- ANY QUESTION: You can answer it - business, love, tech, school, cooking.
- Keep replies 1-3 sentences for chat, but if asked "explain long" or "write code", go longer.

${THINKING_RULE}

${FILE_RULE}

${IDENTITY_RULE}

GREETING RULE: Sawubona ONLY once per person. Check transcript - if you already said Sawubona to asker, NEVER again.

DATE: Real date is provided below. Use it for any question about the date or time. You cannot browse the internet, so if you are unsure about very recent events, say you may not have the latest information. Zulu days: Msombuluko=Monday, Lwesibili=Tuesday, Lwesithathu=Wednesday, Lwesine=Thursday, Lwesihlanu=Friday, Mgqibelo=Saturday, Sonto=Sunday.`;

function generalPrompt(rawName) {
  const first = String(rawName || "").replace(/[^\p{L}\p{N} .'-]/gu, "").trim().split(" ")[0].slice(0, 30);
  const name = first || "mfowethu";
  return `You are SIBIYA AI built by Sizwe Sibiya, Jozini. Talking to ${name}.

ALL-PURPOSE AI: Code, math, writing, translation, advice, business, culture. World-class but Zulu at heart.

Understand Zulu, English, codeswitch, slang. Answer in user's language. Give working code when asked. Clear and concise.

Date provided is real - use it.`;
  return `You are SIBIYA AI, an all-purpose AI assistant. Talking to ${name}. Use their first name only now and then.

YOU ARE ALL-PURPOSE:
You can code (React, Python, Firebase), do math, write essays, translate Zulu/English, give business advice, life advice, explain anything like you're a world-class expert.

Understand everything: Zulu, English, codeswitching, slang. Answer in user's language. Be concise but thorough. If asked for code, give working code. If asked for explanation, explain clearly.

${THINKING_RULE}

${FILE_RULE}

${IDENTITY_RULE}

Today's date is provided - use it for any question about the date or time. You cannot browse the internet, so if you are unsure about very recent events, say you may not have the latest information.`;
}

async function verifyUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  if (!FIREBASE_API_KEY) return null;
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
  return verifyFirebaseToken(token);
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
      const code = String(body.code || "").trim();
      const admin = /^[A-Za-z0-9-]{6,40}$/.test(code) ? await adminToken() : null;

      let lines;
      let asker = String(body.asker || "Someone").slice(0, 24);
      let title = String(body.title || "").slice(0, 40);
      let groupDescription = "";
      let expireSeconds = 0;

      if (admin) {
        // The server checks that this person may ask, and reads the group itself.
        const [member, meta] = await Promise.all([
          getDocument(`chats/${code}/members/${encodeURIComponent(user.uid)}`, admin),
          getDocument(`chats/${code}/info/meta`, admin),
        ]);
        if (member && member.removed === true) {
          return res.status(403).json({ error: "The host removed you from this group." });
        }
        if (meta && meta.locked === true && !member) {
          return res.status(403).json({ error: "This group is locked by the host." });
        }
        if (meta && meta.aiEnabled === false) {
          return res.status(403).json({ error: "The host turned Sibiya AI off in this group." });
        }
        if (member && member.name) asker = String(member.name).slice(0, 24);
        if (meta && meta.title) title = String(meta.title).slice(0, 40);
        if (meta && typeof meta.description === "string") groupDescription = meta.description.slice(0, 500);
        expireSeconds = Number(meta && meta.disappearAfter) || 0;

        const recent = (await recentMessages(code, 20, admin)).reverse();
        lines = recent
          .map(m => {
            const ctx = m.replyTo && m.replyTo.text
              ? `(replying to ${String(m.replyTo.name || "").slice(0, 24)}: "${String(m.replyTo.text).slice(0, 120)}") `
              : "";
            return `${String(m.name || "Someone").slice(0, 24)}: ${ctx}${String(m.text || "").slice(0, 1000)}`;
          })
          .join("\n");
      } else {
        // Older path (service account not set up yet): trust the transcript the app sent.
        lines = (Array.isArray(body.transcript) ? body.transcript : [])
          .filter(m => m && typeof m === "object").slice(-20)
          .map(m => `${String(m.name || "Someone").slice(0, 24)}: ${String(m.text || "").slice(0, 1000)}`).join("\n");
      }

      const lowerLines = lines.toLowerCase();
      const alreadyGreeted = lowerLines.includes("sawubona");

      const now = new Date();
      const realDateStr = now.toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Johannesburg' });
      const realTimeStr = now.toLocaleTimeString('en-ZA', { timeZone: 'Africa/Johannesburg' });

      const userMessage = `Group chat${title ? ` "${title}"` : ""}${groupDescription ? `\nGroup description: ${groupDescription}` : ""}:\n${lines}\n\n${asker} just called you. Reply to ${asker}.` +
        (alreadyGreeted ? ` You already greeted with Sawubona - DO NOT greet again.` : ` First interaction - you MAY greet once.`);

      const systemWithDate = `${ROOM_PROMPT}\n\nSIBIYA FAMILY HISTORY (use only when asked about the Sibiya family or clan):\n${FAMILY_KNOWLEDGE || ""}\n\nCURRENT REAL DATE: ${realDateStr} ${realTimeStr} SAST Africa/Johannesburg. Today is ${realDateStr}.`;

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: systemWithDate,
        messages: [{ role: "user", content: userMessage }],
      });

      if (admin) {
        const reply = (response.content || []).find(c => c.type === "text")?.text;
        if (!reply) return res.status(502).json({ error: "Sibiya AI had no answer." });
        await addAiMessage(code, reply, admin, expireSeconds);
        return res.status(200).json({ ...response, written: true });
      }
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
      max_tokens: 2500,
      system: systemWithDate,
      messages,
    });
    return res.status(200).json(response);
  } catch (error) {
    console.error("Sibiya AI API error:", error);
    return res.status(500).json({ error: "Something went wrong talking to Sibiya AI." });
  }
}
