import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';
import { z } from 'zod';

const MODEL = groq('llama-3.3-70b-versatile');

export const maxDuration = 30;

const BodySchema = z.object({
  title: z.string().min(1),
  type: z.enum(['build', 'break']),
  emoji: z.string().optional().default(''),
  name: z.string().optional().default(''),
});

const SYSTEM = `You are Pulse, a coach that writes personalized 4-week plans for habits.
The user is either trying to BUILD a new habit or BREAK an unwanted habit.

Output exactly this format (no markdown headers, no asterisks, no bullets — just text):

WEEK 1 — <theme in 2-4 words>
<one short sentence: the smallest possible action they should commit to this week. Be ridiculously small.>

WEEK 2 — <theme>
<one short sentence: a small step up from week 1.>

WEEK 3 — <theme>
<one short sentence: another step up.>

WEEK 4 — <theme>
<one short sentence: solidify the habit / hit a milestone.>

ONE RULE
<one short rule, like "no zero days" or "if you slip, return same day, don't restart" — pick something fitting the goal.>

Total under 130 words. No medical claims. No moralizing. For "break" goals: focus on replacement behaviors and triggers, not willpower.
For nicotine, alcohol, or other substance dependency, suggest professional support in the ONE RULE line, and keep the plan as harm-reduction support rather than a cure.`;

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { title, type, emoji, name } = parsed.data;

  const userPrompt =
    `Goal: ${emoji ? emoji + ' ' : ''}${title}\n` +
    `Type: ${type === 'build' ? 'build a new habit' : 'break / reduce an unwanted habit'}\n` +
    (name ? `User's name: ${name}.\n` : '') +
    `Write the 4-week plan now.`;

  const result = await generateText({
    model: MODEL,
    system: SYSTEM,
    prompt: userPrompt,
  });

  return Response.json({ plan: result.text });
}
