import Anthropic from "@anthropic-ai/sdk";
import { verifyFirebaseToken } from "../lib/auth.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const PRIMARY_MODEL = "claude-haiku-4-5-20251001";
const FALLBACK_MODEL = "claude-sonnet-4-6";

function normalizeText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(v => {
      if (typeof v === "string") return v;
      if (v && typeof v.text === "string") return v.text;
      return "";
    }).join("\n");
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

function canRetryWithFallback(error) {
  const status = Number(error && error.status);
  return status === 404 || status === 429 || status >= 500;
}

function friendlyError(error) {
  const status = Number(error && error.status);
  if (status === 401 || status === 403) return "The AI service rejected its credentials. Check the ANTHROPIC_API_KEY in Vercel Environment Variables.";
  if (status === 404) return "Neither configured AI model was found for this API account. Check model access and the model IDs in api/chat.js.";
  if (status === 429) return "The AI service is temporarily rate-limited. Please wait a moment and try again.";
  if (status >= 500) return "The AI provider is temporarily unavailable. Please try again shortly.";
  return "The AI request failed. Check the Vercel Runtime Logs for the Sibiya AI API error.";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const user = await verifyFirebaseToken(token);
  if (!user) return res.status(401).json({ error: "Please sign in." });

  try {
    const body = req.body || {};
    const messages = normalizeMessages(body.messages);
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const messageField = typeof body.message === "string" ? body.message : "";
    const textField = typeof body.text === "string" ? body.text : "";
    const questionField = typeof body.question === "string" ? body.question : "";
    const inputField = typeof body.input === "string" ? body.input : "";

    const lastMessage = Array.isArray(body.messages) ? body.messages[body.messages.length - 1] : null;
    let userText = "";
    if (typeof lastMessage?.content === "string") userText = lastMessage.content;
    else if (Array.isArray(lastMessage?.content)) userText = normalizeText(lastMessage.content);
    else userText = prompt || messageField || textField || questionField || inputField;

    if (body.tool && body.tool !== "chat" && userText) {
      userText = `Tool: ${body.tool}. User request: ${userText}`;
    }

    const finalMessages = messages.length ? messages : [{ role: "user", content: String(userText || "Hello").slice(0, 12000) }];
    const request = {
      max_tokens: 1200,
      system: "You are Sibiya AI. Answer clearly and naturally in plain text. Keep replies useful and concise. Today is Saturday, 14 November 2026.",
      messages: finalMessages.map(m => ({ role: m.role, content: m.content })),
    };

    let response;
    try {
      response = await client.messages.create({ ...request, model: PRIMARY_MODEL });
    } catch (primaryError) {
      if (!canRetryWithFallback(primaryError)) throw primaryError;
      console.warn("Primary Anthropic model failed; trying fallback model", { model: PRIMARY_MODEL, status: primaryError.status });
      try {
        response = await client.messages.create({ ...request, model: FALLBACK_MODEL });
      } catch (fallbackError) {
        console.error("Sibiya AI fallback model failed", { model: FALLBACK_MODEL, status: fallbackError.status, name: fallbackError.name });
        const message = "Sibiya AI couldn't respond: " + friendlyError(fallbackError);
        return res.status(200).json({ content: [{ type: "text", text: message }], isError: true });
      }
    }

    const text = response.content?.find(c => c.type === "text")?.text || "";
    return res.status(200).json({ content: [{ type: "text", text }], reply: text, text });
  } catch (error) {
    console.error("Sibiya AI API error:", { status: error.status, name: error.name, message: error.message });
    const message = "Sibiya AI couldn't respond: " + friendlyError(error);
    return res.status(200).json({ content: [{ type: "text", text: message }], isError: true });
  }
}
