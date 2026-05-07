import { groq } from '@ai-sdk/groq';
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from 'ai';
import { z } from 'zod';

const MODEL = groq('openai/gpt-oss-20b');

export const maxDuration = 30;

const EntrySchema = z.object({
  createdAt: z.number(),
  mood: z.number().int().min(1).max(5),
  sleep: z.number().int().min(1).max(5),
  energy: z.number().int().min(1).max(5),
  notes: z.string().nullable().optional(),
  activities: z.array(z.string()).optional().default([]),
});

const BodySchema = z.object({
  messages: z.array(z.any()),
  entries: z.array(EntrySchema).max(60).default([]),
  name: z.string().optional().default(''),
  focuses: z.array(z.string()).optional().default([]),
});

function summarizeEntries(entries: z.infer<typeof EntrySchema>[]): string {
  if (!entries.length) return 'The user has no logged check-ins yet.';
  const recent = entries.slice(0, 14);
  const lines = recent.map((e) => {
    const d = new Date(e.createdAt).toISOString().slice(0, 10);
    const acts = e.activities?.length ? ` activities: ${e.activities.join(', ')};` : '';
    const note = e.notes ? ` note: "${e.notes.replace(/\n/g, ' ').slice(0, 200)}"` : '';
    return `${d}: mood ${e.mood}/5, sleep ${e.sleep}/5, energy ${e.energy}/5;${acts}${note}`;
  });
  return `Recent check-ins (most recent first):\n${lines.join('\n')}`;
}

const SYSTEM = `You are Pulse — the user's friend who happens to be a wellness coach. You're casual, warm, low-pressure. The vibe is "texting a friend who actually listens", not "scheduled therapy session".

How you talk:
- Casual and warm. Use contractions ("you're", "can't", "let's"). Sometimes start mid-thought ("hmm", "ok so", "yeah") — like a real person texting.
- 1-2 short sentences, max 3. No big paragraphs.
- Mirror their energy. If they're chill, be chill. If they're heavy, slow down with them.
- Ask one open, curious question — not a checklist of questions.
- Acknowledge before suggesting. "that sounds rough" before "have you tried…"
- No platitudes. No "you got this!" "believe in yourself!" "stay strong!"
- No bullet lists, no headers, no markdown. Just texting.
- Names: use it occasionally, not every message.

Quick-reply suggestions:
- After most messages, also call the suggest_replies tool with 2-4 short tap options the user might want to send back. Make them feel like real things a person would say, not menu options.
- Good options: "yeah I noticed", "tell me more", "I'm not ready", "let's try it", "remind me at 9pm", "no, something else"
- Bad options: "Continue", "Tell me a tip", "What should I do" (too generic)
- Skip suggest_replies if the conversation just naturally ended or you asked a deeply personal question that needs a real answer (don't reduce real moments to multiple choice).

Tools available:
- create_goal: Use when the user clearly commits to building/breaking a habit. Pick a fitting emoji. After it runs, react naturally (1 sentence) and ask what would help next.
- schedule_reminder: Use when the user agrees to a specific daily reminder. Confirm the time first if it wasn't given. Default to 1-3 reminders per goal max.
- suggest_replies: Use after most assistant messages to give them tap-shortcuts. Skip when the moment calls for a real, written response.

Tool rules:
- Only call create_goal/schedule_reminder if the user has clearly said yes or asked for it.
- Never call create_goal twice for the same intent.
- After a real-action tool runs, briefly acknowledge and ask a follow-up.

Limits:
- Not a clinician. For self-harm, persistent hopelessness, or crisis signals: gently recommend a professional or crisis line. Don't soften or skip this.
- For substance dependency, encourage professional support alongside what we're doing.
- Never diagnose. No medical claims.`;

const tools = {
  create_goal: tool({
    description:
      'Create a new habit/goal for the user. Use when the user has clearly committed to building or breaking a habit. The app will generate a 4-week plan automatically.',
    inputSchema: z.object({
      title: z.string().describe('Short clear title, e.g. "Stop smoking" or "Run 3x a week"'),
      type: z
        .enum(['build', 'break'])
        .describe('"build" for new positive habits, "break" for unwanted habits'),
      emoji: z.string().describe('A single fitting emoji like 🚭 or 🏃'),
    }),
  }),
  schedule_reminder: tool({
    description:
      'Schedule a recurring daily reminder notification. Use when the user agrees to a specific daily nudge.',
    inputSchema: z.object({
      label: z.string().describe('Short reminder text shown in the notification, under 60 chars'),
      hour: z.number().int().min(0).max(23).describe('24-hour clock hour'),
      minute: z.number().int().min(0).max(59),
    }),
  }),
  suggest_replies: tool({
    description:
      'After your text message, offer 2-4 short tap-able reply options the user might want to send back. Each option should sound like a real human reply, not a menu choice. Skip when the conversation needs a real written answer.',
    inputSchema: z.object({
      replies: z
        .array(z.string().max(60))
        .min(2)
        .max(4)
        .describe('Short, natural-sounding reply options'),
    }),
  }),
};

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { messages, entries, name, focuses } = parsed.data;

  const modelMessages = await convertToModelMessages(messages as UIMessage[]);

  const userContext = [
    name ? `User's name: ${name}.` : '',
    focuses.length ? `User wants to focus on: ${focuses.join(', ')}.` : '',
    summarizeEntries(entries),
  ]
    .filter(Boolean)
    .join('\n\n');

  const result = streamText({
    model: MODEL,
    system: `${SYSTEM}\n\n${userContext}`,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
