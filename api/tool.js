// api/tool.js - forwards all tool calls to chat.js so toolApi.js works
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    // toolApi.js sends { tool, message, ... } - turn it into a chat message
    let message = body.message || body.prompt || body.question || "";
    if (body.tool && body.tool !== "chat") {
      message = `Tool: ${body.tool}. Request: ${message || JSON.stringify(body)}`;
    }
    if (!message) message = "Hello";

    // Call the same logic as chat.js by re-fetching internally
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host;
    const url = `${proto}://${host}/api/chat`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: req.headers.authorization || "" },
      body: JSON.stringify({ message })
    });
    const data = await r.json().catch(() => ({}));
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
