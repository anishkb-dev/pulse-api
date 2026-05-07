import { groq } from '@ai-sdk/groq';
import { generateObject } from 'ai';
import { z } from 'zod';

export const maxDuration = 30;

const MODEL = groq('openai/gpt-oss-20b');

const GoalInputSchema = z.object({
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
  level: z.number().int().min(1).max(100).default(1),
});

const STAT_SCHEMA = z.enum(['STR', 'VIT', 'INT', 'WIS', 'CHA']);

const SubtaskSchema = z.object({
  title: z.string().describe('Short imperative action under 60 chars'),
  why: z.string().describe('One short sentence on why this fits the dungeon theme'),
});

const DungeonSchema = z.object({
  name: z.string().describe('Dramatic dungeon name, e.g. "The Sleeper\'s Crypt"'),
  theme: z.string().describe('One-sentence summary of what mastering this week will achieve'),
  rewardXp: z
    .number()
    .int()
    .min(150)
    .max(500)
    .describe('Total bonus XP for clearing all subtasks'),
  rewardStat: STAT_SCHEMA.describe(
    'Single stat to boost on clear (STR, VIT, INT, WIS, or CHA)',
  ),
  rewardStatDelta: z.number().int().min(2).max(8),
  subtasks: z.array(SubtaskSchema).min(5).max(7),
});

const SYSTEM = `You are Pulse, designing a WEEKLY DUNGEON QUEST for the user — a Solo-Leveling-style themed multi-day challenge.

Rules:
- Pick a theme that ties to the user's active goals or recent state. If they're trying to quit smoking, design a dungeon around willpower/replacement behaviors. If sleep was poor, theme it around recovery.
- Subtasks are 5-7 specific actions doable across the week. Each is concrete and small (10 minutes or less most of the time). Spread the difficulty.
- Subtasks should feel like steps in a quest, not a generic to-do list. Use evocative but practical titles ("Cleanse the air — 10 min walk", "Forge the ritual — set tomorrow's clothes out tonight").
- Reward stat must match the dungeon's theme (sleep → VIT, focus/learning → INT, breaking habit → WIS, social → CHA, exercise → STR).
- Total reward XP scales with user level: 150-200 for low levels, 250-350 for mid, 350-500 for high.
- Dungeon name is dramatic but not corny. Examples: "The Hollow Hour", "Trial of the Forgotten Routine", "Ashes of the Vice".
- Theme is ONE sentence. No medical claims. No platitudes.`;

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { goals, entries, name, level } = parsed.data;

  const goalLines = goals.length
    ? goals
        .map(
          (g) =>
            `- ${g.emoji} ${g.title} [${g.type}]${g.recentCompletion !== undefined ? ` ${(g.recentCompletion * 100).toFixed(0)}% / 30d` : ''}`,
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
    (name ? `User: ${name}\n` : '') +
    `Hunter level: ${level}\n\n` +
    `Active goals:\n${goalLines}\n\n` +
    `Recent check-ins:\n${dataLines}\n\n` +
    `Design this week's dungeon now.`;

  const result = await generateObject({
    model: MODEL,
    system: SYSTEM,
    schema: DungeonSchema,
    prompt,
  });

  return Response.json(result.object);
}
