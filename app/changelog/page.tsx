import { readFileSync } from "node:fs";
import path from "node:path";
import { PageHeader } from "@/components/ui/Controls";
import { parseChangelog } from "@/lib/changelog";

export const metadata = { title: "What's new — HánViệt" };

/** CHANGELOG.md, read at build time: the page is static, so it ships with the version it describes. */
export default function ChangelogPage() {
  const releases = parseChangelog(readFileSync(path.join(process.cwd(), "CHANGELOG.md"), "utf8"));
  const current = process.env.NEXT_PUBLIC_APP_VERSION;
  return (
    <main className="flex flex-1 flex-col pb-10">
      <PageHeader title="What's new" back="/settings" />
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4">
        {releases.map((r) => (
          <section key={r.version} className="card flex flex-col gap-2 px-4 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-extrabold text-ink">Version {r.version}</h2>
              <span className="text-sm font-bold text-ink-3">
                {r.version === current ? "This version · " : ""}
                {new Date(`${r.date}T12:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            </div>
            {r.blocks.map((b, i) =>
              b.kind === "bullet" ? (
                <p key={i} className="flex gap-2 text-sm text-ink-2">
                  <span aria-hidden className="text-green">•</span>
                  <span>{b.text}</span>
                </p>
              ) : (
                <p key={i} className="text-sm font-semibold text-ink-2">
                  {b.text}
                </p>
              ),
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
