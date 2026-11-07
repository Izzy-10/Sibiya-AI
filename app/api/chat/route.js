import { NextResponse } from "next/server";
import { verifyFirebaseToken } from "../../lib/auth.js";

export async function POST(req) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const user = await verifyFirebaseToken(token);

    if (!user) {
      return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { messages, prompt } = body;
    const lastMessage = Array.isArray(messages) ? messages[messages.length - 1] : null;
    const userMessage = typeof lastMessage?.content === "string"
      ? lastMessage.content
      : typeof prompt === "string"
        ? prompt
        : "";

    const reply = userMessage
      ? `Sawubona! I am Sibiya AI. You asked: "${String(userMessage).slice(0, 500)}"`
      : "Sawubona! I am Sibiya AI.";

    return NextResponse.json({
      reply,
      text: reply,
      message: reply,
    });
  } catch (error) {
    console.error("[CHAT API ERROR]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
