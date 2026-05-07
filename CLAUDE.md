@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The AI backend for the **Pulse** mobile app (sibling repo at `../pulse`). A handful of Next.js App Router endpoints that proxy AI calls — exists because the mobile app must not ship an API key. All routes hit Groq via `@ai-sdk/groq`; `voice-pep` additionally hits ElevenLabs for TTS.

## Commands

```bash
npm run dev          # next dev on :3000 — used by the mobile app in development
npm run build        # next build
npm run start        # next start (production)
npm run lint         # eslint
npx tsc --noEmit     # typecheck
```

No test suite — verification is by running the dev server and exercising routes from the mobile app (`../pulse`) or curl. Stack is `next@16` + `react@19` + AI SDK v6; APIs differ from older Next.js, so check `node_modules/next/dist/docs/` before assuming.

## Architecture

Each endpoint lives in its own `app/api/<name>/route.ts`. They share a common shape:

1. zod `BodySchema` parses the POST body — fail-closed with a 400 + flattened zod error.
2. Build a plain-text user-context block from `entries` (mood/sleep/energy 1–5), `goals`, `name`, `focuses`. Models never see the raw arrays — they get a flattened summary appended to the system prompt. Easier on tokens, avoids the model getting clever about JSON.
3. Call the AI SDK with a per-route `SYSTEM` prompt and `MODEL` constant.
4. Return either a streamed `toUIMessageStreamResponse()` (chat) or a plain `Response.json(...)` (one-shot generations).

The schemas in each route are the source-of-truth contract with the mobile app. If you change one, the matching mobile transport (`prepareSendMessagesRequest` for `useChat`, or the plain `fetch` call for the others) must change in lockstep.

`entries` is always passed **most-recent first** — every route slices the head (`entries.slice(0, N)`). Don't sort or reverse on the server.

### Routes

- **`coach`** — Streaming chat. Uses `streamText` + `toUIMessageStreamResponse()`; the mobile client decodes it via `@ai-sdk/react`'s `useChat`. Has three tools: `create_goal`, `schedule_reminder`, `suggest_replies`. `stopWhen: stepCountIs(5)` caps tool-call rounds. Recent 14 entries are flattened into the system prompt.
- **`daily-plan`** — `generateObject` → 3–6 timed actions for today, given goals + recent check-ins + current `hour`.
- **`goal-plan`** — `generateText` → 4-week plan for a single new habit (build/break).
- **`weekly-insight`** — `generateText` → 3-paragraph weekly summary from the last 7 days of entries.
- **`weekly-dungeon`** — `generateObject` → Solo-Leveling-style themed weekly quest (name, theme, 5–7 subtasks, XP/stat reward).
- **`voice-pep`** — `generateText` for the script, then ElevenLabs TTS. Returns `{ text, audioBase64, mediaType }`. If `ELEVENLABS_API_KEY` is missing, `audioBase64` is `null` and the mobile app falls back to device TTS. The generated text is stripped of `* _ # \`` before TTS — models occasionally emit markdown despite the prompt and ElevenLabs reads it literally.

### Model selection

Each route pins its model in a top-of-file `MODEL` constant — currently a mix of `groq('openai/gpt-oss-20b')` (coach, daily-plan, weekly-dungeon) and `groq('llama-3.3-70b-versatile')` (goal-plan, weekly-insight, voice-pep). To swap models, edit that constant. We were originally on Vercel AI Gateway but switched to Groq because Gateway requires a card on file even for the free $5 credit; to move back, swap the import to `@ai-sdk/gateway` and use plain `'anthropic/claude-haiku-4-5'`-style strings.

`maxDuration = 30` is the per-route function timeout; bump if streams get cut off.

AI SDK is **v6**, so `convertToModelMessages` returns a Promise — must be awaited.

## System prompt rules (don't drop these)

Across all `SYSTEM` constants, three product invariants must survive any prompt tuning:

1. **Concise output** — the conversational/voice routes specifically say "1–3 short sentences", no markdown/bullets.
2. **Crisis-handling fallback** — for self-harm / hopelessness / crisis signals, gently recommend a professional or crisis line. Don't soften or skip.
3. **Not a clinician** — no diagnoses, no medical claims. For substance dependency, encourage professional support alongside what the app does.

These are the reason this app can ship to the App Store wellness category without review pushback.

## Environment

- `GROQ_API_KEY` — required (get from console.groq.com/keys).
- `ELEVENLABS_API_KEY` — optional, enables real TTS for `voice-pep`. Without it the route still returns the text and the mobile app uses device TTS.
- `ELEVENLABS_VOICE_ID` — optional override; defaults to the "Sarah" starter voice.

See `.env.example`. On Vercel, set in project settings; locally, drop in `.env.local`.

## Deploying

Standard Next.js deploy on Vercel — no custom config. After the first deploy, copy the URL into `../pulse/.env` as `EXPO_PUBLIC_API_URL` before running `eas build`, since `EXPO_PUBLIC_*` is inlined at build time on the mobile side.
