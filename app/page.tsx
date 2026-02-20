import Link from "next/link";
import prisma from "@/app/lib/db";
import { Header } from "@/app/components/Header";

// Disable static generation - page needs database at runtime
export const dynamic = 'force-dynamic';

export default async function Home() {
  // Fetch stats from database
  const [seriesCount, volumeCount, chapterCount, fileCount] = await Promise.all([
    prisma.series.count(),
    prisma.volume.count(),
    prisma.chapter.count(),
    prisma.mediaFile.count(),
  ]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Header />

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-6 md:py-8">
        {/* Welcome Section */}
        <div className="mb-6 md:mb-8 rounded-lg bg-zinc-900 p-4 sm:p-6 md:p-8 border border-zinc-800">
          <h2 className="mb-2 text-xl md:text-2xl font-semibold">Welcome to Inkarr</h2>
          <p className="text-sm md:text-base text-zinc-400">
            Your automated comic and manga collection manager
          </p>
        </div>

        {/* Quick Stats */}
        <div className="mb-6 md:mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard title="Series" value={seriesCount.toString()} icon="📚" />
          <StatCard title="Volumes" value={volumeCount.toString()} icon="📖" />
          <StatCard title="Chapters" value={chapterCount.toString()} icon="📄" />
          <StatCard title="Files" value={fileCount.toString()} icon="💾" />
        </div>

        {/* Getting Started */}
        <div className="rounded-lg bg-zinc-900 p-4 sm:p-6 border border-zinc-800">
          <h3 className="mb-4 text-base md:text-lg font-semibold">Getting Started</h3>
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SetupCard
              step={1}
              title="Add Root Folder"
              description="Configure where your comics and manga will be stored"
              href="/settings/mediamanagement"
            />
            <SetupCard
              step={2}
              title="Add Indexer"
              description="Connect to Newznab or Torznab indexers to search for releases"
              href="/settings/indexers"
            />
            <SetupCard
              step={3}
              title="Add Download Client"
              description="Configure qBittorrent, SABnzbd, or other download clients"
              href="/settings/downloadclients"
            />
            <SetupCard
              step={4}
              title="Import Existing Library"
              description="Scan your existing collection to add it to Inkarr"
              href="/settings/import"
            />
            <SetupCard
              step={5}
              title="Add Series"
              description="Search for comics or manga to add to your library"
              href="/add/new"
            />
            <SetupCard
              step={6}
              title="Configure Quality"
              description="Set up quality profiles for your preferred formats"
              href="/settings/quality"
            />
          </div>
        </div>

        {/* API Info */}
        <div className="mt-6 md:mt-8 rounded-lg bg-zinc-900/50 p-4 border border-zinc-800">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-xs sm:text-sm text-zinc-400 mb-2">
                REST API available at{" "}
                <code className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300 text-xs">
                  /api/v1/
                </code>
              </p>
              <div className="flex gap-4 text-xs sm:text-sm">
                <Link href="/api/v1/system/status" className="text-blue-400 hover:underline">
                  System Status
                </Link>
                <Link href="/api/docs" className="text-blue-400 hover:underline">
                  API Documentation
                </Link>
              </div>
            </div>
            <div className="text-right text-xs text-zinc-500">
              <div>Inkarr v0.0.1</div>
              <div>{process.platform} • Node.js {process.version}</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: string; icon: string }) {
  return (
    <div className="rounded-lg bg-zinc-900 p-3 sm:p-4 border border-zinc-800">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs sm:text-sm text-zinc-400">{title}</p>
          <p className="text-xl sm:text-2xl font-bold">{value}</p>
        </div>
        <span className="text-2xl sm:text-3xl">{icon}</span>
      </div>
    </div>
  );
}

function SetupCard({
  step,
  title,
  description,
  href,
}: {
  step: number;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-zinc-700 bg-zinc-800/50 p-3 sm:p-4 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold">
          {step}
        </span>
        <h4 className="text-sm sm:text-base font-medium group-hover:text-blue-400 transition-colors">{title}</h4>
      </div>
      <p className="text-xs sm:text-sm text-zinc-400">{description}</p>
    </Link>
  );
}
