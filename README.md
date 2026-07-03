# Sibiya AI

**Umoya Wesizwe SakwaZulu**

A personal AI assistant for the Sibiya family and ventures — Sim Wear, DevMzansi, and beyond. Talks back in a real voice, replies fluently in isiZulu, and reads your PDFs.

## Deploy on Vercel

1. Push this folder to a GitHub repo.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo.
3. In **Settings → Environment Variables**, add:
   - `ANTHROPIC_API_KEY` — your key from [console.anthropic.com](https://console.anthropic.com)
4. Deploy. Vercel auto-detects the Vite build and the `/api/chat` serverless function.

## Local development

```bash
npm install
cp .env.example .env.local   # then add your real API key
npm run dev
```

## How it works

- `src/App.jsx` — the chat UI (dark/gold, voice output, PDF upload)
- `api/chat.js` — serverless function that calls the Anthropic API server-side, so your key never reaches the browser and there's no CORS issue
- All requests from the frontend go to `/api/chat`, not directly to `api.anthropic.com`

Sawubona. Siyezwana.
