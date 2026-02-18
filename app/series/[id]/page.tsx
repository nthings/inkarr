"use client";

import React from "react";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { SearchModal } from "@/app/components/SearchModal";
import { Header } from "@/app/components/Header";

// Proxy external images through our backend to avoid rate limiting
function proxyImageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  // Only proxy external URLs
  if (url.startsWith('/') || url.startsWith('data:')) return url;
  return `/api/v1/image-proxy?url=${encodeURIComponent(url)}`;
}

interface Volume {
  id: number;
  volumeNumber: number;
  title?: string;
  releaseDate?: string;
  imageUrl?: string;
  monitored: boolean;
  hasFile: boolean;
  mediaFiles?: MediaFile[];
}

interface Chapter {
  id: number;
  chapterNumber: number;
  title?: string;
  volumeId?: number;
  releaseDate?: string;
  imageUrl?: string;
  monitored: boolean;
  hasFile: boolean;
  mediaFiles?: MediaFile[];
}

interface MediaFile {
  id: number;
  path: string;
  relativePath: string;
  size: number;
  format: string;
}

interface Series {
  id: number;
  title: string;
  sortTitle: string;
  year?: number;
  overview?: string;
  coverImage?: string;
  bannerImage?: string;
  mediaType: string;
  status: string;
  monitorStatus: string;
  path?: string;
  qualityProfileId?: number;
  metadataProvider?: string;
  metadataProviderId?: string;
  volumes: Volume[];
  chapters: Chapter[];
  createdAt: string;
  updatedAt: string;
}

