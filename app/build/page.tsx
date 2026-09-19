import { BuildSession } from "./BuildSession";

export const metadata = { title: "Build — HánViệt" };

export default function BuildPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-5">
      <BuildSession />
    </main>
  );
}
