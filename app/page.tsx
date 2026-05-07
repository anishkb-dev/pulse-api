export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-50 p-8 font-sans dark:bg-black">
      <h1 className="text-2xl font-semibold tracking-tight">Pulse API</h1>
      <p className="max-w-md text-center text-sm text-zinc-600 dark:text-zinc-400">
        AI coach endpoint for the Pulse mobile app. POST to <code>/api/coach</code> with{' '}
        <code>{`{ messages, entries }`}</code>.
      </p>
    </main>
  );
}
