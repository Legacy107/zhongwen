export default function Offline() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-5xl">离线</p>
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="max-w-xs text-sm text-neutral-400">
        Reviews you already downloaded still work. Anything new will load once you reconnect.
      </p>
    </main>
  );
}
