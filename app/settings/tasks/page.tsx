"use client";

import { useState, useEffect, useCallback } from "react";

interface TaskStatus {
  name: string;
  description: string;
  enabled: boolean;
  interval: number;
  lastExecution: string | null;
  lastResult: {
    success: boolean;
    message: string;
    details?: Record<string, unknown>;
  } | null;
  isRunning: boolean;
  nextExecution: string | null;
}

interface TasksResponse {
  tasks: TaskStatus[];
  schedulerRunning: boolean;
}

export default function TasksSettingsPage() {
  const [tasks, setTasks] = useState<TaskStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/system/tasks");
      if (res.ok) {
        const data: TasksResponse = await res.json();
        setTasks(data.tasks);
      }
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
      setError("Failed to load scheduled tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    // Refresh every 30 seconds
    const interval = setInterval(fetchTasks, 30000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  const handleToggle = async (taskName: string, enabled: boolean) => {
    setSaving(taskName);
    setError(null);
    
    try {
      const res = await fetch("/api/v1/system/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskName, enabled }),
      });
      
      if (res.ok) {
        setTasks(tasks.map(t => 
          t.name === taskName ? { ...t, enabled } : t
        ));
      } else {
        const data = await res.json();
        setError(data.error || "Failed to update task");
      }
    } catch (err) {
      setError("Failed to update task");
    } finally {
      setSaving(null);
    }
  };

  const handleIntervalChange = async (taskName: string, interval: number) => {
    setSaving(taskName);
    setError(null);
    
    try {
      const task = tasks.find(t => t.name === taskName);
      const res = await fetch("/api/v1/system/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskName, enabled: task?.enabled, interval }),
      });
      
      if (res.ok) {
        setTasks(tasks.map(t => 
          t.name === taskName ? { ...t, interval } : t
        ));
      } else {
        const data = await res.json();
        setError(data.error || "Failed to update interval");
      }
    } catch (err) {
      setError("Failed to update interval");
    } finally {
      setSaving(null);
    }
  };

  const handleRunNow = async (taskName: string) => {
    setRunning(taskName);
    setError(null);
    
    try {
      const res = await fetch("/api/v1/system/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskName }),
      });
      
      if (res.ok) {
        // Refresh task status
        await fetchTasks();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to run task");
      }
    } catch (err) {
      setError("Failed to run task");
    } finally {
      setRunning(null);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const formatInterval = (minutes: number) => {
    if (minutes < 60) return `${minutes} minutes`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} hours`;
    return `${Math.round(minutes / 1440)} days`;
  };

  const getRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const absDiff = Math.abs(diff);
    
    if (absDiff < 60000) return diff > 0 ? "in less than a minute" : "just now";
    if (absDiff < 3600000) {
      const mins = Math.round(absDiff / 60000);
      return diff > 0 ? `in ${mins} min` : `${mins} min ago`;
    }
    if (absDiff < 86400000) {
      const hours = Math.round(absDiff / 3600000);
      return diff > 0 ? `in ${hours} hours` : `${hours} hours ago`;
    }
    const days = Math.round(absDiff / 86400000);
    return diff > 0 ? `in ${days} days` : `${days} days ago`;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium">Scheduled Tasks</h3>
          <p className="text-sm text-zinc-400">Configure automatic background tasks</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Scheduled Tasks</h3>
        <p className="text-sm text-zinc-400">Configure automatic background tasks for importing, searching, and maintenance</p>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {tasks.map((task) => (
          <div 
            key={task.name}
            className="rounded-lg bg-zinc-900 border border-zinc-800 p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h4 className="font-medium">{task.name}</h4>
                  {task.isRunning && (
                    <span className="flex items-center gap-1 text-xs text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-full">
                      <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                      Running
                    </span>
                  )}
                  {task.enabled && !task.isRunning && (
                    <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-sm text-zinc-400 mt-1">{task.description}</p>
                
                {/* Last Result */}
                {task.lastResult && (
                  <div className={`mt-3 text-xs ${task.lastResult.success ? 'text-zinc-500' : 'text-yellow-400'}`}>
                    Last run: {task.lastResult.message}
                  </div>
                )}
                
                {/* Timing info */}
                <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500">
                  <span>Last: {formatDate(task.lastExecution)} {task.lastExecution && `(${getRelativeTime(task.lastExecution)})`}</span>
                  {task.enabled && task.nextExecution && (
                    <span>Next: {getRelativeTime(task.nextExecution)}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Run Now Button */}
                <button
                  onClick={() => handleRunNow(task.name)}
                  disabled={running === task.name || task.isRunning}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    running === task.name || task.isRunning
                      ? "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                      : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white"
                  }`}
                >
                  {running === task.name ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                      Running...
                    </span>
                  ) : (
                    "Run Now"
                  )}
                </button>

                {/* Enable Toggle */}
                <button
                  onClick={() => handleToggle(task.name, !task.enabled)}
                  disabled={saving === task.name}
                  className={`w-12 h-7 rounded-full transition-colors relative ${
                    task.enabled ? "bg-green-600" : "bg-zinc-700"
                  } ${saving === task.name ? "opacity-50" : ""}`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white absolute top-1 transition-transform ${
                      task.enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Interval Configuration */}
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <div className="flex items-center gap-4">
                <label className="text-sm text-zinc-400">Run every:</label>
                <select
                  value={task.interval}
                  onChange={(e) => handleIntervalChange(task.name, parseInt(e.target.value, 10))}
                  disabled={saving === task.name}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="1">1 minute</option>
                  <option value="5">5 minutes</option>
                  <option value="10">10 minutes</option>
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="120">2 hours</option>
                  <option value="360">6 hours</option>
                  <option value="720">12 hours</option>
                  <option value="1440">24 hours</option>
                  <option value="4320">3 days</option>
                  <option value="10080">7 days</option>
                </select>
                <span className="text-xs text-zinc-500">
                  ({formatInterval(task.interval)})
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Info Section */}
      <div className="rounded-lg bg-zinc-900/50 border border-zinc-800 p-4">
        <h4 className="font-medium text-zinc-300 mb-2">About Scheduled Tasks</h4>
        <ul className="text-sm text-zinc-500 space-y-1">
          <li><strong>AutoImport:</strong> Automatically imports completed downloads from your download folder to your library</li>
          <li><strong>QueueCheck:</strong> Monitors the download queue and updates status of downloading items</li>
          <li><strong>RssSync:</strong> Fetches RSS feeds from your indexers to find new releases</li>
          <li><strong>SearchMonitored:</strong> Searches for missing volumes/chapters in your monitored series</li>
          <li><strong>RefreshSeries:</strong> Updates series metadata from external sources</li>
          <li><strong>SendStatistics:</strong> Sends anonymous usage statistics to help improve Inkarr (no personal data is collected)</li>
        </ul>
      </div>
    </div>
  );
}
