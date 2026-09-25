import { MascotFace } from "@/components/ui/Mascot";

export default function Offline() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="size-32">
        <MascotFace mood="sleep" />
      </div>
      <h1 className="text-2xl font-extrabold text-ink">You&apos;re offline</h1>
      <p className="max-w-xs text-ink-2">
        Reviews already on this device still work. Anything new loads once you reconnect.
      </p>
    </main>
  );
}
