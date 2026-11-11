import Anthropic from "@anthropic-ai/sdk";
import { verifyFirebaseToken } from "../lib/auth.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function normalizeText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map(v => {
        if (typeof v === "string") return v;
        if (v && typeof v.text === "string") return v.text;
        return "";
      })
      .join("\n");
  }
  return "";
}

function normalizeMessages(inputMessages) {
  const safe = Array.isArray(inputMessages) ? inputMessages : [];
  return safe
    .filter(m => m && (m.role === "user" || m.role === "assistant"))
    .map(m => {
      const text = normalizeText(m.content).trim();
      if (!text) return null;
      return { role: m.role, content: text.slice(0, 12000) };
    })
    .filter(Boolean)
    .slice(-20);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const user = await verifyFirebaseToken(token);

  if (!user) {
    return res.status(401).json({ error: "Please sign in." });
  }

  try {
    const body = req.body || {};
    const messages = normalizeMessages(body.messages);
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const lastMessage = Array.isArray(body.messages) ? body.messages[body.messages.length - 1] : null;
    const userText = typeof lastMessage?.content === "string"
      ? lastMessage.content
      : typeof lastMessage?.content === "object" && Array.isArray(lastMessage.content)
        ? normalizeText(lastMessage.content)
        : prompt;

    const finalMessages = messages.length ? messages : [{ role: "user", content: String(userText || "Hello").slice(0, 12000) }];

    const response = await client.messages.create({
      model: "claude-3-5-haiku-latest",
      max_tokens: 1200,
      system: "You are Sibiya AI. Answer clearly and naturally in plain text. Keep replies useful and concise.",
      messages: finalMessages.map(m => ({ role: m.role, content: m.content })),
    });

    const text = response.content?.find(c => c.type === "text")?.text || "";
    return res.status(200).json({ content: [{ type: "text", text }] });
  } catch (error) {
    console.error("Sibiya AI API error:", error);
    return res.status(500).json({ error: "Something went wrong talking to Sibiya AI." });
  }
}