export default function SeriesDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [series, setSeries] = useState<Series | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [activeTab, setActiveTab] = useState<"volumes" | "chapters" | "files">("volumes");
  const [showSearch, setShowSearch] = useState(false);
  const [searchTarget, setSearchTarget] = useState<{ volumeId?: number; chapterId?: number } | null>(null);
  const [showFilePicker, setShowFilePicker] = useState<{ type: 'volume' | 'chapter'; id: number } | null>(null);
  const [showFileInfo, setShowFileInfo] = useState<{ type: 'volume' | 'chapter'; id: number; files: MediaFile[] } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ synced: number; total: number } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (params.id) {
      fetchSeries(params.id as string);
    }
  }, [params.id]);

  // Fetch Calibre sync status when series loads
  useEffect(() => {
    if (series?.id) {
      fetch(`/api/v1/calibre/sync?seriesId=${series.id}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) {
            setSyncStatus({ synced: data.synced, total: data.total });
          }
        })
        .catch(() => {});
    }
  }, [series?.id]);

  const fetchSeries = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/series/${id}?includeVolumes=true&includeChapters=true`);
      if (res.ok) {
        const data = await res.json();
        // Map API response to expected interface
        setSeries({
          id: data.id,
          title: data.title,
          sortTitle: data.sortTitle,
          year: data.year,
          overview: data.overview,
          coverImage: data.imageUrl,
          bannerImage: data.bannerUrl,
          mediaType: data.mediaType,
          status: data.status,
          monitorStatus: data.monitorStatus,
          path: data.rootFolderPath,
          qualityProfileId: data.qualityProfileId,
          metadataProvider: data.comicVineId ? 'comicvine' : data.malId ? 'mal' : undefined,
          metadataProviderId: data.foreignId,
          volumes: (data.volumes || []).map((v: any) => ({
            ...v,
            hasFile: v.mediaFiles && v.mediaFiles.length > 0,
          })),
          chapters: (data.chapters || []).map((c: any) => ({
            ...c,
            hasFile: c.mediaFiles && c.mediaFiles.length > 0,
          })),
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        });
      } else {
        router.push("/series");
      }
    } catch (error) {
      console.error("Failed to fetch series:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!series) return;
    if (!confirm(`Are you sure you want to delete "${series.title}"?`)) return;

    try {
      const res = await fetch(`/api/v1/series/${series.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/series");
      }
    } catch (error) {
      console.error("Failed to delete series:", error);
    }
  };

  const handleRefresh = useCallback(async () => {
    if (!series) return;
    setRefreshing(true);
    try {
      // Trigger metadata refresh and fetch issues
      const res = await fetch(`/api/v1/series/${series.id}/refresh`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        console.log(`Refreshed: ${data.message}`);
      }
      // Reload series data
      await fetchSeries(series.id.toString());
    } catch (error) {
      console.error("Failed to refresh:", error);
    } finally {
      setRefreshing(false);
    }
  }, [series]);

  const toggleVolumeMonitored = async (volumeId: number, currentMonitored: boolean) => {
    if (!series) return;
    try {
      const res = await fetch(`/api/v1/volume/${volumeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monitored: !currentMonitored }),
      });
      if (res.ok) {
        // Update local state
        setSeries(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            volumes: prev.volumes.map(v => 
              v.id === volumeId ? { ...v, monitored: !currentMonitored } : v
            ),
          };
        });
      }
    } catch (error) {
      console.error("Failed to toggle volume monitoring:", error);
    }
  };

  const toggleChapterMonitored = async (chapterId: number, currentMonitored: boolean) => {
    if (!series) return;
    try {
      const res = await fetch(`/api/v1/chapter/${chapterId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monitored: !currentMonitored }),
      });
      if (res.ok) {
        // Update local state
        setSeries(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            chapters: prev.chapters.map(c => 
              c.id === chapterId ? { ...c, monitored: !currentMonitored } : c
            ),
          };
        });
      }
    } catch (error) {
      console.error("Failed to toggle chapter monitoring:", error);
    }
  };

  const handleSearch = (volumeId?: number, chapterId?: number) => {
    setSearchTarget({ volumeId, chapterId });
    setShowSearch(true);
  };

  const handleImportFromDownloads = async () => {
    if (!series) return;
    setImporting(true);
    try {
      // First, scan for files matching this series
      const scanRes = await fetch('/api/v1/import/scan');
      if (!scanRes.ok) throw new Error('Failed to scan downloads');
      
      const scanData = await scanRes.json();
      const matchingSeries = scanData.series?.find((s: any) => 
        s.cleanTitle === series.title.toLowerCase().replace(/[^a-z0-9]/g, '') ||
        s.existingSeriesId === series.id
      );
      
      if (!matchingSeries || matchingSeries.files.length === 0) {
        alert('No matching files found in downloads folder');
        return;
      }
      
      // Import the matching files
      const importRes = await fetch('/api/v1/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedFiles: matchingSeries.files.map((f: any) => f.path),
          seriesId: series.id,
        }),
      });
      
      if (!importRes.ok) throw new Error('Failed to import files');
      
      const result = await importRes.json();
      alert(`Successfully imported ${result.imported} file(s)${result.failed > 0 ? `, ${result.failed} failed` : ''}`);
      
      // Refresh series data
      await fetchSeries(series.id.toString());
    } catch (error) {
      console.error('Import error:', error);
      alert('Failed to import files: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setImporting(false);
    }
  };

  const handleSyncToCalibrary = async () => {
    if (!series) return;
    setSyncing(true);
    setSyncStatus(null);
    
    try {
      // First check sync status
      const statusRes = await fetch(`/api/v1/calibre/sync?seriesId=${series.id}`);
      if (!statusRes.ok) throw new Error('Failed to get sync status');
      
      const status = await statusRes.json();
      setSyncStatus({ synced: status.synced, total: status.total });
      
      if (status.unsynced === 0) {
        alert('All files are already synced to Calibre');
        return;
      }
      
      // Sync unsynced files
      const syncRes = await fetch('/api/v1/calibre/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seriesId: series.id,
        }),
      });
      
      if (!syncRes.ok) {
        const data = await syncRes.json();
        throw new Error(data.error || 'Failed to sync to Calibre');
      }
      
      const result = await syncRes.json();
      setSyncStatus({ synced: status.synced + result.synced, total: status.total });
      
      if (result.failed > 0) {
        alert(`Synced ${result.synced} file(s) to Calibre, ${result.failed} failed`);
      } else {
        alert(`Successfully synced ${result.synced} file(s) to Calibre`);
      }
    } catch (error) {
      console.error('Sync error:', error);
      alert('Failed to sync to Calibre: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setSyncing(false);
    }
  };

  const handleManualFileLink = async (type: 'volume' | 'chapter', id: number, filePath: string) => {
    if (!series) return;
    
    try {
      const res = await fetch(`/api/v1/${type}/${id}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          filePath,
          seriesId: series.id,
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to link file');
      }
      
      // Refresh series
      await fetchSeries(series.id.toString());
      setShowFilePicker(null);
    } catch (error) {
      console.error('Link error:', error);
      alert('Failed to link file: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const openFilePicker = (type: 'volume' | 'chapter', id: number) => {
    setShowFilePicker({ type, id });
  };

  const openFileInfo = (type: 'volume' | 'chapter', id: number, files: MediaFile[]) => {
    setShowFileInfo({ type, id, files });
  };

  const handleUnlinkFile = async (mediaFileId: number) => {
    if (!series) return;

    try {
      const res = await fetch(`/api/v1/mediafile/${mediaFileId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to unlink file');
      }

      // Refresh series
      await fetchSeries(series.id.toString());
      setShowFileInfo(null);
    } catch (error) {
      console.error('Unlink error:', error);
      alert('Failed to unlink file: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <Header />
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  if (!series) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <Header />
        <div className="mx-auto max-w-7xl px-4 py-8 text-center">
          <p className="text-zinc-400">Series not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Header />

      {/* Banner */}
      <div className="relative h-48 bg-gradient-to-b from-zinc-800 to-zinc-950">
        {series.bannerImage && (
          <img
            src={proxyImageUrl(series.bannerImage)}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-30"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 to-transparent" />
      </div>

      <main className="mx-auto max-w-7xl px-4 -mt-24 relative z-10">
        <div className="flex gap-6">
          {/* Cover */}
          <div className="flex-shrink-0 w-48">
            <div className="aspect-[2/3] rounded-lg bg-zinc-800 overflow-hidden shadow-xl">
              {series.coverImage ? (
                <img
                  src={proxyImageUrl(series.coverImage)}
                  alt={series.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600">
                  <span className="text-6xl">📚</span>
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 pt-24">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold">
                  {series.title}
                  {series.year && (
                    <span className="text-zinc-500 ml-2 font-normal">({series.year})</span>
                  )}
                </h1>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-sm px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                    {series.mediaType}
                  </span>
                  <span className="text-sm px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                    {series.status}
                  </span>
                  <span className={`text-sm px-2 py-0.5 rounded ${
                    series.monitorStatus === "ALL" 
                      ? "bg-green-600" 
                      : series.monitorStatus === "NONE"
                      ? "bg-zinc-600"
                      : "bg-yellow-600"
                  }`}>
                    {series.monitorStatus === "ALL" ? "Monitored" : series.monitorStatus === "NONE" ? "Unmonitored" : "Partial"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  <span className={refreshing ? "animate-spin" : ""}>↻</span>
                  {refreshing ? "Refreshing..." : "Refresh"}
                </button>
                <button
                  onClick={() => handleSearch()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 transition-colors"
                >
                  🔍 Search
                </button>
                <button
                  onClick={handleImportFromDownloads}
                  disabled={importing}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-500 disabled:opacity-50 transition-colors flex items-center gap-2"
                  title="Import matching files from downloads folder"
                >
                  {importing ? (
                    <>
                      <span className="animate-spin">↻</span>
                      Importing...
                    </>
                  ) : (
                    <>📥 Import</>
                  )}
                </button>
                <button
                  onClick={handleSyncToCalibrary}
                  disabled={syncing}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-500 disabled:opacity-50 transition-colors flex items-center gap-2"
                  title="Sync files to Calibre library"
                >
                  {syncing ? (
                    <>
                      <span className="animate-spin">↻</span>
                      Syncing...
                    </>
                  ) : (
                    <>📚 Calibre</>
                  )}
                </button>
                <button
                  onClick={() => router.push(`/series/${series.id}/edit`)}
                  className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
                >
                  ✎ Edit
                </button>
                <button
                  onClick={handleDelete}
                  className="rounded-lg bg-red-600/20 px-4 py-2 text-sm text-red-400 hover:bg-red-600/30 transition-colors"
                >
                  🗑 Delete
                </button>
              </div>
            </div>

            {series.overview && (
              <p className="mt-4 text-zinc-400 max-w-3xl">{series.overview}</p>
            )}

            {/* Stats */}
            <div className="flex items-center gap-6 mt-6">
              <div>
                <span className="text-2xl font-bold">{series.volumes?.length || 0}</span>
                <span className="text-zinc-500 ml-1">Volumes</span>
              </div>
              <div>
                <span className="text-2xl font-bold">{series.chapters?.length || 0}</span>
                <span className="text-zinc-500 ml-1">Chapters</span>
              </div>
              {syncStatus && (
                <div className="text-sm">
                  <span className="text-purple-400">📚 {syncStatus.synced}/{syncStatus.total}</span>
                  <span className="text-zinc-500 ml-1">in Calibre</span>
                </div>
              )}
              {series.path && (
                <div className="text-sm text-zinc-500">
                  📁 {series.path}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-8 border-b border-zinc-800">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab("volumes")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "volumes"
                  ? "border-blue-500 text-white"
                  : "border-transparent text-zinc-400 hover:text-white"
              }`}
            >
              Volumes ({series.volumes?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab("chapters")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "chapters"
                  ? "border-blue-500 text-white"
                  : "border-transparent text-zinc-400 hover:text-white"
              }`}
            >
              Chapters ({series.chapters?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab("files")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "files"
                  ? "border-blue-500 text-white"
                  : "border-transparent text-zinc-400 hover:text-white"
              }`}
            >
              Files
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="py-6">
          {activeTab === "volumes" && (
            <div>
              {series.volumes?.length === 0 ? (
                <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-8 text-center">
                  <p className="text-zinc-400">No volumes found</p>
                  <p className="text-sm text-zinc-500 mt-2">Click Refresh to fetch volumes from metadata provider</p>
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                  >
                    {refreshing ? "Refreshing..." : "Refresh Metadata"}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                  {series.volumes?.map((vol) => (
                    <div
                      key={vol.id}
                      className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden group relative"
                    >
                      {/* Cover Image */}
                      <div className="aspect-[2/3] bg-zinc-800 relative">
                        {vol.imageUrl || series.coverImage ? (
                          <img 
                            src={proxyImageUrl(vol.imageUrl || series.coverImage)} 
                            alt={`Volume ${vol.volumeNumber}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600">
                            <span className="text-4xl">📖</span>
                          </div>
                        )}
                        {/* Monitoring Toggle */}
                        <button
                          onClick={() => toggleVolumeMonitored(vol.id, vol.monitored)}
                          className={`absolute top-2 left-2 p-1.5 rounded transition-colors ${
                            vol.monitored 
                              ? "bg-blue-600 text-white" 
                              : "bg-zinc-800/80 text-zinc-500 hover:text-white"
                          }`}
                          title={vol.monitored ? "Click to unmonitor" : "Click to monitor"}
                        >
                          <svg className="w-4 h-4" fill={vol.monitored ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                          </svg>
                        </button>
                        {/* Action buttons overlay */}
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Search button */}
                          <button
                            onClick={() => handleSearch(vol.id)}
                            className="p-1.5 bg-blue-600 rounded hover:bg-blue-500"
                            title="Search for this volume"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                          </button>
                          {/* Manual file link button */}
                          <button
                            onClick={() => openFilePicker('volume', vol.id)}
                            className="p-1.5 bg-amber-600 rounded hover:bg-amber-500"
                            title="Manually link a file to this volume"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                          </button>
                        </div>
                        {/* Status Badge - clickable if has file */}
                        {vol.hasFile && vol.mediaFiles && vol.mediaFiles.length > 0 ? (
                          <button
                            onClick={() => openFileInfo('volume', vol.id, vol.mediaFiles!)}
                            className="absolute bottom-2 right-2 text-xs px-2 py-0.5 rounded bg-green-600 text-white hover:bg-green-500 transition-colors flex items-center gap-1"
                            title="Click to view file details"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            {vol.mediaFiles.length}
                          </button>
                        ) : (
                          <div className={`absolute bottom-2 right-2 text-xs px-2 py-0.5 rounded ${
                            vol.monitored
                              ? "bg-red-600 text-white"
                              : "bg-zinc-700 text-zinc-300"
                          }`}>
                            {vol.monitored ? "Missing" : "—"}
                          </div>
                        )}
                      </div>
                      {/* Info */}
                      <div className="p-2 text-center">
                        <div className="font-medium text-sm">Vol. {vol.volumeNumber}</div>
                        {vol.title && vol.title !== `Volume ${vol.volumeNumber}` && (
                          <div className="text-xs text-zinc-500 truncate" title={vol.title}>{vol.title}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "chapters" && (
            <div>
              {series.chapters?.length === 0 ? (
                <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-8 text-center">
                  <p className="text-zinc-400">No chapters found</p>
                  <p className="text-sm text-zinc-500 mt-2">Click Refresh to fetch chapters from metadata provider</p>
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                  >
                    {refreshing ? "Refreshing..." : "Refresh Metadata"}
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  {series.chapters?.map((ch) => (
                    <div
                      key={ch.id}
                      className="flex items-center justify-between rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 group hover:bg-zinc-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {/* Monitoring Toggle */}
                        <button
                          onClick={() => toggleChapterMonitored(ch.id, ch.monitored)}
                          className={`p-1 rounded transition-colors ${
                            ch.monitored 
                              ? "text-blue-500 hover:text-blue-400" 
                              : "text-zinc-600 hover:text-zinc-400"
                          }`}
                          title={ch.monitored ? "Click to unmonitor" : "Click to monitor"}
                        >
                          <svg className="w-4 h-4" fill={ch.monitored ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                          </svg>
                        </button>
                        <span className="text-zinc-400 w-16">Ch. {ch.chapterNumber}</span>
                        {ch.title && ch.title !== `Chapter ${ch.chapterNumber}` && (
                          <span className="text-zinc-200">{ch.title}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSearch(undefined, ch.id)}
                          className="p-1.5 bg-blue-600 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-500"
                          title="Search for this chapter"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => openFilePicker('chapter', ch.id)}
                          className="p-1.5 bg-amber-600 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-amber-500"
                          title="Manually link a file to this chapter"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                        </button>
                        {ch.hasFile && ch.mediaFiles && ch.mediaFiles.length > 0 ? (
                          <button
                            onClick={() => openFileInfo('chapter', ch.id, ch.mediaFiles!)}
                            className="text-xs px-2 py-0.5 rounded min-w-[70px] text-center bg-green-600/20 text-green-400 hover:bg-green-600/30 transition-colors flex items-center justify-center gap-1"
                            title="Click to view file details"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Downloaded
                          </button>
                        ) : (
                          <div className={`text-xs px-2 py-0.5 rounded min-w-[70px] text-center ${
                            ch.monitored
                              ? "bg-red-600/20 text-red-400"
                              : "bg-zinc-800 text-zinc-500"
                          }`}>
                            {ch.monitored ? "Missing" : "—"}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "files" && (
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-8 text-center">
              <p className="text-zinc-400">No files found</p>
              <p className="text-sm text-zinc-500 mt-2">
                Files will appear here once downloaded
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Search Modal */}
      {series && (
        <SearchModal
          isOpen={showSearch}
          onClose={() => {
            setShowSearch(false);
            setSearchTarget(null);
          }}
          seriesId={series.id}
          seriesTitle={series.title}
          volumeId={searchTarget?.volumeId}
          chapterId={searchTarget?.chapterId}
        />
      )}

      {/* File Picker Modal */}
      {showFilePicker && (
        <FilePickerModal
          isOpen={!!showFilePicker}
          onClose={() => setShowFilePicker(null)}
          onSelect={(filePath) => handleManualFileLink(showFilePicker.type, showFilePicker.id, filePath)}
          seriesTitle={series.title}
          itemType={showFilePicker.type}
          itemNumber={showFilePicker.type === 'volume' 
            ? series.volumes.find(v => v.id === showFilePicker.id)?.volumeNumber 
            : series.chapters.find(c => c.id === showFilePicker.id)?.chapterNumber
          }
        />
      )}

      {/* File Info Modal */}
      {showFileInfo && (
        <FileInfoModal
          isOpen={!!showFileInfo}
          onClose={() => setShowFileInfo(null)}
          onUnlink={handleUnlinkFile}
          files={showFileInfo.files}
          itemType={showFileInfo.type}
          itemId={showFileInfo.id}
        />
      )}
    </div>
  );
}

// File Picker Modal Component
function FilePickerModal({
  isOpen,
  onClose,
  onSelect,
  seriesTitle,
  itemType,
  itemNumber,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (filePath: string) => void;
  seriesTitle: string;
  itemType: 'volume' | 'chapter';
  itemNumber?: number;
}) {
  const [filePath, setFilePath] = useState('');
  const [availableFiles, setAvailableFiles] = useState<Array<{path: string; filename: string; size: number}>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadAvailableFiles();
    }
  }, [isOpen]);

  const loadAvailableFiles = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/import/scan');
      if (res.ok) {
        const data = await res.json();
        // Flatten all files from all series
        const files = data.series?.flatMap((s: any) => 
          s.files.map((f: any) => ({
            path: f.path,
            filename: f.filename,
            size: f.size,
          }))
        ) || [];
        setAvailableFiles(files);
      }
    } catch (error) {
      console.error('Failed to load files:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4">
        <div className="flex items-center justify-between p-4 border-b border-zinc-700">
          <div>
            <h2 className="text-lg font-semibold text-white">Link File to {itemType === 'volume' ? 'Volume' : 'Chapter'} {itemNumber}</h2>
            <p className="text-sm text-zinc-400">{seriesTitle}</p>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Manual path input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              Enter file path manually:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="/path/to/file.cbz"
                className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => filePath && onSelect(filePath)}
                disabled={!filePath}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                Link
              </button>
            </div>
          </div>

          {/* Available files from downloads */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              Or select from downloads folder:
            </label>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            ) : availableFiles.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                No files found in downloads folder
              </div>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {availableFiles.map((file) => (
                  <button
                    key={file.path}
                    onClick={() => onSelect(file.path)}
                    className="w-full text-left px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
                  >
                    <div className="text-sm text-white truncate">{file.filename}</div>
                    <div className="text-xs text-zinc-500">{formatSize(file.size)} • {file.path}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 p-4 border-t border-zinc-700">
          <button onClick={onClose} className="px-4 py-2 text-zinc-300 hover:text-white transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// File Info Modal Component
function FileInfoModal({
  isOpen,
  onClose,
  onUnlink,
  files,
  itemType,
  itemId,
}: {
  isOpen: boolean;
  onClose: () => void;
  onUnlink: (fileId: number) => void;
  files: Array<{ id: number; path: string; relativePath: string | null; size: number; format: string }>;
  itemType: 'volume' | 'chapter';
  itemId: number;
}) {
  if (!isOpen) return null;

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-xl shadow-2xl w-full max-w-lg mx-4 border border-zinc-700">
        <div className="p-4 border-b border-zinc-700">
          <h3 className="text-lg font-semibold text-white">
            {itemType === 'volume' ? 'Volume' : 'Chapter'} Files
          </h3>
          <p className="text-sm text-zinc-400 mt-1">
            {files.length} file{files.length !== 1 ? 's' : ''} linked
          </p>
        </div>

        <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
          {files.map((file) => (
            <div key={file.id} className="bg-zinc-800 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs font-medium rounded uppercase">
                      {file.format}
                    </span>
                    <span className="text-xs text-zinc-500">{formatSize(file.size)}</span>
                  </div>
                  <p className="text-sm text-white truncate" title={file.path}>
                    {file.relativePath || file.path.split('/').pop()}
                  </p>
                  <p className="text-xs text-zinc-500 truncate mt-1" title={file.path}>
                    {file.path}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (confirm('Are you sure you want to unlink this file? The file will not be deleted from disk.')) {
                      onUnlink(file.id);
                    }
                  }}
                  className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Unlink file"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3 p-4 border-t border-zinc-700">
          <button onClick={onClose} className="px-4 py-2 text-zinc-300 hover:text-white transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
