"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Header } from "@/app/components/Header";

// Proxy external images through our backend to avoid rate limiting
function proxyImageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  // Only proxy external URLs
  if (url.startsWith('/') || url.startsWith('data:')) return url;
  return `/api/v1/image-proxy?url=${encodeURIComponent(url)}`;
}

interface Series {
  id: number;
  title: string;
  year?: number;
  overview?: string;
  coverImage?: string;
  mediaType: string;
  status: string;
  monitorStatus: string;
  volumeCount: number;
  chapterCount: number;
}

export default function LibraryPage() {
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    fetchSeries();
  }, []);

  const fetchSeries = async () => {
    try {
      const res = await fetch("/api/v1/series");
      const data = await res.json();
      // Map API response to expected interface
      setSeries(data.map((s: any) => ({
        id: s.id,
        title: s.title,
        year: s.year,
        overview: s.overview,
        coverImage: s.imageUrl,
        mediaType: s.mediaType,
        status: s.status,
        monitorStatus: s.monitorStatus,
        volumeCount: s._count?.volumes || s.volumeCount || 0,
        chapterCount: s._count?.chapters || s.chapterCount || 0,
      })));
    } catch (error) {
      console.error("Failed to fetch series:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredSeries = series.filter((s) =>
    s.title.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Header />

      <main className="mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold">Library</h2>
          <Link
            href="/add/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            + Add Series
          </Link>
        </div>

        {/* Filters & View Toggle */}
        <div className="flex items-center gap-4 mb-6">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter series..."
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex rounded-lg border border-zinc-700 overflow-hidden ml-auto">
            <button
              onClick={() => setViewMode("grid")}
              className={`px-3 py-2 text-sm ${
                viewMode === "grid"
                  ? "bg-zinc-700 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:text-white"
              }`}
            >
              ▦ Grid
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-2 text-sm ${
                viewMode === "list"
                  ? "bg-zinc-700 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:text-white"
              }`}
            >
              ☰ List
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        )}

        {/* Empty State */}
        {!loading && series.length === 0 && (
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-12 text-center">
            <span className="text-6xl mb-4 block">📚</span>
            <h3 className="text-xl font-medium mb-2">Your library is empty</h3>
            <p className="text-zinc-400 mb-6">
              Get started by adding your first series
            </p>
            <Link
              href="/add/new"
              className="inline-block rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700 transition-colors"
            >
              + Add Series
            </Link>
          </div>
        )}

        {/* Grid View */}
        {!loading && filteredSeries.length > 0 && viewMode === "grid" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredSeries.map((s) => (
              <Link
                key={s.id}
                href={`/series/${s.id}`}
                className="group rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden hover:border-zinc-700 transition-colors"
              >
                <div className="aspect-[2/3] bg-zinc-800 relative">
                  {s.coverImage ? (
                    <img
                      src={proxyImageUrl(s.coverImage)}
                      alt={s.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600">
                      <span className="text-4xl">📚</span>
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      s.monitorStatus === "ALL" 
                        ? "bg-green-600" 
                        : s.monitorStatus === "NONE"
                        ? "bg-zinc-600"
                        : "bg-yellow-600"
                    }`}>
                      {s.monitorStatus === "ALL" ? "Monitored" : s.monitorStatus === "NONE" ? "Unmonitored" : "Partial"}
                    </span>
                  </div>
                </div>
                <div className="p-3">
                  <h3 className="font-medium text-sm truncate group-hover:text-blue-400 transition-colors">
                    {s.title}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1">
                    {s.volumeCount} Vol · {s.chapterCount} Ch
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* List View */}
        {!loading && filteredSeries.length > 0 && viewMode === "list" && (
          <div className="space-y-2">
            {filteredSeries.map((s) => (
              <Link
                key={s.id}
                href={`/series/${s.id}`}
                className="flex items-center gap-4 rounded-lg bg-zinc-900 border border-zinc-800 p-4 hover:border-zinc-700 transition-colors"
              >
                <div className="w-12 h-18 bg-zinc-800 rounded overflow-hidden flex-shrink-0">
                  {s.coverImage ? (
                    <img
                      src={proxyImageUrl(s.coverImage)}
                      alt={s.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600">
                      <span className="text-xl">📚</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium truncate">{s.title}</h3>
                  <p className="text-sm text-zinc-400">
                    {s.year && `${s.year} · `}
                    {s.mediaType} · {s.status}
                  </p>
                </div>
                <div className="text-right text-sm text-zinc-400">
                  <div>{s.volumeCount} Volumes</div>
                  <div>{s.chapterCount} Chapters</div>
                </div>
                <span className={`text-xs px-2 py-1 rounded ${
                  s.monitorStatus === "ALL" 
                    ? "bg-green-600" 
                    : s.monitorStatus === "NONE"
                    ? "bg-zinc-600"
                    : "bg-yellow-600"
                }`}>
                  {s.monitorStatus === "ALL" ? "Monitored" : s.monitorStatus === "NONE" ? "Unmonitored" : "Partial"}
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* No results after filter */}
        {!loading && series.length > 0 && filteredSeries.length === 0 && (
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-8 text-center">
            <p className="text-zinc-400">No series match "{filter}"</p>
          </div>
        )}
      </main>
    </div>
  );
}
