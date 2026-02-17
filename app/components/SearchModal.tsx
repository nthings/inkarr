"use client";

import { useState, useEffect, useCallback } from "react";
import type { DownloadProtocol } from "@/app/lib/types";

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

export function SearchModal({
  isOpen,
  onClose,
  seriesId,
  seriesTitle,
  volumeId,
  chapterId,
}: SearchModalProps) {
  const [releases, setReleases] = useState<ReleaseInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState(seriesTitle);
  const [grabbing, setGrabbing] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"seeders" | "size" | "date">("seeders");
  const [protocolFilter, setProtocolFilter] = useState<"all" | "TORRENT" | "USENET">("all");

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
      alert(err instanceof Error ? err.message : "Failed to grab release");
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/70 transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="flex min-h-full items-start justify-center p-4 pt-16">
        <div className="relative w-full max-w-6xl bg-zinc-900 rounded-lg shadow-2xl border border-zinc-800">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
            <h2 className="text-lg font-medium">
              Interactive Search - {seriesTitle}
              {volumeId && <span className="text-zinc-400"> (Volume)</span>}
              {chapterId && <span className="text-zinc-400"> (Chapter)</span>}
            </h2>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Search Bar */}
          <div className="px-6 py-4 border-b border-zinc-800">
            <div className="flex gap-3">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search(searchTerm)}
                placeholder="Search for releases..."
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={() => search(searchTerm)}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 rounded-lg font-medium transition-colors"
              >
                {loading ? "Searching..." : "Search"}
              </button>
              <button
                onClick={() => search()}
                disabled={loading}
                className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 rounded-lg font-medium transition-colors"
                title="Search by series title"
              >
                Auto
              </button>
            </div>
            
            {/* Sort & Filter Options */}
            <div className="flex items-center gap-4 mt-3">
              <span className="text-sm text-zinc-400">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="seeders">Seeders</option>
                <option value="size">Size</option>
                <option value="date">Date</option>
              </select>
              
              <span className="text-sm text-zinc-400 ml-4">Protocol:</span>
              <select
                value={protocolFilter}
                onChange={(e) => setProtocolFilter(e.target.value as typeof protocolFilter)}
                className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="all">All</option>
                <option value="TORRENT">Torrent</option>
                <option value="USENET">Usenet</option>
              </select>
              
              <span className="text-sm text-zinc-500 ml-auto">
                {filteredReleases.length} of {releases.length} release{releases.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          
          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto">
            {error && (
              <div className="px-6 py-4 text-red-400 bg-red-900/20">
                {error}
              </div>
            )}
            
            {loading && releases.length === 0 && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            )}
            
            {!loading && releases.length === 0 && !error && (
              <div className="py-12 text-center text-zinc-400">
                No releases found. Try a different search term.
              </div>
            )}
            
            {sortedReleases.length > 0 && (
              <table className="w-full">
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
                  {sortedReleases.map((release) => (
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
            )}
          </div>
          
          {/* Footer */}
          <div className="px-6 py-4 border-t border-zinc-800 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
