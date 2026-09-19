import { ToneSession } from "./ToneSession";

export const metadata = { title: "Tones — HánViệt" };

export default function TonesPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-5">
      <ToneSession />
    </main>
  );
}
