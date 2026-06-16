# Pulse API

**AI backend for the Pulse wellness app** — a set of Next.js App Router endpoints that proxy AI calls so the mobile app never has to ship an API key.

Built with **Next.js 16**, **React 19**, the **Vercel AI SDK v6**, and **Groq** for inference (with **ElevenLabs** for voice). Every route is typed end to end and validates its input with Zod.

---

## Why it exists

The Pulse mobile app needs AI features — a coach you can chat with, daily plans, weekly insights — but a mobile binary can't safely hold a model API key. Pulse API is the thin, secure middle layer: the app sends user context, this backend talks to the AI provider, and only the result comes back.

---

## How it works

Each endpoint lives in its own `app/api/<name>/route.ts` and shares the same shape:

1. **Validate** — a Zod `BodySchema` parses the POST body and fails closed with a `400` + flattened error on bad input.
2. **Build context** — mood / sleep / energy entries, goals, name, and focus areas are flattened into a plain-text summary that's appended to the system prompt (the model never sees raw JSON — cheaper on tokens, fewer surprises).
3. **Call the model** — each route has its own `SYSTEM` prompt and `MODEL` constant, called through the AI SDK.
4. **Respond** — streaming chat returns a `toUIMessageStreamResponse()`; one-shot generators return plain `Response.json(...)`.

The Zod schemas in each route are the **source-of-truth contract** with the mobile client.

---

## Endpoints

All endpoints are `POST` and take a JSON body of user context (recent `entries`, `goals`, `name`, etc.).

| Route | Returns | What it does |
| ----- | ------- | ------------ |
| `/api/coach` | Streamed chat | Conversational wellness coach (`streamText` → `toUIMessageStreamResponse()`). Tools: `create_goal`, `schedule_reminder`, `suggest_replies`; tool-call rounds capped with `stepCountIs(5)`. |
| `/api/daily-plan` | Structured JSON | A today schedule — a `vibe` line plus 3–6 time-ordered action items, each linked to a goal. Built with `generateObject` against a Zod schema. |
| `/api/goal-plan` | `{ plan: string }` | A personalized **4-week** habit plan (build or break a habit), as plain text. |
| `/api/weekly-insight` | `{ insight, entryCount }` | Three short paragraphs spotting patterns in the week's mood/sleep/energy data. |
| `/api/weekly-dungeon` | Structured JSON | A Solo-Leveling-style gamified weekly quest — themed dungeon name, 5–7 subtasks, XP + RPG stat reward (STR/VIT/INT/WIS/CHA), scaled to the user's level. |
| `/api/voice-pep` | `{ text, audioBase64, mediaType }` | A 20–30s motivational message, synthesized to speech via ElevenLabs TTS. Falls back to text-only if no TTS key is set. |

**Models (via Groq):** `llama-3.3-70b-versatile` for free-text generation (goal-plan, weekly-insight, voice-pep) and `openai/gpt-oss-20b` for structured generation (daily-plan, weekly-dungeon).

---

## Tech stack

- **Framework:** Next.js 16 (App Router) · React 19
- **AI:** Vercel AI SDK v6 (`ai`, `@ai-sdk/groq`, `@ai-sdk/gateway`)
- **Inference:** Groq · ElevenLabs (TTS)
- **Validation:** Zod
- **Language:** TypeScript

---

## Getting started

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env.local
# GROQ_API_KEY is required.
# ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID are optional
# (voice-pep returns text-only if no TTS key is set).

# 3. Run
npm run dev          # starts on http://localhost:3000
```

Other scripts:

```bash
npm run build        # production build
npm run start        # run production build
npm run lint         # eslint
npx tsc --noEmit     # typecheck
```

---

## Example request

```bash
curl -X POST http://localhost:3000/api/daily-plan \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Anish",
    "hour": 9,
    "goals": [
      { "id": 1, "title": "Study DSA", "emoji": "📘", "type": "build" }
    ],
    "entries": [
      { "createdAt": 1718000000000, "mood": 4, "sleep": 3, "energy": 4 }
    ]
  }'
```

Sample response:

```json
{
  "vibe": "Steady and focused — protect your energy after a short night.",
  "items": [
    { "time": "Morning", "title": "20-min DSA warm-up", "why": "Best focus while energy is fresh.", "goalId": 1 },
    { "time": "Afternoon", "title": "10-minute walk", "why": "Sleep was low — keep it light.", "goalId": null }
  ]
}
```

---

## Project status

Active. This is the API layer for the Pulse app; routes are added as the app grows. The `app/page.tsx` / `app/layout.tsx` files are leftover scaffold — this project is API-only.
