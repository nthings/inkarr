"use client";

import { useEffect, useState } from "react";

interface Indexer {
  id: number;
  name: string;
  protocol: "USENET" | "TORRENT";
  implementation: string;
  settings: {
    baseUrl: string;
    apiPath?: string;
    apiKey?: string;
    categories?: number[];
  };
  enableRss: boolean;
  enableAutomaticSearch: boolean;
  enableInteractiveSearch: boolean;
  priority: number;
}

export default function IndexersPage() {
  const [indexers, setIndexers] = useState<Indexer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingIndexer, setEditingIndexer] = useState<Indexer | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; success: boolean; message?: string } | null>(null);
  const [testingModal, setTestingModal] = useState(false);
  const [modalTestResult, setModalTestResult] = useState<{ success: boolean; message?: string } | null>(null);

  // New indexer form
  const [newIndexer, setNewIndexer] = useState({
    name: "",
    protocol: "TORRENT" as "USENET" | "TORRENT",
    implementation: "Torznab",
    baseUrl: "",
    apiPath: "",
    apiKey: "",
    categories: "",
    priority: 25,
  });

  useEffect(() => {
    fetchIndexers();
  }, []);

  const fetchIndexers = async () => {
    try {
      const res = await fetch("/api/v1/indexer");
      const data = await res.json();
      setIndexers(data);
    } catch (error) {
      console.error("Failed to fetch indexers:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddIndexer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/v1/indexer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newIndexer.name,
          protocol: newIndexer.protocol,
          implementation: newIndexer.implementation,
          priority: newIndexer.priority,
          settings: {
            baseUrl: newIndexer.baseUrl,
            apiPath: newIndexer.apiPath || undefined,
            apiKey: newIndexer.apiKey,
            categories: newIndexer.categories ? newIndexer.categories.split(',').map(c => parseInt(c.trim(), 10)).filter(c => !isNaN(c)) : [],
          },
        }),
      });

      if (res.ok) {
        setShowAddModal(false);
        setModalTestResult(null);
        setNewIndexer({
          name: "",
          protocol: "TORRENT",
          implementation: "Torznab",
          baseUrl: "",
          apiPath: "",
          apiKey: "",
          categories: "",
          priority: 25,
        });
        fetchIndexers();
      }
    } catch (error) {
      console.error("Failed to add indexer:", error);
    }
  };

  const handleDeleteIndexer = async (id: number) => {
    if (!confirm("Are you sure you want to delete this indexer?")) return;
    try {
      await fetch(`/api/v1/indexer/${id}`, { method: "DELETE" });
      fetchIndexers();
    } catch (error) {
      console.error("Failed to delete indexer:", error);
    }
  };

  const handleTestIndexer = async (id: number) => {
    setTesting(id);
    setTestResult(null);
    try {
      const res = await fetch("/api/v1/indexer/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      setTestResult({ id, success: data.success, message: data.message });
    } catch (error) {
      setTestResult({ id, success: false, message: "Connection failed" });
    } finally {
      setTesting(null);
    }
  };

  const handleTestNewIndexer = async () => {
    if (!newIndexer.baseUrl) return;
    setTestingModal(true);
    setModalTestResult(null);
    try {
      const res = await fetch("/api/v1/indexer/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          implementation: newIndexer.implementation,
          settings: {
            baseUrl: newIndexer.baseUrl,
            apiPath: newIndexer.apiPath || undefined,
            apiKey: newIndexer.apiKey,
          },
        }),
      });
      const data = await res.json();
      setModalTestResult({ success: data.success, message: data.message });
    } catch (error) {
      setModalTestResult({ success: false, message: "Connection failed" });
    } finally {
      setTestingModal(false);
    }
  };

  const handleTestEditIndexer = async () => {
    if (!editingIndexer?.settings?.baseUrl) return;
    setTestingModal(true);
    setModalTestResult(null);
    try {
      const res = await fetch("/api/v1/indexer/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          implementation: editingIndexer.implementation,
          settings: editingIndexer.settings,
        }),
      });
      const data = await res.json();
      setModalTestResult({ success: data.success, message: data.message });
    } catch (error) {
      setModalTestResult({ success: false, message: "Connection failed" });
    } finally {
      setTestingModal(false);
    }
  };

  const handleToggleEnabled = async (indexer: Indexer) => {
    try {
      const newEnabled = !indexer.enableRss;
      await fetch(`/api/v1/indexer/${indexer.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enableRss: newEnabled,
          enableAutomaticSearch: newEnabled,
          enableInteractiveSearch: newEnabled,
        }),
      });
      fetchIndexers();
    } catch (error) {
      console.error("Failed to update indexer:", error);
    }
  };

  const handleEditIndexer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingIndexer) return;
    try {
      const res = await fetch(`/api/v1/indexer/${editingIndexer.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingIndexer.name,
          protocol: editingIndexer.protocol,
          implementation: editingIndexer.implementation,
          priority: editingIndexer.priority,
          settings: editingIndexer.settings,
        }),
      });

      if (res.ok) {
        setEditingIndexer(null);
        fetchIndexers();
      }
    } catch (error) {
      console.error("Failed to update indexer:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Indexers</h3>
        <p className="text-sm text-zinc-400">Configure Newznab and Torznab indexers for searching releases</p>
      </div>

      <div className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h4 className="font-medium">Configured Indexers</h4>
          <button
            onClick={() => setShowAddModal(true)}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            + Add Indexer
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
          </div>
        ) : indexers.length === 0 ? (
          <div className="p-8 text-center text-zinc-400">
            No indexers configured. Add one to search for releases.
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {indexers.map((indexer) => (
              <div
                key={indexer.id}
                className="flex items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => handleToggleEnabled(indexer)}
                    className={`w-10 h-6 rounded-full transition-colors ${
                      indexer.enableRss ? "bg-green-600" : "bg-zinc-700"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform ${
                        indexer.enableRss ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </button>
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {indexer.name}
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        indexer.protocol === "USENET"
                          ? "bg-purple-900/50 text-purple-300"
                          : "bg-orange-900/50 text-orange-300"
                      }`}>
                        {indexer.protocol}
                      </span>
                    </div>
                    <div className="text-sm text-zinc-400">{indexer.settings?.baseUrl}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {testResult?.id === indexer.id && (
                    <span className={`text-sm ${testResult.success ? "text-green-400" : "text-red-400"}`}>
                      {testResult.success ? "✓ Connected" : testResult.message || "Failed"}
                    </span>
                  )}
                  <button
                    onClick={() => handleTestIndexer(indexer.id)}
                    disabled={testing === indexer.id}
                    className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
                  >
                    {testing === indexer.id ? "Testing..." : "Test"}
                  </button>
                  <button
                    onClick={() => setEditingIndexer(indexer)}
                    className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteIndexer(indexer.id)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-900 rounded-lg border border-zinc-700 p-6 w-full max-w-lg">
            <h3 className="text-lg font-medium mb-4">Add Indexer</h3>
            <form onSubmit={handleAddIndexer} className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Name</label>
                <input
                  type="text"
                  value={newIndexer.name}
                  onChange={(e) => setNewIndexer({ ...newIndexer, name: e.target.value })}
                  placeholder="My Indexer"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Protocol</label>
                  <select
                    value={newIndexer.protocol}
                    onChange={(e) => {
                      const protocol = e.target.value as "USENET" | "TORRENT";
                      setNewIndexer({
                        ...newIndexer,
                        protocol,
                        implementation: protocol === "USENET" ? "Newznab" : "Torznab",
                      });
                    }}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="TORRENT">Torrent</option>
                    <option value="USENET">Usenet</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Implementation</label>
                  <select
                    value={newIndexer.implementation}
                    onChange={(e) => setNewIndexer({ ...newIndexer, implementation: e.target.value })}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  >
                    {newIndexer.protocol === "TORRENT" ? (
                      <>
                        <option value="Torznab">Torznab</option>
                        <option value="UNIT3D">UNIT3D</option>
                      </>
                    ) : (
                      <option value="Newznab">Newznab</option>
                    )}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">URL</label>
                <input
                  type="url"
                  value={newIndexer.baseUrl}
                  onChange={(e) => setNewIndexer({ ...newIndexer, baseUrl: e.target.value })}
                  placeholder="https://indexer.example.com/torznab"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">API Path</label>
                <input
                  type="text"
                  value={newIndexer.apiPath}
                  onChange={(e) => setNewIndexer({ ...newIndexer, apiPath: e.target.value })}
                  placeholder="/api (leave empty for UNIT3D)"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                />
                <p className="text-xs text-zinc-500 mt-1">Path appended to URL. Default: /api. UNIT3D trackers: leave empty</p>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">API Key</label>
                <input
                  type="text"
                  value={newIndexer.apiKey}
                  onChange={(e) => setNewIndexer({ ...newIndexer, apiKey: e.target.value })}
                  placeholder="Your API key"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Categories</label>
                <input
                  type="text"
                  value={newIndexer.categories}
                  onChange={(e) => setNewIndexer({ ...newIndexer, categories: e.target.value })}
                  placeholder="7030, 7020 (comma-separated)"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                />
                <p className="text-xs text-zinc-500 mt-1">Category IDs for comics/manga (e.g., 7030 for Comics)</p>
              </div>
              {modalTestResult && (
                <div className={`p-3 rounded-lg text-sm ${
                  modalTestResult.success ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                }`}>
                  {modalTestResult.message}
                </div>
              )}
              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={handleTestNewIndexer}
                  disabled={testingModal || !newIndexer.baseUrl}
                  className="px-4 py-2 text-sm font-medium bg-zinc-700 text-white rounded-lg hover:bg-zinc-600 transition-colors disabled:opacity-50"
                >
                  {testingModal ? 'Testing...' : 'Test'}
                </button>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowAddModal(false); setModalTestResult(null); }}
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
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingIndexer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-900 rounded-lg border border-zinc-700 p-6 w-full max-w-lg">
            <h3 className="text-lg font-medium mb-4">Edit Indexer</h3>
            <form onSubmit={handleEditIndexer} className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Name</label>
                <input
                  type="text"
                  value={editingIndexer.name}
                  onChange={(e) => setEditingIndexer({ ...editingIndexer, name: e.target.value })}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Protocol</label>
                  <select
                    value={editingIndexer.protocol}
                    onChange={(e) => {
                      const protocol = e.target.value as "USENET" | "TORRENT";
                      setEditingIndexer({
                        ...editingIndexer,
                        protocol,
                        implementation: protocol === "USENET" ? "Newznab" : "Torznab",
                      });
                    }}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="TORRENT">Torrent</option>
                    <option value="USENET">Usenet</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Implementation</label>
                  <select
                    value={editingIndexer.implementation}
                    onChange={(e) => setEditingIndexer({ ...editingIndexer, implementation: e.target.value })}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  >
                    {editingIndexer.protocol === "TORRENT" ? (
                      <>
                        <option value="Torznab">Torznab</option>
                        <option value="UNIT3D">UNIT3D</option>
                      </>
                    ) : (
                      <option value="Newznab">Newznab</option>
                    )}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">URL</label>
                <input
                  type="url"
                  value={editingIndexer.settings?.baseUrl || ""}
                  onChange={(e) => setEditingIndexer({ 
                    ...editingIndexer, 
                    settings: { ...editingIndexer.settings, baseUrl: e.target.value }
                  })}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">API Path</label>
                <input
                  type="text"
                  value={editingIndexer.settings?.apiPath || ""}
                  onChange={(e) => setEditingIndexer({ 
                    ...editingIndexer, 
                    settings: { ...editingIndexer.settings, apiPath: e.target.value }
                  })}
                  placeholder="/api (leave empty for UNIT3D)"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                />
                <p className="text-xs text-zinc-500 mt-1">Path appended to URL. Default: /api. UNIT3D trackers: leave empty</p>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">API Key</label>
                <input
                  type="text"
                  value={editingIndexer.settings?.apiKey || ""}
                  onChange={(e) => setEditingIndexer({ 
                    ...editingIndexer, 
                    settings: { ...editingIndexer.settings, apiKey: e.target.value }
                  })}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Categories</label>
                <input
                  type="text"
                  value={editingIndexer.settings?.categories?.join(', ') || ""}
                  onChange={(e) => setEditingIndexer({ 
                    ...editingIndexer, 
                    settings: { 
                      ...editingIndexer.settings, 
                      categories: e.target.value ? e.target.value.split(',').map(c => parseInt(c.trim(), 10)).filter(c => !isNaN(c)) : []
                    }
                  })}
                  placeholder="7030, 7020 (comma-separated)"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                />
                <p className="text-xs text-zinc-500 mt-1">Category IDs for comics/manga (e.g., 7030 for Comics)</p>
              </div>
              {modalTestResult && (
                <div className={`p-3 rounded-lg text-sm ${
                  modalTestResult.success ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                }`}>
                  {modalTestResult.message}
                </div>
              )}
              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={handleTestEditIndexer}
                  disabled={testingModal || !editingIndexer.settings?.baseUrl}
                  className="px-4 py-2 text-sm font-medium bg-zinc-700 text-white rounded-lg hover:bg-zinc-600 transition-colors disabled:opacity-50"
                >
                  {testingModal ? 'Testing...' : 'Test'}
                </button>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setEditingIndexer(null); setModalTestResult(null); }}
                    className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
