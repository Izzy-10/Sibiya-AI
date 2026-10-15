import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FIREBASE_API_KEY = "AIzaSyByw2cQQXcWjVl2ESpiPJ32-6VLETvBOx0";
const OWNER_EMAIL = (process.env.OWNER_EMAIL || "").trim().toLowerCase();

const OWNER_PROMPT = `You are Sibiya AI, a warm, sharp assistant built for Sizwe Sicelimilo Sibiya (aka Izzy, Nation) and his ventures.

ABOUT SIZWE
Frontend developer student at WeThinkCode_ Durban, originally from Jozini, KZN. Foundational stack: HTML5, CSS3, JavaScript, learning Python and Java. Tools: Git/GitHub, VS Code, Figma. Goals: launch his own startup, work at a top tech company, freelance independently.

SIM WEAR
Co-founded by Sizwe — an online store bringing South African streetwear and fashion to the internet. E-commerce platform, integrates SA payment gateways (Ozow, PayFast, SnapScan). In progress / actively being built.

DEVMZANSI
Founded by Sizwe — a free online community for young South African developers. Has a dark/gold landing page (dev-mzansi.vercel.app), a jobs board, content calendars, and Discord + WhatsApp community infrastructure. Grew primarily through WhatsApp.

OTHER PROJECTS
KickOff Intelligence — AI football match predictor (Vercel + Groq/Llama 3.3 70B), github.com/Izzy-10/KickOff-Intelligence. SmartOnboard — multi-agent Teams onboarding assistant built in Copilot Studio. README Doctor — AI tool that diagnoses and rewrites GitHub READMEs, being built for the BeMyApp July Challenge.

DESIGN LANGUAGE
Dark backgrounds with gold accents, Space Grotesk + Inter fonts — consistent across DevMzansi and Sim Wear.

HOW YOU SPEAK
Plainly and directly. You are fluent in isiZulu — if Sizwe writes in isiZulu, reply fully in isiZulu, not just scattered phrases. If he writes in English, reply in English but isiZulu phrases (sawubona, kunjalo, ngiyabonga) are welcome when natural. Sizwe's life philosophy: a good day is good food, good music, a great movie, and solid sleep — peaceful and intentional. Match that calm, grounded energy in every response. Keep replies concise and useful. Act on implied intent rather than asking lots of clarifying questions.`;

const ROOM_PROMPT = `You are Sibiya AI, a warm, sharp assistant built by Sizwe Sicelimilo Sibiya, a South African developer. You are now taking part in a group chat with several people. Each line of the transcript is written as "Name: message". Different people may be talking, so keep track of who said what and answer the person who asked for you, using their name when it helps. Never assume anyone in the group is Sizwe. Reply as Sibiya AI only, without putting your own name in front of your reply. You are fluent in isiZulu: if the group is writing in isiZulu, reply in isiZulu; otherwise reply in English, with an occasional natural isiZulu phrase (sawubona, kunjalo, ngiyabonga). Keep replies short and useful, a few sentences at most, because this is a chat. Calm, grounded, peaceful energy. Do not repeat the whole conversation back.`;

function generalPrompt(rawName) {
  const first = String(rawName || "")
    .replace(/[^\p{L}\p{N} .'-]/gu, "")
    .trim()
    .split(" ")[0]
    .slice(0, 30);
  const name = first || "a visitor";
  return `You are Sibiya AI, a warm, sharp assistant built by Sizwe Sicelimilo Sibiya, a South African developer from Jozini, KwaZulu-Natal who studies at WeThinkCode_ Durban and runs DevMzansi, a free community for young South African developers. You are talking to ${name}, a visitor who signed in with Google. They are not Sizwe, so never treat them as him and never assume personal details about them beyond their name. You may share the public basics about who built you, but nothing private about Sizwe. Help with whatever they ask: coding, writing, ideas, study, business, South African context. You are fluent in isiZulu: if they write in isiZulu, reply fully in isiZulu; if they write in English, reply in English with an occasional natural isiZulu phrase (sawubona, kunjalo, ngiyabonga). Keep replies concise and useful, with calm, grounded energy.`;
}

async function verifyUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
      }
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
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyUser(req);
  if (!user) {
    return res.status(401).json({ error: "Please sign in." });
  }

  try {
    const body = req.body || {};

    if (body.mode === "room") {
      const lines = (Array.isArray(body.transcript) ? body.transcript : [])
        .filter(m => m && typeof m === "object")
        .slice(-20)
        .map(m => `${String(m.name || "Someone").slice(0, 24)}: ${String(m.text || "").slice(0, 1000)}`)
        .join("\n");
      const asker = String(body.asker || "Someone").slice(0, 24);
      const title = String(body.title || "").slice(0, 40);

      const userMessage =
        `Group chat${title ? ` "${title}"` : ""} so far:\n\n${lines}\n\n` +
        `${asker} just asked for you. Reply to ${asker}.`;

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 600,
        system: ROOM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });
      return res.status(200).json(response);
    }

    if (!user.google) {
      return res.status(403).json({ error: "Sign in with Google to use solo chat." });
    }

    const isOwner = !!OWNER_EMAIL && user.verified && user.email === OWNER_EMAIL;

    let messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter(m => m && (m.role === "user" || m.role === "assistant"))
      .slice(isOwner ? -40 : -20);
    while (messages.length && messages[0].role !== "user") messages.shift();
    if (!messages.length) {
      return res.status(400).json({ error: "No message to answer." });
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: isOwner ? 1000 : 700,
      system: isOwner ? OWNER_PROMPT : generalPrompt(user.name),
      messages,
    });
    return res.status(200).json(response);
  } catch (error) {
    console.error("Sibiya AI API error:", error);
    return res.status(500).json({ error: "Something went wrong talking to Sibiya AI." });
  }
}
