"use client";

import { useEffect, useState } from "react";
import { useAlert } from "@/app/components/AlertDialog";

interface DownloadClient {
  id: number;
  name: string;
  protocol: "USENET" | "TORRENT";
  implementation: string;
  host: string;
  port: number;
  username?: string;
  enabled: boolean;
  priority: number;
}

export default function DownloadClientsPage() {
  const { showConfirm } = useAlert();
  const [clients, setClients] = useState<DownloadClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingClient, setEditingClient] = useState<DownloadClient | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; success: boolean; message?: string } | null>(null);
  const [modalTesting, setModalTesting] = useState(false);
  const [modalTestResult, setModalTestResult] = useState<{ success: boolean; message?: string } | null>(null);

  const [newClient, setNewClient] = useState({
    name: "",
    protocol: "TORRENT" as "USENET" | "TORRENT",
    implementation: "qBittorrent",
    host: "localhost",
    port: 8080,
    username: "",
    password: "",
    apiKey: "",
    enabled: true,
    priority: 1,
  });

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const res = await fetch("/api/v1/downloadclient");
      const data = await res.json();
      setClients(data);
    } catch (error) {
      console.error("Failed to fetch download clients:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditClient = (client: DownloadClient) => {
    setEditingClient(client);
    setNewClient({
      name: client.name,
      protocol: client.protocol,
      implementation: client.implementation,
      host: client.host,
      port: client.port,
      username: client.username || "",
      password: "",
      apiKey: "",
      enabled: client.enabled,
      priority: client.priority,
    });
    setModalTestResult(null);
    setShowAddModal(true);
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const isEdit = editingClient !== null;
      const res = await fetch(
        isEdit ? `/api/v1/downloadclient/${editingClient.id}` : "/api/v1/downloadclient",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newClient),
        }
      );

      if (res.ok) {
        setShowAddModal(false);
        setEditingClient(null);
        setNewClient({
          name: "",
          protocol: "TORRENT",
          implementation: "qBittorrent",
          host: "localhost",
          port: 8080,
          username: "",
          password: "",
          apiKey: "",
          enabled: true,
          priority: 1,
        });
        fetchClients();
      }
    } catch (error) {
      console.error("Failed to add download client:", error);
    }
  };

  const handleDeleteClient = async (id: number) => {
    const confirmed = await showConfirm({
      title: "Delete Download Client",
      message: "Are you sure you want to delete this download client?",
      type: "danger",
      confirmText: "Delete",
    });
    if (!confirmed) return;
    try {
      await fetch(`/api/v1/downloadclient/${id}`, { method: "DELETE" });
      fetchClients();
    } catch (error) {
      console.error("Failed to delete download client:", error);
    }
  };

  const handleTestClient = async (id: number) => {
    setTesting(id);
    setTestResult(null);
    try {
      const res = await fetch("/api/v1/downloadclient/test", {
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

  const handleTestModalClient = async () => {
    setModalTesting(true);
    setModalTestResult(null);
    try {
      const res = await fetch("/api/v1/downloadclient/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          implementation: newClient.implementation,
          host: newClient.host,
          port: newClient.port,
          username: newClient.username || undefined,
          password: newClient.password || undefined,
          apiKey: newClient.apiKey || undefined,
        }),
      });
      const data = await res.json();
      setModalTestResult({ success: data.success, message: data.message });
    } catch (error) {
      setModalTestResult({ success: false, message: "Connection failed" });
    } finally {
      setModalTesting(false);
    }
  };

  const handleToggleEnabled = async (client: DownloadClient) => {
    try {
      await fetch(`/api/v1/downloadclient/${client.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...client, enabled: !client.enabled }),
      });
      fetchClients();
    } catch (error) {
      console.error("Failed to update download client:", error);
    }
  };

  const implementations = {
    TORRENT: ["qBittorrent", "Deluge", "Transmission", "rTorrent"],
    USENET: ["SABnzbd", "NZBGet"],
  };

  const defaultPorts: Record<string, number> = {
    qBittorrent: 8080,
    Deluge: 8112,
    Transmission: 9091,
    rTorrent: 8080,
    SABnzbd: 8080,
    NZBGet: 6789,
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Download Clients</h3>
        <p className="text-sm text-zinc-400">Configure download clients for handling grabbed releases</p>
      </div>

      <div className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h4 className="font-medium">Configured Clients</h4>
          <button
            onClick={() => {
              setShowAddModal(true);
              setModalTestResult(null);
            }}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            + Add Client
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
          </div>
        ) : clients.length === 0 ? (
          <div className="p-8 text-center text-zinc-400">
            No download clients configured. Add one to enable downloading.
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {clients.map((client) => (
              <div
                key={client.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors gap-3"
              >
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => handleToggleEnabled(client)}
                    className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${
                      client.enabled ? "bg-green-600" : "bg-zinc-700"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform ${
                        client.enabled ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </button>
                  <div className="min-w-0">
                    <div className="font-medium flex flex-wrap items-center gap-2">
                      <span className="truncate">{client.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
                        client.protocol === "USENET"
                          ? "bg-purple-900/50 text-purple-300"
                          : "bg-orange-900/50 text-orange-300"
                      }`}>
                        {client.implementation}
                      </span>
                    </div>
                    <div className="text-sm text-zinc-400 truncate">
                      {client.host}:{client.port}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 ml-14 sm:ml-0">
                  {testResult?.id === client.id && (
                    <span className={`text-sm w-full sm:w-auto ${
                      testResult.success ? "text-green-400" : "text-red-400"
                    }`}>
                      {testResult.success ? "✓ Connected" : testResult.message || "Failed"}
                    </span>
                  )}
                  <button
                    onClick={() => handleEditClient(client)}
                    className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleTestClient(client.id)}
                    disabled={testing === client.id}
                    className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
                  >
                    {testing === client.id ? "Testing..." : "Test"}
                  </button>
                  <button
                    onClick={() => handleDeleteClient(client.id)}
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-lg border border-zinc-700 p-4 sm:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium mb-4">{editingClient ? "Edit Download Client" : "Add Download Client"}</h3>
            <form onSubmit={handleAddClient} className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Name</label>
                <input
                  type="text"
                  value={newClient.name}
                  onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                  placeholder="My Download Client"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Protocol</label>
                  <select
                    value={newClient.protocol}
                    onChange={(e) => {
                      const protocol = e.target.value as "USENET" | "TORRENT";
                      const impl = implementations[protocol][0];
                      setNewClient({
                        ...newClient,
                        protocol,
                        implementation: impl,
                        port: defaultPorts[impl] || 8080,
                      });
                    }}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="TORRENT">Torrent</option>
                    <option value="USENET">Usenet</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Client</label>
                  <select
                    value={newClient.implementation}
                    onChange={(e) => {
                      const impl = e.target.value;
                      setNewClient({
                        ...newClient,
                        implementation: impl,
                        port: defaultPorts[impl] || newClient.port,
                      });
                    }}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  >
                    {implementations[newClient.protocol].map((impl) => (
                      <option key={impl} value={impl}>
                        {impl}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm text-zinc-400 mb-1">Host</label>
                  <input
                    type="text"
                    value={newClient.host}
                    onChange={(e) => setNewClient({ ...newClient, host: e.target.value })}
                    placeholder="localhost"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Port</label>
                  <input
                    type="number"
                    value={newClient.port}
                    onChange={(e) => setNewClient({ ...newClient, port: parseInt(e.target.value) })}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Username</label>
                  <input
                    type="text"
                    value={newClient.username}
                    onChange={(e) => setNewClient({ ...newClient, username: e.target.value })}
                    placeholder="Optional"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Password</label>
                  <input
                    type="password"
                    value={newClient.password}
                    onChange={(e) => setNewClient({ ...newClient, password: e.target.value })}
                    placeholder="Optional"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
              {/* API Key for SABnzbd */}
              {newClient.implementation === "SABnzbd" && (
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">API Key</label>
                  <input
                    type="text"
                    value={newClient.apiKey}
                    onChange={(e) => setNewClient({ ...newClient, apiKey: e.target.value })}
                    placeholder="SABnzbd API key (from Config > General)"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              )}
              {/* Test Result */}
              {modalTestResult && (
                <div className={`p-3 rounded-lg text-sm ${
                  modalTestResult.success 
                    ? "bg-green-900/30 border border-green-800 text-green-300"
                    : "bg-red-900/30 border border-red-800 text-red-300"
                }`}>
                  {modalTestResult.success ? "✓ " : "✗ "}
                  {modalTestResult.message || (modalTestResult.success ? "Connection successful" : "Connection failed")}
                </div>
              )}
              <div className="flex flex-col-reverse sm:flex-row justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleTestModalClient}
                  disabled={modalTesting || !newClient.host || !newClient.port}
                  className="w-full sm:w-auto px-4 py-2 text-sm font-medium border border-zinc-600 text-zinc-300 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  {modalTesting ? "Testing..." : "Test"}
                </button>
                <div className="flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false);
                      setEditingClient(null);
                    }}
                    className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {editingClient ? "Save" : "Add"}
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
