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
    const { tool, type, ...params } = body;
    const toolName = tool || type;

    if (!toolName) {
      return NextResponse.json({ error: "Tool name missing" }, { status: 400 });
    }

    const OWNER_EMAIL = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
    const isOwner = !!OWNER_EMAIL && !!user.verified && user.email === OWNER_EMAIL;

    switch (toolName) {
      case "whoami":
        return NextResponse.json({
          owner: isOwner,
          uid: user.uid,
          email: user.email || "",
          name: user.name || "",
        });

      case "izibongo":
      case "quiz":
      case "stokvel":
      case "catchup":
        return NextResponse.json({
          result: `Tool ${toolName} executed`,
          owner: isOwner,
          params,
        });

      default:
        return NextResponse.json({ error: `Tool ${toolName} not found` }, { status: 404 });
    }
  } catch (error) {
    console.error("[TOOL API ERROR]", error);
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
