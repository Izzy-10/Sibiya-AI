// AI jobs for the extra Sibiya AI tools: izibongo maker, catch me up, quiz questions, stokvel reminders.
import Anthropic from "@anthropic-ai/sdk";
import { verifyFirebaseToken } from "../lib/auth.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-6";
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

const clip = (v, n) => String(v ?? "").slice(0, n);
const plain = t =>
  String(t || "")
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/`/g, "")
    .trim();

async function ask(system, user, max) {
  const r = await client.messages.create({
    model: MODEL,
    max_tokens: max,
    system,
    messages: [{ role: "user", content: user }],
  });
  return (r.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
}

function parseJson(text) {
  const t = String(text || "").replace(/```json|```/g, "").trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a < 0 || b < a) return null;
  try {
    return JSON.parse(t.slice(a, b + 1));
  } catch {
    return null;
  }
}

const IZIBONGO_SYSTEM = `You write izibongo, personal praise poems, in isiZulu in the spirit of Zulu praise poetry: bold images, rhythm, short strong lines and praise names. This is a PERSONAL praise poem. It is not the person's clan praises (izithakazelo): never claim to give a clan's izithakazelo and never invent a clan or lineage. Use only what the requester tells you about the person. Keep it warm, proud and respectful, 10 to 16 lines. Return ONLY JSON like {"title":"...","izibongo":"line one\\nline two","meaning":"a short English meaning of the poem"}. Plain text, no markdown. If the request is hateful, sexual or mocking, return {"title":"","izibongo":"","meaning":"I can only write respectful praise."}.`;

const CATCHUP_SYSTEM = `You summarise a group chat for someone who was away. Write plain text with no markdown, in this order:
SUMMARY: 3 to 6 short lines starting with "- " about what happened.
FOR YOU: lines starting with "- " for anything that mentions the person, asks them something or needs their reply, or "- Nothing needs your reply."
PLANS: only if dates, times or plans were mentioned, as lines starting with "- ".
Use the language the group mostly uses (English, isiZulu or a mix). Never invent anything that is not in the chat. Keep it under 150 words.`;

const QUIZ_SYSTEM = `You write multiple-choice quizzes for a friendly group chat. Return ONLY JSON: {"topic":"...","questions":[{"q":"...","options":["...","...","...","..."],"answer":0,"why":"one short sentence"}]}. Write exactly the requested number of questions, exactly 4 options each, and "answer" is the index 0 to 3 of the correct option. Vary the position of the correct answer. Questions must be factual and checkable, and suitable for all ages. Write in the requested language: English, isiZulu, or a mix of both. Plain text, no markdown.`;

const REMINDER_SYSTEM = `You write a short, friendly reminder for a stokvel (savings group) chat. Plain text, at most 60 words, warm and respectful and never shaming. Mention the month and the amount, name the people who have not paid yet, and invite them to pay or to say if there is a problem. Never include bank details. Use English with a little isiZulu such as sawubona or ngiyabonga.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const header = req.headers.authorization || "";
  const user = await verifyFirebaseToken(header.startsWith("Bearer ") ? header.slice(7).trim() : "");
  if (!user) return res.status(401).json({ error: "Please sign in." });
  const isOwner = !!OWNER_EMAIL && user.verified && user.email === OWNER_EMAIL;
  if (!isOwner && (tooMany("u:" + user.uid, 12) || tooMany("ip:" + clientIp(req), 40))) {
    return res.status(429).json({ error: "Too many requests. Wait a minute." });
  }

  try {
    const b = req.body || {};
    const tool = String(b.tool || "");

    // lets the app show "Owner mode" when the master key (the owner's verified Google account) is active
    if (tool === "whoami") return res.status(200).json({ owner: isOwner });

    if (tool === "izibongo") {
      const name = clip(b.name, 60).trim();
      if (!name) return res.status(400).json({ error: "Type the person's name." });
      const text = await ask(
        IZIBONGO_SYSTEM,
        `Person: ${name}\nOccasion: ${clip(b.occasion, 60)}\nRelationship to the writer: ${clip(b.relation, 60)}\nWhat to praise: ${clip(b.proud, 600)}`,
        1200
      );
      const j = parseJson(text);
      if (!j) return res.status(502).json({ error: "Could not write the poem. Try again." });
      return res.status(200).json({
        title: plain(j.title).slice(0, 100),
        izibongo: plain(j.izibongo).slice(0, 2500),
        meaning: plain(j.meaning).slice(0, 2000),
      });
    }

    if (tool === "catchup") {
      const lines = (Array.isArray(b.messages) ? b.messages : [])
        .slice(-80)
        .map(m => `${clip(m && m.name, 24) || "Someone"}: ${clip(m && m.text, 300)}`)
        .join("\n");
      if (!lines.trim()) return res.status(400).json({ error: "Nothing to summarise." });
      const text = await ask(CATCHUP_SYSTEM, `The person catching up is ${clip(b.asker, 24) || "the reader"}.\n\nChat:\n${lines}`, 700);
      return res.status(200).json({ text: plain(text).slice(0, 2000) });
    }

    if (tool === "quiz") {
      const topic = clip(b.topic, 80).trim();
      const count = Math.min(10, Math.max(3, parseInt(b.count, 10) || 5));
      const language = ["English", "isiZulu", "English and isiZulu mix"].includes(b.language) ? b.language : "English";
      if (!topic) return res.status(400).json({ error: "Type a topic." });
      const text = await ask(QUIZ_SYSTEM, `Topic: ${topic}\nNumber of questions: ${count}\nLanguage: ${language}`, 3200);
      const j = parseJson(text);
      const questions = ((j && j.questions) || [])
        .filter(
          q =>
            q &&
            typeof q.q === "string" &&
            Array.isArray(q.options) &&
            q.options.length === 4 &&
            q.options.every(o => typeof o === "string") &&
            Number.isInteger(q.answer) &&
            q.answer >= 0 &&
            q.answer <= 3
        )
        .slice(0, count)
        .map(q => ({
          q: clip(q.q, 300),
          options: q.options.map(o => clip(o, 120)),
          answer: q.answer,
          why: clip(q.why, 240),
        }));
      if (questions.length < 3) return res.status(502).json({ error: "Could not write the quiz. Try again." });
      return res.status(200).json({ topic: clip((j && j.topic) || topic, 80), questions });
    }

    if (tool === "reminder") {
      const unpaid = (Array.isArray(b.unpaid) ? b.unpaid : []).slice(0, 40).map(n => clip(n, 30));
      if (!unpaid.length) return res.status(400).json({ error: "Everyone has paid." });
      const text = await ask(
        REMINDER_SYSTEM,
        `Stokvel: ${clip(b.group, 60)}\nMonth: ${clip(b.month, 30)}\nAmount: R${clip(b.amount, 12)}\nNot paid yet: ${unpaid.join(", ")}`,
        300
      );
      return res.status(200).json({ text: plain(text).slice(0, 700) });
    }

    return res.status(400).json({ error: "Unknown tool." });
  } catch (error) {
    console.error("Sibiya AI tool error:", error);
    return res.status(500).json({ error: "Something went wrong. Try again." });
  }
          }
