"use client";

import { useState, useEffect, useCallback } from "react";

interface QueueItem {
  id: string;
  name: string;
  size: number;
  downloaded: number;
  progress: number;
  status: string;
  downloadClient: string;
  eta?: number;
  downloadSpeed?: number;
}

interface QueueResponse {
  queue: QueueItem[];
  totalDownloading: number;
  totalItems: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function DownloadQueue() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [totalDownloading, setTotalDownloading] = useState(0);
  const [removing, setRemoving] = useState<string | null>(null);
  const pageSize = 10;

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/downloadclient/queue?page=${page}&pageSize=${pageSize}`);
      if (res.ok) {
        const data: QueueResponse = await res.json();
        setQueue(data.queue);
        setTotalPages(data.totalPages);
        setTotalItems(data.totalItems);
        setTotalDownloading(data.totalDownloading);
      }
    } catch (error) {
      console.error("Failed to fetch queue:", error);
    }
  }, [page]);

  useEffect(() => {
    fetchQueue();
    // Poll every 5 seconds
    const interval = setInterval(fetchQueue, 5000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  const handleRemove = async (item: QueueItem, deleteFiles: boolean = false) => {
    if (removing) return;
    
    setRemoving(item.id);
    try {
      const res = await fetch("/api/v1/downloadclient/queue", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          downloadClient: item.downloadClient,
          deleteFiles,
        }),
      });
      
      if (res.ok) {
        // Refresh the queue
        fetchQueue();
      } else {
        const data = await res.json();
        console.error("Failed to remove item:", data.error);
      }
    } catch (error) {
      console.error("Failed to remove item:", error);
    } finally {
      setRemoving(null);
    }
  };

  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
  };

  const formatEta = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const hasDownloads = totalDownloading > 0;

  return (
    <div className="relative">
      {/* Activity Indicator Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
          hasDownloads 
            ? "bg-blue-600/20 text-blue-400 hover:bg-blue-600/30" 
            : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50"
        }`}
        title={hasDownloads ? `${totalDownloading} active download(s)` : "No active downloads"}
      >
        {hasDownloads ? (
          <svg className="w-5 h-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        )}
        <span className="text-sm font-medium">
          {hasDownloads ? totalDownloading : totalItems}
        </span>
      </button>

      {/* Dropdown Queue List */}
      {isExpanded && (
        <div className="fixed sm:absolute right-2 sm:right-0 left-2 sm:left-auto top-16 sm:top-full sm:mt-2 w-auto sm:w-[28rem] bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 max-h-[80vh] sm:max-h-[32rem] overflow-hidden">
          <div className="p-3 border-b border-zinc-700">
            <h3 className="font-medium text-zinc-200">Download Queue</h3>
            <p className="text-xs text-zinc-500">
              {totalDownloading} downloading, {totalItems} total
            </p>
          </div>
          
          {queue.length === 0 ? (
            <div className="p-6 text-center text-zinc-500">
              No items in queue
            </div>
          ) : (
            <div className="max-h-[55vh] sm:max-h-80 overflow-y-auto">
              {queue.map((item) => (
                <div key={item.id} className="p-3 border-b border-zinc-800 last:border-0 group">
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <span className="text-sm text-zinc-200 truncate flex-1" title={item.name}>
                      {item.name}
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        item.status === "downloading" ? "bg-blue-600 text-white" :
                        item.status === "seeding" ? "bg-green-600 text-white" :
                        item.status === "paused" ? "bg-yellow-600 text-white" :
                        item.status === "completed" ? "bg-green-700 text-white" :
                        item.status === "error" ? "bg-red-600 text-white" :
                        item.status === "extracting" ? "bg-purple-600 text-white" :
                        item.status === "postprocessing" ? "bg-indigo-600 text-white" :
                        "bg-zinc-700 text-zinc-300"
                      }`}>
                        {item.status}
                      </span>
                      {/* Remove button */}
                      <button
                        onClick={() => handleRemove(item, false)}
                        disabled={removing === item.id}
                        className="p-1 text-zinc-500 hover:text-red-400 hover:bg-red-900/30 rounded opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                        title="Remove from queue"
                      >
                        {removing === item.id ? (
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="w-full bg-zinc-700 rounded-full h-1.5 mb-1">
                    <div 
                      className={`h-1.5 rounded-full ${
                        item.status === "downloading" ? "bg-blue-500" :
                        item.status === "seeding" ? "bg-green-500" :
                        item.status === "completed" ? "bg-green-600" :
                        item.status === "error" ? "bg-red-500" :
                        "bg-zinc-500"
                      }`}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                  
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>
                      {formatSize(item.downloaded)} / {formatSize(item.size)} ({item.progress}%)
                    </span>
                    <span>
                      {item.downloadSpeed !== undefined && item.downloadSpeed > 0 && (
                        <>{formatSpeed(item.downloadSpeed)}</>
                      )}
                      {item.eta !== undefined && item.eta > 0 && (
                        <> • {formatEta(item.eta)}</>
                      )}
                    </span>
                  </div>
                  
                  <div className="text-xs text-zinc-600 mt-1">
                    {item.downloadClient}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-2 border-t border-zinc-700 flex items-center justify-between">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-xs text-zinc-500">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
