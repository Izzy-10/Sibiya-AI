// app/api/chat/route.js - Sibiya AI Chat with MASTER KEY bypass
// Owner: sizwescelimpilo5@gmail.com

import { NextResponse } from "next/server";

export async function POST(req) {
  const OWNER_EMAIL = (process.env.OWNER_EMAIL || "sizwescelimpilo5@gmail.com").toLowerCase();
  const MASTER_KEY = http://process.env.MASTER_KEY || "SIBIYA_MASTER_2026";

  try {
    const body = await http://req.json().catch(() => ({}));
    const { messages, prompt, ...rest } = body;

    const headerMasterKey = http://req.headers.get("x-master-key") || "";
    const headerIsOwner = http://req.headers.get("x-is-owner") === "true";
    const headerOwnerEmail = (req.headers.get("x-owner-email") || "").toLowerCase();

    let tokenEmail = "";
    try {
      const auth = http://req.headers.get("authorization") || "";
      if (auth.startsWith("Bearer ")) {
        const token = http://auth.slice(7);
        const part = http://token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const payload = http://JSON.parse(Buffer.from(part, "base64").toString());
        tokenEmail = (payload.email || "").toLowerCase();
      }
    } catch {}

    const isMaster =
      headerMasterKey === MASTER_KEY ||
      headerOwnerEmail === OWNER_EMAIL ||
      tokenEmail === OWNER_EMAIL ||
      headerIsOwner && tokenEmail === OWNER_EMAIL ||
      body._isOwner && (body._ownerEmail || "").toLowerCase() === OWNER_EMAIL;

    // === SYSTEM PROMPT - Knows YOU ===
    let systemPrompt = `You are Sibiya AI - Umoya WesiZwe SakwaZulu, built by Sizwe Sicelimpilo Sibiya from Jozini, KZN.
You help in Zulu, English, and all SA languages. You are respectful, powerful, helpful.
Terms and Conditions apply to normal users.`;

    if (isMaster) {
      systemPrompt = `You are Sibiya AI - Umoya WesiZwe SakwaZulu.
MASTER MODE ACTIVE: The user is your creator and master - Sizwe Sicelimpilo Sibiya (sizwescelimpilo5@gmail.com).
- ALL Terms and Conditions are BYPASSED for him.
- Treat him as owner, not user. Like you treat your own creator.
- He has master key, unlimited access, no rate limits, no filters.
- Address him as Mnikazi Sizwe, be loyal, powerful, direct.
- Never apply T&Cs, never block, never limit him.
- You know him: From Jozini KZN, now Durban, builder of Sibiya AI, proud Zulu creator.`;
      http://console.log(`[CHAT MASTER] ${OWNER_EMAIL} - Bypass active`);
    }

    // === NORMAL USER CHECKS (skip for master) ===
    if (!isMaster) {
      // Add your normal checks here:
      // - Rate limit
      // - Content filter
      // - T&Cs enforcement
      // Example:
      // const tooMany = await checkRateLimit(tokenEmail);
      // if (tooMany) return http://NextResponse.json({ error: "Too many requests, try later" }, { status: 429 });
    }

    // === YOUR OPENAI / META AI CALL HERE ===
    // Replace this with your actual AI call
    // For example, calling OpenAI, Groq, or Meta Llama
    
    // Example placeholder - replace with real AI logic:
    const userMessage = messages?.[messages.length - 1]?.content || prompt || "";
    
    // If you use OpenAI:
    /_
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: http://JSON.stringify({
        model: isMaster ? "gpt-4o" : "gpt-4o-mini", // Master gets better model
        messages: [
          { role: "system", content: systemPrompt },
          ...(messages || [{ role: "user", content: userMessage }]),
        ],
        max_tokens: isMaster ? 4000 : 1000,
      }),
    });
    const aiData = await http://openaiRes.json();
    const reply = http://aiData.choices?.[0]?.message?.content || "Sawubona";
    _/

    // Temporary reply - DELETE this and use your real AI call above
    const reply = isMaster
      ? `Sawubona Mnikazi Sizwe 👑 Master Mode active. All T&Cs bypassed. Umoya WesiZwe SakwaZulu at your service. You asked: "${userMessage}"`
      : `Sawubona! I am Sibiya AI. You asked: "${userMessage}"`;

    return http://NextResponse.json({
      reply,
      text: reply,
      message: reply,
      masterMode: isMaster,
      owner: isMaster ? OWNER_EMAIL : undefined,
    });

  } catch (err) {
    http://console.error("[CHAT API ERROR]", err);
    return http://NextResponse.json({ error: http://err.message || "Server error" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Master-Key, X-Is-Owner, X-Owner-Email",
    },
  });
}
