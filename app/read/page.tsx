import { ReadView } from "./ReadView";

export const metadata = { title: "Read — HánViệt" };

export default function ReadPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-5">
      <ReadView />
    </main>
  );
}
