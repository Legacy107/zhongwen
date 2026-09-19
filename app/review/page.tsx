import { ReviewSession } from "./ReviewSession";

export const metadata = { title: "Review — HánViệt" };

export default function ReviewPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-5">
      <ReviewSession />
    </main>
  );
}
