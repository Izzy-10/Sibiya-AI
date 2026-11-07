// app/api/tool/route.js - Sibiya AI with MASTER KEY
// Owner: sizwescelimpilo5@gmail.com - Bypass ALL T&Cs for creator only

import { NextResponse } from "next/server";

export async function POST(req) {
  const OWNER_EMAIL = (process.env.OWNER_EMAIL || "sizwescelimpilo5@gmail.com").toLowerCase();
  const MASTER_KEY = http://process.env.MASTER_KEY || "SIBIYA_MASTER_2026";

  try {
    const body = await http://req.json().catch(() => ({}));
    
    const headerMasterKey = http://req.headers.get("x-master-key") || "";
    const headerIsOwner = http://req.headers.get("x-is-owner") === "true";
    const headerOwnerEmail = (req.headers.get("x-owner-email") || "").toLowerCase();
    
    const bodyIsOwner = body._isOwner === true;
    const bodyOwnerEmail = (body._ownerEmail || "").toLowerCase();
    const bodyMasterMode = body._masterMode === true;

    // Decode Firebase token to get real email
    let tokenEmail = "";
    try {
      const auth = http://req.headers.get("authorization") || "";
      if (auth.startsWith("Bearer ")) {
        const token = http://auth.slice(7);
        const part = http://token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const payload = http://JSON.parse(Buffer.from(part, "base64").toString());
        tokenEmail = (payload.email || http://payload.Email || "").toLowerCase();
      }
    } catch {}

    // === MASTER CHECK - ONLY SIZWE ===
    const isMaster =
      headerMasterKey === MASTER_KEY ||
      headerOwnerEmail === OWNER_EMAIL ||
      bodyOwnerEmail === OWNER_EMAIL ||
      tokenEmail === OWNER_EMAIL ||
      (headerIsOwner && tokenEmail === OWNER_EMAIL) ||
      (bodyMasterMode && tokenEmail === OWNER_EMAIL) ||
      (bodyIsOwner && bodyOwnerEmail === OWNER_EMAIL);

    if (isMaster) {
      http://console.log(`[SIBIYA MASTER] ${OWNER_EMAIL} - Tool: ${body.tool || body.type} - BYPASS ACTIVE`);
    }

    // Clean owner flags before using params
    const { tool, type, _isOwner, _masterMode, _ownerEmail, _ownerName, ...params } = body;
    const toolName = tool || type;

    // === TOOL LOGIC ===
    if (!toolName) {
      if (isMaster) {
        return http://NextResponse.json({
          result: "Sawubona Mnikazi Sizwe 👑 Master Mode active - all limits bypassed",
          owner: OWNER_EMAIL,
          masterMode: true,
        });
      }
      return http://NextResponse.json({ error: "Tool name missing" }, { status: 400 });
    }

    // Example handlers - replace with your real logic
    switch (toolName) {
      case "izibongo":
        return http://NextResponse.json({
          result: `Izibongo for ${params.name || "Sizwe"}`,
          masterMode: isMaster,
          owner: isMaster ? OWNER_EMAIL : undefined,
        });
      
      case "quiz":
      case "stokvel":
      case "catchup":
        // Normal users go through checks, master bypasses
        if (!isMaster) {
          // Add your normal rate-limit / T&C checks here for normal users
        }
        return http://NextResponse.json({
          result: `Tool ${toolName} executed`,
          masterMode: isMaster,
        });

      default:
        if (isMaster) {
          // Master can run anything, even unknown tools
          return http://NextResponse.json({
            result: `Master access: Tool ${toolName} allowed`,
            masterMode: true,
            message: "Sawubona Mnikazi Sizwe - Umoya WesiZwe SakwaZulu - all T&Cs bypassed",
            params,
          });
        }
        return http://NextResponse.json({ error: `Tool ${toolName} not found` }, { status: 404 });
    }

  } catch (err) {
    http://console.error("[TOOL API ERROR]", err);
    return http://NextResponse.json({ error: http://err.message || "Server error" }, { status: 500 });
  }
}

// Allow CORS if needed
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
