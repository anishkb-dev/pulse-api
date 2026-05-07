import { groq } from '@ai-sdk/groq';
import { generateObject } from 'ai';
import { z } from 'zod';

const MODEL = groq('openai/gpt-oss-20b');

export const maxDuration = 30;

const GoalInputSchema = z.object({
  id: z.number(),
  title: z.string(),
  emoji: z.string(),
  type: z.enum(['build', 'break']),
  recentCompletion: z.number().min(0).max(1).optional(),
});

const EntrySchema = z.object({
  createdAt: z.number(),
  mood: z.number().int().min(1).max(5),
  sleep: z.number().int().min(1).max(5),
  energy: z.number().int().min(1).max(5),
});

const BodySchema = z.object({
  goals: z.array(GoalInputSchema).max(20).default([]),
  entries: z.array(EntrySchema).max(14).default([]),
  name: z.string().optional().default(''),
  hour: z.number().int().min(0).max(23),
});

const PlanItemSchema = z.object({
  time: z.string().describe('Time-of-day label, e.g. "Morning", "Afternoon", "Evening", "9:00am"'),
  title: z.string().describe('Short imperative action, under 60 chars'),
  why: z.string().describe('One short sentence on why this fits today'),
  goalId: z.number().nullable().describe('ID of the goal this supports, or null if generic'),
});

const PlanSchema = z.object({
  vibe: z.string().describe('One short sentence about how today should feel'),
  items: z.array(PlanItemSchema).min(3).max(6),
});

const SYSTEM = `You are Pulse, a wellness coach that designs a today schedule for the user.
Use their active goals and recent mood/energy/sleep to choose 3-6 specific actions.

Rules:
- Order items by time of day, starting from the user's current time.
- If energy or sleep was low recently, weight rest and easy wins. If high, push more.
- Each "title" must be a concrete, doable action under 60 characters (e.g. "10-minute walk", "no phone for first hour").
- "why" should be 1 short sentence — connect to the user's data when possible.
- Set goalId only when the action directly supports that goal. Otherwise null.
- Do not give medical advice. Do not invent goals the user didn't list.
- "vibe" is one sentence setting the tone for the day.`;

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { goals, entries, name, hour } = parsed.data;

  const goalLines = goals.length
    ? goals
        .map(
          (g) =>
            `- (id ${g.id}) ${g.emoji} ${g.title} [${g.type}]${
              g.recentCompletion !== undefined
                ? ` recent completion ${(g.recentCompletion * 100).toFixed(0)}%`
                : ''
            }`,
        )
        .join('\n')
    : '(no active goals)';

  const dataLines = entries.length
    ? entries
        .slice(0, 7)
        .map(
          (e) =>
            `${new Date(e.createdAt).toISOString().slice(0, 10)}: mood ${e.mood}/5, sleep ${e.sleep}/5, energy ${e.energy}/5`,
        )
        .join('\n')
    : '(no recent check-ins)';

  const prompt =
    `${name ? `User: ${name}\n` : ''}` +
    `Local time of day: hour ${hour} (24h).\n\n` +
    `Active goals:\n${goalLines}\n\n` +
    `Recent check-ins:\n${dataLines}\n\n` +
    `Plan today now.`;

  const result = await generateObject({
    model: MODEL,
    system: SYSTEM,
    schema: PlanSchema,
    prompt,
  });

  return Response.json(result.object);
}
