import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';
import { z } from 'zod';

const MODEL = groq('llama-3.3-70b-versatile');

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
  entries: z.array(EntrySchema).max(60),
  focuses: z.array(z.string()).optional().default([]),
  name: z.string().optional().default(''),
});

const SYSTEM = `You are Pulse, a warm wellness coach producing a *weekly insight* for the user.
You see their last week of self-reported mood/sleep/energy on a 1-5 scale, plus optional activities and notes.

Output exactly 3 short paragraphs, no headers, no markdown:
1. One observation about a real pattern in the data ("your mood was highest on days you exercised").
2. One thing that seems to be helping or hurting (only if the data supports it).
3. One small, specific suggestion for the coming week — actionable today.

Total length: under 110 words. Do not diagnose. Do not give medical advice.
If you have fewer than 3 entries to work with, say so warmly in 1-2 sentences and skip the structure.`;

function summarize(entries: z.infer<typeof EntrySchema>[]): string {
  if (!entries.length) return 'No entries this week.';
  const lines = entries.map((e) => {
    const d = new Date(e.createdAt).toISOString().slice(0, 10);
    const acts = e.activities?.length ? ` activities: ${e.activities.join(', ')};` : '';
    const note = e.notes ? ` note: "${e.notes.replace(/\n/g, ' ').slice(0, 160)}"` : '';
    return `${d}: mood ${e.mood}/5, sleep ${e.sleep}/5, energy ${e.energy}/5;${acts}${note}`;
  });
  return `Last 7 days (most recent first):\n${lines.join('\n')}`;
}

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { entries, focuses, name } = parsed.data;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = entries.filter((e) => e.createdAt >= weekAgo);

  const context = [
    name ? `User's name: ${name}.` : '',
    focuses.length ? `User's focus areas: ${focuses.join(', ')}.` : '',
    summarize(recent),
  ]
    .filter(Boolean)
    .join('\n\n');

  const result = await generateText({
    model: MODEL,
    system: `${SYSTEM}\n\n${context}`,
    prompt: 'Write the weekly insight now.',
  });

  return Response.json({ insight: result.text, entryCount: recent.length });
}
