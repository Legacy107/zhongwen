import { SignInForm } from "./SignInForm";

export const metadata = { title: "Sign in — HánViệt" };

export default function SignInPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-5">
      <SignInForm />
    </main>
  );
}
