import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';
import { z } from 'zod';

export const maxDuration = 30;

const TEXT_MODEL = groq('llama-3.3-70b-versatile');

// ElevenLabs free-tier starter voice. Override with ELEVENLABS_VOICE_ID env to swap.
const DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Sarah - warm, calm female

const EntrySchema = z.object({
  createdAt: z.number(),
  mood: z.number().int().min(1).max(5),
  sleep: z.number().int().min(1).max(5),
  energy: z.number().int().min(1).max(5),
});

const GoalSchema = z.object({
  title: z.string(),
  type: z.enum(['build', 'break']),
  recentCompletion: z.number().min(0).max(1).optional(),
  streak: z.number().int().min(0).optional(),
});

const BodySchema = z.object({
  entries: z.array(EntrySchema).max(14).default([]),
  goals: z.array(GoalSchema).max(10).default([]),
  name: z.string().optional().default(''),
  occasion: z
    .enum(['daily', 'streak', 'goal_complete', 'rough_day'])
    .optional()
    .default('daily'),
});

const SYSTEM = `You write 20-30 second motivational voice messages from Pulse, a wellness coach.

Style:
- Warm, sincere, calm. Like a friend who knows you, not a sports coach.
- Speak directly TO the user using "you". Use their name once if given.
- Connect to one specific thing in their data — a goal they're working on, a recent rough day, or a streak. Be specific so it feels personal.
- One small, doable invitation for today.
- 50-90 words total. No lists, no headers, no markdown — pure speech.
- No platitudes. No "you got this!" / "believe in yourself" type fluff.
- End with one quiet, grounded line. Not hype.

Don't write stage directions, asterisks, or descriptions of tone — just the spoken words.`;

async function elevenLabsTts(text: string): Promise<{ base64: string; mediaType: string } | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.75,
          style: 0.2,
          use_speaker_boost: true,
        },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    console.error('ElevenLabs TTS failed:', res.status, err.slice(0, 200));
    return null;
  }

  const buf = await res.arrayBuffer();
  const base64 = Buffer.from(buf).toString('base64');
  return { base64, mediaType: 'audio/mpeg' };
}

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { entries, goals, name, occasion } = parsed.data;

  const recentLines = entries
    .slice(0, 5)
    .map((e) => {
      const d = new Date(e.createdAt).toISOString().slice(0, 10);
      return `${d}: mood ${e.mood}/5, sleep ${e.sleep}/5, energy ${e.energy}/5`;
    })
    .join('\n');

  const goalLines = goals
    .map(
      (g) =>
        `- ${g.type === 'build' ? 'Building' : 'Breaking'}: ${g.title}${
          g.streak ? ` (${g.streak}-day streak)` : ''
        }${g.recentCompletion !== undefined ? ` ${(g.recentCompletion * 100).toFixed(0)}% / 30d` : ''}`,
    )
    .join('\n');

  const prompt =
    (name ? `User: ${name}\n` : '') +
    `Occasion: ${occasion}\n\n` +
    (goalLines ? `Active goals:\n${goalLines}\n\n` : '') +
    (recentLines ? `Recent check-ins:\n${recentLines}\n\n` : '') +
    `Write the message now.`;

  const result = await generateText({
    model: TEXT_MODEL,
    system: SYSTEM,
    prompt,
  });

  const cleaned = result.text
    .replace(/[*_#`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const audio = await elevenLabsTts(cleaned);

  return Response.json({
    text: cleaned,
    audioBase64: audio?.base64 ?? null,
    mediaType: audio?.mediaType ?? null,
  });
}
