"use client";

import { useEffect, useState } from "react";

interface RootFolder {
  id: number;
  path: string;
  name?: string;
  freeSpace?: number;
  unmappedFolders?: string[];
}

interface NamingConfig {
  id?: number;
  renameFiles: boolean;
  replaceIllegalChars: boolean;
  colonReplacementFormat: string;
  standardFileFormat: string;
  seriesFolderFormat: string;
  volumeFolderFormat: string;
  creatorFolderFormat: string;
}

const defaultNamingConfig: NamingConfig = {
  renameFiles: true,
  replaceIllegalChars: true,
  colonReplacementFormat: 'smart',
  standardFileFormat: '{Series Title} - {Volume Number} - {Chapter Number}',
  seriesFolderFormat: '{Series Title}',
  volumeFolderFormat: 'Volume {Volume Number}',
  creatorFolderFormat: '{Creator Name}',
};

export default function MediaManagementPage() {
  const [rootFolders, setRootFolders] = useState<RootFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [namingConfig, setNamingConfig] = useState<NamingConfig>(defaultNamingConfig);
  const [savingNaming, setSavingNaming] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRootFolders();
    fetchNamingConfig();
  }, []);

  const fetchRootFolders = async () => {
    try {
      const res = await fetch("/api/v1/rootfolder");
      const data = await res.json();
      
      if (!res.ok) {
        // Show auth or other errors clearly
        const errorMsg = data.message || data.error || `Error ${res.status}`;
        setError(errorMsg);
        setRootFolders([]);
        return;
      }
      
      // Ensure we always set an array, even if API returns error object
      setRootFolders(Array.isArray(data) ? data : []);
      setError(null);
    } catch (error) {
      console.error("Failed to fetch root folders:", error);
      setError("Failed to connect to API");
      setRootFolders([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchNamingConfig = async () => {
    try {
      const res = await fetch("/api/v1/config/naming");
      if (res.ok) {
        const data = await res.json();
        setNamingConfig(data);
      } else if (res.status === 401) {
        const data = await res.json();
        setError(data.message || "Authentication required");
      }
    } catch (error) {
      console.error("Failed to fetch naming config:", error);
    }
  };

  const handleSaveNaming = async () => {
    setSavingNaming(true);
    try {
      const res = await fetch("/api/v1/config/naming", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(namingConfig),
      });
      if (res.ok) {
        const data = await res.json();
        setNamingConfig(data);
      }
    } catch (error) {
      console.error("Failed to save naming config:", error);
    } finally {
      setSavingNaming(false);
    }
  };

  const handleRenameAll = async () => {
    if (!confirm("This will rename all files in your library according to the current naming settings. Continue?")) {
      return;
    }
    
    setRenaming(true);
    try {
      const res = await fetch("/api/v1/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      
      if (res.ok) {
        const data = await res.json();
        let message = `Checked ${data.checked} files.\n`;
        message += `Renamed: ${data.renamed}\n`;
        if (data.skipped > 0) message += `Already correct: ${data.skipped}\n`;
        if (data.failed > 0) message += `Failed: ${data.failed}\n`;
        if (data.errors?.length > 0) message += `\nErrors:\n${data.errors.slice(0, 5).join('\n')}`;
        if (data.message) message = data.message;
        alert(message);
      } else {
        const error = await res.json();
        alert(`Failed to rename files: ${error.error}`);
      }
    } catch (error) {
      console.error("Failed to rename files:", error);
      alert("Failed to rename files");
    } finally {
      setRenaming(false);
    }
  };

  const handleAddFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPath.trim()) return;

    try {
      const res = await fetch("/api/v1/rootfolder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: newPath }),
      });

      if (res.ok) {
        setNewPath("");
        setShowAddModal(false);
        fetchRootFolders();
      }
    } catch (error) {
      console.error("Failed to add root folder:", error);
    }
  };

  const handleDeleteFolder = async (id: number) => {
    if (!confirm("Are you sure you want to delete this root folder?")) return;

    try {
      await fetch(`/api/v1/rootfolder/${id}`, { method: "DELETE" });
      fetchRootFolders();
    } catch (error) {
      console.error("Failed to delete root folder:", error);
    }
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return "Unknown";
    const gb = bytes / 1024 / 1024 / 1024;
    return `${gb.toFixed(1)} GB`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Media Management</h3>
        <p className="text-sm text-zinc-400">Configure your library folders and file naming</p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-900/50 border border-red-700 p-4 text-red-200">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Root Folders */}
      <div className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h4 className="font-medium">Root Folders</h4>
          <button
            onClick={() => setShowAddModal(true)}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            + Add Root Folder
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
          </div>
        ) : rootFolders.length === 0 ? (
          <div className="p-8 text-center text-zinc-400">
            No root folders configured. Add one to get started.
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {rootFolders.map((folder) => (
              <div
                key={folder.id}
                className="flex items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors"
              >
                <div>
                  <div className="font-medium">{folder.path}</div>
                  <div className="text-sm text-zinc-400">
                    Free: {formatBytes(folder.freeSpace)}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteFolder(folder.id)}
                  className="text-red-400 hover:text-red-300 text-sm"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* File Naming */}
      <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-medium">File Naming</h4>
          <div className="flex gap-2">
            <button
              onClick={handleRenameAll}
              disabled={renaming}
              className="rounded-lg bg-zinc-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-600 transition-colors disabled:opacity-50"
            >
              {renaming ? "Renaming..." : "Rename All Files"}
            </button>
            <button
              onClick={handleSaveNaming}
              disabled={savingNaming}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {savingNaming ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="renameFiles"
              checked={namingConfig.renameFiles}
              onChange={(e) => setNamingConfig({ ...namingConfig, renameFiles: e.target.checked })}
              className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="renameFiles" className="text-sm text-zinc-300">Rename files on import</label>
          </div>
          
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Series Folder Format</label>
            <input
              type="text"
              value={namingConfig.seriesFolderFormat}
              onChange={(e) => setNamingConfig({ ...namingConfig, seriesFolderFormat: e.target.value })}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              suppressHydrationWarning
            />
            <p className="text-xs text-zinc-500 mt-1">Available tokens: {'{Series Title}'}, {'{Year}'}, {'{Sort Title}'}</p>
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Volume Folder Format</label>
            <input
              type="text"
              value={namingConfig.volumeFolderFormat}
              onChange={(e) => setNamingConfig({ ...namingConfig, volumeFolderFormat: e.target.value })}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              suppressHydrationWarning
            />
            <p className="text-xs text-zinc-500 mt-1">Available tokens: {'{Volume Number}'}, {'{Volume Number:000}'}</p>
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-2">File Name Format</label>
            <input
              type="text"
              value={namingConfig.standardFileFormat}
              onChange={(e) => setNamingConfig({ ...namingConfig, standardFileFormat: e.target.value })}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              suppressHydrationWarning
            />
            <p className="text-xs text-zinc-500 mt-1">Available tokens: {'{Series Title}'}, {'{Volume Number}'}, {'{Chapter Number}'}, {'{Release Group}'}</p>
          </div>
          
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Colon Replacement</label>
            <select
              value={namingConfig.colonReplacementFormat}
              onChange={(e) => setNamingConfig({ ...namingConfig, colonReplacementFormat: e.target.value })}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="smart">Smart (context-aware)</option>
              <option value="delete">Delete</option>
              <option value="dash">Replace with dash (-)</option>
              <option value="spaceDash">Replace with space-dash ( -)</option>
              <option value="spaceDashSpace">Replace with space-dash-space ( - )</option>
            </select>
          </div>
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-900 rounded-lg border border-zinc-700 p-6 w-full max-w-md">
            <h3 className="text-lg font-medium mb-4">Add Root Folder</h3>
            <form onSubmit={handleAddFolder}>
              <input
                type="text"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="/path/to/comics"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none mb-4"
              />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Add
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
