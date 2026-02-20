"use client";

import { useState, useEffect } from "react";

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
}

export function DownloadQueue() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const fetchQueue = async () => {
      try {
        const res = await fetch("/api/v1/downloadclient/queue");
        if (res.ok) {
          const data: QueueResponse = await res.json();
          setQueue(data.queue);
        }
      } catch (error) {
        console.error("Failed to fetch queue:", error);
      }
    };

    fetchQueue();
    // Poll every 5 seconds
    const interval = setInterval(fetchQueue, 5000);
    return () => clearInterval(interval);
  }, []);

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

  const activeDownloads = queue.filter(item => item.status === "downloading");
  const hasDownloads = activeDownloads.length > 0;

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
        title={hasDownloads ? `${activeDownloads.length} active download(s)` : "No active downloads"}
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
          {hasDownloads ? activeDownloads.length : queue.length}
        </span>
      </button>

      {/* Dropdown Queue List */}
      {isExpanded && (
        <div className="fixed sm:absolute right-2 sm:right-0 left-2 sm:left-auto top-16 sm:top-full sm:mt-2 w-auto sm:w-96 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 max-h-[70vh] sm:max-h-96 overflow-hidden">
          <div className="p-3 border-b border-zinc-700">
            <h3 className="font-medium text-zinc-200">Download Queue</h3>
            <p className="text-xs text-zinc-500">
              {activeDownloads.length} downloading, {queue.length} total
            </p>
          </div>
          
          {queue.length === 0 ? (
            <div className="p-6 text-center text-zinc-500">
              No items in queue
            </div>
          ) : (
            <div className="max-h-[50vh] sm:max-h-72 overflow-y-auto">
              {queue.map((item) => (
                <div key={item.id} className="p-3 border-b border-zinc-800 last:border-0">
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <span className="text-sm text-zinc-200 truncate flex-1" title={item.name}>
                      {item.name}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                      item.status === "downloading" ? "bg-blue-600 text-white" :
                      item.status === "seeding" ? "bg-green-600 text-white" :
                      item.status === "paused" ? "bg-yellow-600 text-white" :
                      item.status === "error" ? "bg-red-600 text-white" :
                      "bg-zinc-700 text-zinc-300"
                    }`}>
                      {item.status}
                    </span>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="w-full bg-zinc-700 rounded-full h-1.5 mb-1">
                    <div 
                      className={`h-1.5 rounded-full ${
                        item.status === "downloading" ? "bg-blue-500" :
                        item.status === "seeding" ? "bg-green-500" :
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
        </div>
      )}
    </div>
  );
}
