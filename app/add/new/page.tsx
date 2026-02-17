"use client";

import Link from "next/link";
import { useState } from "react";

interface SearchResult {
  title: string;
  year?: number;
  overview?: string;
  coverImage?: string;
  provider: "comicvine" | "anilist";
  providerId: string;
  mediaType: string;
  status?: string;
  volumeCount?: number;
  chapterCount?: number;
  malId?: string;
  comicVineId?: string;
  anilistId?: string;
}

export default function AddSeriesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [mediaSource, setMediaSource] = useState<"comics" | "manga">("comics");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setLoading(true);
    setSearched(true);
    try {
      const provider = mediaSource === "comics" ? "comicvine" : "mal";
      const res = await fetch(`/api/v1/series/lookup?term=${encodeURIComponent(searchTerm)}&provider=${provider}`);
      const data = await res.json();
      // API returns { results: [...], errors?: [...] }
      const searchResults = data.results || data;
      setResults(searchResults.map((r: any) => ({
        title: r.title,
        year: r.year,
        overview: r.overview,
        coverImage: r.imageUrl,
        provider: r.provider?.toLowerCase() === 'comicvine' ? 'comicvine' : 'anilist',
        providerId: r.foreignId,
        mediaType: r.mediaType,
        status: r.status,
        volumeCount: r.volumeCount,
        chapterCount: r.chapterCount,
        malId: r.externalIds?.malId,
        comicVineId: r.externalIds?.comicVineId,
        anilistId: r.externalIds?.anilistId,
      })));
    } catch (error) {
      console.error("Search failed:", error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (result: SearchResult) => {
    try {
      const res = await fetch("/api/v1/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          foreignId: result.providerId,
          title: result.title,
          year: result.year,
          overview: result.overview,
          imageUrl: result.coverImage,
          mediaType: result.mediaType,
          status: result.status,
          volumeCount: result.volumeCount,
          chapterCount: result.chapterCount,
          malId: result.malId,
          comicVineId: result.comicVineId,
          options: {
            monitored: true,
            monitorStatus: "ALL",
          },
        }),
      });
      
      if (res.ok) {
        const series = await res.json();
        window.location.href = `/series/${series.id}`;
      } else if (res.status === 409) {
        const data = await res.json();
        // Series already exists, redirect to it
        if (data.series?.id) {
          window.location.href = `/series/${data.series.id}`;
        }
      }
    } catch (error) {
      console.error("Failed to add series:", error);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Header />
      
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-2">Add New Series</h2>
          <p className="text-zinc-400">
            Search for comics or manga to add to your library
          </p>
        </div>

        {/* Media Type Selector */}
        <div className="mb-6">
          <div className="inline-flex rounded-lg border border-zinc-700 p-1 bg-zinc-800/50">
            <button
              type="button"
              onClick={() => {
                setMediaSource("comics");
                setResults([]);
                setSearched(false);
              }}
              className={`px-6 py-2.5 rounded-md text-sm font-medium transition-colors ${
                mediaSource === "comics"
                  ? "bg-red-600 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              🦸 Comics
            </button>
            <button
              type="button"
              onClick={() => {
                setMediaSource("manga");
                setResults([]);
                setSearched(false);
              }}
              className={`px-6 py-2.5 rounded-md text-sm font-medium transition-colors ${
                mediaSource === "manga"
                  ? "bg-blue-600 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              📖 Manga
            </button>
          </div>
          <p className="text-xs text-zinc-500 mt-2">
            {mediaSource === "comics" 
              ? "Searching ComicVine for Western comics, graphic novels, and comic book series"
              : "Searching AniList for manga, manhwa, manhua, and light novels"
            }
          </p>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex gap-4">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={mediaSource === "comics" ? "Search for comics..." : "Search for manga..."}
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </form>

        {/* Results */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-8 text-center">
            <p className="text-zinc-400">No results found for "{searchTerm}"</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="space-y-4">
            {results.map((result, index) => (
              <div
                key={`${result.provider}-${result.providerId}-${index}`}
                className="flex gap-4 rounded-lg bg-zinc-900 border border-zinc-800 p-4 hover:border-zinc-700 transition-colors"
              >
                {/* Cover Image */}
                <div className="flex-shrink-0 w-24 h-36 bg-zinc-800 rounded-md overflow-hidden">
                  {result.coverImage ? (
                    <img
                      src={result.coverImage}
                      alt={result.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600">
                      <span className="text-3xl">📚</span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="text-lg font-medium truncate">
                        {result.title}
                        {result.year && (
                          <span className="text-zinc-500 ml-2">({result.year})</span>
                        )}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          result.provider === "comicvine" 
                            ? "bg-red-900/50 text-red-300" 
                            : "bg-blue-900/50 text-blue-300"
                        }`}>
                          {result.provider === "comicvine" ? "ComicVine" : "AniList"}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                          {result.mediaType}
                        </span>
                        {result.status && (
                          <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                            {result.status}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleAdd(result)}
                      className="flex-shrink-0 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
                    >
                      + Add
                    </button>
                  </div>
                  {result.overview && (
                    <p className="mt-2 text-sm text-zinc-400 line-clamp-2">
                      {result.overview}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="border-b border-zinc-800 bg-zinc-900">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <span className="text-2xl">🖋️</span>
            <h1 className="text-xl font-bold">Inkarr</h1>
          </Link>
        </div>
        <nav className="flex items-center gap-6">
          <Link href="/series" className="text-sm text-zinc-400 hover:text-white transition-colors">
            Library
          </Link>
          <Link href="/calendar" className="text-sm text-zinc-400 hover:text-white transition-colors">
            Calendar
          </Link>
          <Link href="/activity" className="text-sm text-zinc-400 hover:text-white transition-colors">
            Activity
          </Link>
          <Link href="/wanted" className="text-sm text-zinc-400 hover:text-white transition-colors">
            Wanted
          </Link>
          <Link href="/settings" className="text-sm text-zinc-400 hover:text-white transition-colors">
            Settings
          </Link>
        </nav>
      </div>
    </header>
  );
}
