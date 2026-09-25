import { SettingsScreen } from "@/components/settings/SettingsScreen";

export const metadata = { title: "Settings — HánViệt" };

export default function SettingsPage() {
  return (
    <main className="flex flex-1 flex-col">
      <SettingsScreen />
    </main>
  );
}
