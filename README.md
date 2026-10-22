# How Sibiya AI works

**Umoya Wesizwe SakwaZulu.** Sibiya AI is a chat app made in South Africa, rooted in Zulu culture. You can chat with the AI on your own, or bring friends into a group and call on the AI with `@sibiya`.

Built by Sizwe Sicelimpilo Sibiya, Durban, South Africa.

---

## The big picture

```
   YOUR PHONE / BROWSER
   (the app: React + Vite + Tailwind)
            |
   ---------+--------------------------------------------
   |        |                |                           |
   v        v                v                           v
Firebase   Firestore      /api/chat                   /api/call
Sign-in    (database)     (Vercel server code)        (Vercel server code)
   |        |                |                           |
 Who are   Messages,      Claude (Anthropic)          LiveKit
 you?      members,       writes the AI replies       group voice calls
           group settings
```

Everything is hosted on **Vercel**. Every time a change is saved to GitHub, Vercel rebuilds and publishes the app.

---

## The pieces, in plain words

### The app (React, Vite, Tailwind)
This is what you see and tap: the lobby, solo chat, group chat, the dark and gold look, and the landscape background. It runs in your browser or phone.

### Firebase sign-in
Firebase Authentication knows who you are. You can sign in with **Google** (needed for solo chat) or join a group as a **guest**. Every request your app sends carries a sign-in token, so the servers can check that a real, signed-in person is asking.

### Firestore (the database)
Firestore is where everything shared is stored, and it updates live, so a new message appears for everyone without refreshing.

```
chats
  └─ <group code>
       ├─ messages   every chat message, reaction and call notice
       ├─ members    who is in the group, who is online, muted or removed
       ├─ media      voice notes and small files
       └─ info/meta  group name, host, co-hosts, locked, pinned note
```

**Firestore Rules** are the lock on the database. They run on Google's side, so nobody can cheat by changing the app's code. They decide who can read, send, delete, mute or remove.

### `/api/chat` (the AI)
When you message the AI, the app sends the conversation to a small server function on Vercel. That function checks your sign-in, applies a rate limit, adds Sibiya AI's personality and the Sibiya family history, then asks **Claude** (made by Anthropic) for a reply. The secret API key stays on the server and never reaches your phone. Replies are cleaned to plain text, and isiZulu in means isiZulu out.

### `/api/call` and LiveKit (group calls)
Calls run on **LiveKit**. The server function checks that you are allowed in the group, then hands you a short-lived pass to join the call. Removed members get no pass, and muted members can listen but not speak.

---

## Groups and who can do what

| | Everyone | Co-host | Host |
|---|---|---|---|
| Send messages, voice notes, files, react | Yes | Yes | Yes |
| Ask the AI with `@sibiya` | Yes | Yes | Yes |
| See who is online | Yes | Yes | Yes |
| Mute or remove members, delete messages | | Yes | Yes |
| Pin a note, switch the AI on or off, end a call | | Yes | Yes |
| Lock the group, rename it, make co-hosts | | | Yes |

A **locked** group keeps new people out, even if the invite link is shared.

---

## Keeping it safe

- Only signed-in people can use the AI and calls.
- Each person and each network address has a message limit per minute, to protect against abuse and cost.
- Secret keys live in Vercel settings, never in the app.
- The family izithakazelo (clan praises) are never translated.

---

## Built with

React, Vite, Tailwind, Firebase (Auth and Firestore), Vercel, Claude by Anthropic, LiveKit.

Live at **sibiya-ai.vercel.app**
