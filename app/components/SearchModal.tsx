"use client";

import { useState, useEffect, useCallback } from "react";
import type { DownloadProtocol } from "@/app/lib/types";
import { useAlert } from "./AlertDialog";

interface ReleaseInfo {
  guid: string;
  title: string;
  indexer: string;
  indexerId: number;
  downloadUrl: string;
  infoUrl?: string;
  publishDate: Date;
  size: number;
  protocol: DownloadProtocol;
  seeders?: number;
  leechers?: number;
  volumeNumber?: number;
  chapterNumbers?: number[];
  quality?: string;
  releaseGroup?: string;
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  seriesId: number;
  seriesTitle: string;
  volumeId?: number;
  chapterId?: number;
}

const PAGE_SIZE = 25;

export function SearchModal({
  isOpen,
  onClose,
  seriesId,
  seriesTitle,
  volumeId,
  chapterId,
}: SearchModalProps) {
  const { showAlert } = useAlert();
  const [releases, setReleases] = useState<ReleaseInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState(seriesTitle);
  const [grabbing, setGrabbing] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"seeders" | "size" | "date">("seeders");
  const [protocolFilter, setProtocolFilter] = useState<"all" | "TORRENT" | "USENET">("all");
  const [page, setPage] = useState(1);

  const search = useCallback(async (term?: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      if (term) {
        params.set("term", term);
      } else {
        params.set("seriesId", seriesId.toString());
        if (volumeId) params.set("volumeId", volumeId.toString());
        if (chapterId) params.set("chapterId", chapterId.toString());
      }
      
      const res = await fetch(`/api/v1/release?${params}`);
      
      if (!res.ok) {
        throw new Error("Search failed");
      }
      
      const data = await res.json();
      setReleases(data.releases || []);
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [seriesId, volumeId, chapterId]);

  useEffect(() => {
    if (isOpen) {
      search();
    }
  }, [isOpen, search]);

  const handleGrab = async (release: ReleaseInfo) => {
    setGrabbing(release.guid);
    try {
      const res = await fetch("/api/v1/release/grab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          indexerId: release.indexerId,
          guid: release.guid,
          downloadUrl: release.downloadUrl,
          seriesId,
          volumeId,
          chapterId,
        }),
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to grab release (${res.status})`);
      }
      
      // Mark as grabbed
      setReleases(prev => prev.filter(r => r.guid !== release.guid));
    } catch (err) {
      showAlert({ message: err instanceof Error ? err.message : "Failed to grab release", type: "error" });
    } finally {
      setGrabbing(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KiB", "MiB", "GiB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const formatAge = (date: Date) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    return `${days} days`;
  };

  const filteredReleases = releases.filter(r => 
    protocolFilter === "all" || r.protocol === protocolFilter
  );

  // Reset to page 1 when filter changes result count
  useEffect(() => {
    setPage(1);
  }, [protocolFilter, sortBy]);

  const sortedReleases = [...filteredReleases].sort((a, b) => {
    switch (sortBy) {
      case "seeders":
        return (b.seeders || 0) - (a.seeders || 0);
      case "size":
        return b.size - a.size;
      case "date":
        return new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime();
      default:
        return 0;
    }
  });

  // Pagination
  const totalPages = Math.ceil(sortedReleases.length / PAGE_SIZE);
  const paginatedReleases = sortedReleases.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/70 transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="flex min-h-full items-start justify-center p-2 sm:p-4 pt-8 sm:pt-16">
        <div className="relative w-full max-w-6xl bg-zinc-900 rounded-lg shadow-2xl border border-zinc-800">
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-zinc-800">
            <h2 className="text-base sm:text-lg font-medium truncate pr-4">
              Search - {seriesTitle}
              {volumeId && <span className="text-zinc-400 hidden sm:inline"> (Volume)</span>}
              {chapterId && <span className="text-zinc-400 hidden sm:inline"> (Chapter)</span>}
            </h2>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white transition-colors flex-shrink-0"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Search Bar */}
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-zinc-800">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search(searchTerm)}
                placeholder="Search for releases..."
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 sm:px-4 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => search(searchTerm)}
                  disabled={loading}
                  className="flex-1 sm:flex-initial px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 rounded-lg font-medium transition-colors text-sm"
                >
                  {loading ? "..." : "Search"}
                </button>
                <button
                  onClick={() => search()}
                  disabled={loading}
                  className="flex-1 sm:flex-initial px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 rounded-lg font-medium transition-colors text-sm"
                  title="Search by series title"
                >
                  Auto
                </button>
              </div>
            </div>
            
            {/* Sort & Filter Options */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-3">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm text-zinc-400">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 sm:px-3 py-1 text-xs sm:text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="seeders">Seeders</option>
                  <option value="size">Size</option>
                  <option value="date">Date</option>
                </select>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm text-zinc-400">Protocol:</span>
                <select
                  value={protocolFilter}
                  onChange={(e) => setProtocolFilter(e.target.value as typeof protocolFilter)}
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 sm:px-3 py-1 text-xs sm:text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="all">All</option>
                  <option value="TORRENT">Torrent</option>
                  <option value="USENET">Usenet</option>
                </select>
              </div>
              
              <span className="text-xs sm:text-sm text-zinc-500 ml-auto">
                {sortedReleases.length > 0 
                  ? `${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, sortedReleases.length)} of ${sortedReleases.length}`
                  : `0 results`}
              </span>
            </div>
          </div>
          
          {/* Results */}
          <div className="max-h-[50vh] sm:max-h-[60vh] overflow-y-auto">
            {error && (
              <div className="px-4 sm:px-6 py-4 text-red-400 bg-red-900/20 text-sm">
                {error}
              </div>
            )}
            
            {loading && releases.length === 0 && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            )}
            
            {!loading && releases.length === 0 && !error && (
              <div className="py-12 text-center text-zinc-400 text-sm">
                No releases found. Try a different search term.
              </div>
            )}
            
            {paginatedReleases.length > 0 && (
              <>
                {/* Mobile Card View */}
                <div className="md:hidden divide-y divide-zinc-800">
                  {paginatedReleases.map((release) => (
                    <div key={release.guid} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-100 break-words">
                            {release.title}
                          </p>
                          <p className="text-xs text-zinc-400 mt-1">
                            {release.indexer} • {formatAge(release.publishDate)}
                          </p>
                        </div>
                        <button
                          onClick={() => handleGrab(release)}
                          disabled={grabbing === release.guid}
                          className="p-2 bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 flex-shrink-0"
                          title="Grab release"
                        >
                          {grabbing === release.guid ? (
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={`px-2 py-0.5 rounded font-medium ${
                          release.protocol === "USENET" 
                            ? "bg-purple-600 text-white" 
                            : "bg-orange-600 text-white"
                        }`}>
                          {release.protocol === "USENET" ? "nzb" : "torrent"}
                        </span>
                        <span className="text-zinc-300">{formatSize(release.size)}</span>
                        {release.seeders !== undefined && (
                          <span className={`px-2 py-0.5 rounded font-medium ${
                            release.seeders > 10 ? "bg-green-600 text-white" :
                            release.seeders > 0 ? "bg-yellow-600 text-white" :
                            "bg-red-600 text-white"
                          }`}>
                            {release.seeders}/{release.leechers || 0}
                          </span>
                        )}
                        {release.quality && (
                          <span className="px-2 py-0.5 rounded bg-zinc-700 text-zinc-200">
                            {release.quality}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table View */}
                <table className="w-full hidden md:table">
                <thead className="bg-zinc-800/50 sticky top-0">
                  <tr className="text-left text-sm text-zinc-400">
                    <th className="px-4 py-3 font-medium w-16">Source</th>
                    <th className="px-4 py-3 font-medium w-24">Age</th>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium w-28">Indexer</th>
                    <th className="px-4 py-3 font-medium w-20 text-right">Size</th>
                    <th className="px-4 py-3 font-medium w-20 text-center">Peers</th>
                    <th className="px-4 py-3 font-medium w-24">Quality</th>
                    <th className="px-4 py-3 font-medium w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedReleases.map((release) => (
                    <tr 
                      key={release.guid}
                      className="border-t border-zinc-800 hover:bg-zinc-800/30 transition-colors"
                    >
                      {/* Source */}
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded font-medium ${
                          release.protocol === "USENET" 
                            ? "bg-purple-600 text-white" 
                            : "bg-orange-600 text-white"
                        }`}>
                          {release.protocol === "USENET" ? "nzb" : "torrent"}
                        </span>
                      </td>
                      {/* Age */}
                      <td className="px-4 py-3 text-sm text-zinc-300">
                        {formatAge(release.publishDate)}
                      </td>
                      {/* Title */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm text-zinc-100">
                          {release.title}
                        </div>
                      </td>
                      {/* Indexer */}
                      <td className="px-4 py-3">
                        <div className="text-sm text-zinc-300">{release.indexer}</div>
                      </td>
                      {/* Size */}
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-zinc-300">{formatSize(release.size)}</span>
                      </td>
                      {/* Peers */}
                      <td className="px-4 py-3 text-center">
                        {release.seeders !== undefined ? (
                          <span className={`text-xs px-2 py-1 rounded font-medium ${
                            release.seeders > 10 ? "bg-green-600 text-white" :
                            release.seeders > 0 ? "bg-yellow-600 text-white" :
                            "bg-red-600 text-white"
                          }`}>
                            {release.seeders} / {release.leechers || 0}
                          </span>
                        ) : (
                          <span className="text-sm text-zinc-500">-</span>
                        )}
                      </td>
                      {/* Quality */}
                      <td className="px-4 py-3">
                        {release.quality && (
                          <span className="text-xs px-2 py-1 rounded bg-zinc-700 text-zinc-200">
                            {release.quality}
                          </span>
                        )}
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end">
                          {/* Download */}
                          <button
                            onClick={() => handleGrab(release)}
                            disabled={grabbing === release.guid}
                            className="p-1.5 text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
                            title="Grab release"
                          >
                            {grabbing === release.guid ? (
                              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </>
            )}
          </div>
          
          {/* Footer */}
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-zinc-800 flex items-center justify-between">
            {/* Pagination Controls */}
            {totalPages > 1 ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="p-2 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="First page"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Previous page"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-sm text-zinc-400 px-2">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Next page"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="p-2 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Last page"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            ) : (
              <div />
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg font-medium transition-colors text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
