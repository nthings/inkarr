"use client";

import { useEffect, useState } from "react";

interface CalibreSettings {
  id: number;
  name: string;
  host: string;
  port: number;
  urlBase?: string;
  username?: string;
  password?: string;
  library?: string;
  outputFormat?: string;
  outputProfile: string;
  useSsl: boolean;
  enable: boolean;
  syncRootFolders: number[];
}

interface TestResult {
  success: boolean;
  message: string;
  libraries?: string[];
  defaultLibrary?: string;
}

const outputProfiles = [
  { value: "default", label: "Default" },
  { value: "kindle", label: "Kindle" },
  { value: "kindle_dx", label: "Kindle DX" },
  { value: "kindle_fire", label: "Kindle Fire" },
  { value: "kindle_oasis", label: "Kindle Oasis" },
  { value: "kindle_pw", label: "Kindle Paperwhite" },
  { value: "kindle_pw3", label: "Kindle Paperwhite 3" },
  { value: "kindle_voyage", label: "Kindle Voyage" },
  { value: "kobo", label: "Kobo" },
  { value: "nook", label: "Nook" },
  { value: "nook_color", label: "Nook Color" },
  { value: "nook_hd_plus", label: "Nook HD+" },
  { value: "sony", label: "Sony" },
  { value: "ipad", label: "iPad" },
  { value: "ipad3", label: "iPad 3" },
  { value: "generic_eink", label: "Generic E-Ink" },
  { value: "generic_eink_hd", label: "Generic E-Ink HD" },
  { value: "generic_eink_large", label: "Generic E-Ink Large" },
  { value: "tablet", label: "Tablet" },
];

const outputFormats = [
  "EPUB",
  "AZW3",
  "MOBI",
  "PDF",
  "CBZ",
  "CBR",
  "DOCX",
  "FB2",
  "HTMLZ",
  "TXT",
];

export default function CalibreSettingsPage() {
  const [settings, setSettings] = useState<CalibreSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; result: TestResult } | null>(null);
  const [modalTesting, setModalTesting] = useState(false);
  const [modalTestResult, setModalTestResult] = useState<TestResult | null>(null);
  const [availableLibraries, setAvailableLibraries] = useState<string[]>([]);

  const emptySettings = {
    name: "Calibre",
    host: "localhost",
    port: 8080,
    urlBase: "",
    username: "",
    password: "",
    library: "",
    outputFormat: "",
    outputProfile: "default",
    useSsl: false,
    enable: true,
    syncRootFolders: [] as number[],
    selectedFormats: [] as string[],
  };

  const [newSettings, setNewSettings] = useState(emptySettings);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/v1/calibre");
      const data = await res.json();
      setSettings(data);
    } catch (error) {
      console.error("Failed to fetch Calibre settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...newSettings,
        outputFormat: newSettings.selectedFormats.join(","),
      };

      const url = editingId ? `/api/v1/calibre/${editingId}` : "/api/v1/calibre";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowAddModal(false);
        setEditingId(null);
        setNewSettings(emptySettings);
        setModalTestResult(null);
        setAvailableLibraries([]);
        fetchSettings();
      } else {
        const error = await res.json();
        alert(error.error || "Failed to save settings");
      }
    } catch (error) {
      console.error("Failed to save Calibre settings:", error);
    }
  };

  const handleEditSettings = (settings: CalibreSettings) => {
    setEditingId(settings.id);
    setNewSettings({
      name: settings.name,
      host: settings.host,
      port: settings.port,
      urlBase: settings.urlBase || "",
      username: settings.username || "",
      password: settings.password || "",
      library: settings.library || "",
      outputFormat: settings.outputFormat || "",
      outputProfile: settings.outputProfile,
      useSsl: settings.useSsl,
      enable: settings.enable,
      syncRootFolders: settings.syncRootFolders || [],
      selectedFormats: settings.outputFormat ? settings.outputFormat.split(",") : [],
    });
    setShowAddModal(true);
    setModalTestResult(null);
  };

  const handleDeleteSettings = async (id: number) => {
    if (!confirm("Are you sure you want to delete this Calibre configuration?")) return;
    try {
      await fetch(`/api/v1/calibre/${id}`, { method: "DELETE" });
      fetchSettings();
    } catch (error) {
      console.error("Failed to delete Calibre settings:", error);
    }
  };

  const handleTestSettings = async (id: number) => {
    setTesting(id);
    setTestResult(null);
    try {
      const res = await fetch("/api/v1/calibre/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      setTestResult({ id, result: data });
    } catch (error) {
      setTestResult({ id, result: { success: false, message: "Connection failed" } });
    } finally {
      setTesting(null);
    }
  };

  const handleTestModalSettings = async () => {
    setModalTesting(true);
    setModalTestResult(null);
    try {
      const res = await fetch("/api/v1/calibre/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: newSettings.host,
          port: newSettings.port,
          urlBase: newSettings.urlBase || undefined,
          username: newSettings.username || undefined,
          password: newSettings.password || undefined,
          library: newSettings.library || undefined,
          useSsl: newSettings.useSsl,
        }),
      });
      const data: TestResult = await res.json();
      setModalTestResult(data);
      
      // If successful, populate available libraries
      if (data.success && data.libraries) {
        setAvailableLibraries(data.libraries);
        // Auto-select default library if none selected
        if (!newSettings.library && data.defaultLibrary) {
          setNewSettings({ ...newSettings, library: data.defaultLibrary });
        }
      }
    } catch (error) {
      setModalTestResult({ success: false, message: "Connection failed" });
    } finally {
      setModalTesting(false);
    }
  };

  const handleToggleEnabled = async (setting: CalibreSettings) => {
    try {
      await fetch(`/api/v1/calibre/${setting.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...setting, enable: !setting.enable }),
      });
      fetchSettings();
    } catch (error) {
      console.error("Failed to update Calibre settings:", error);
    }
  };

  const handleFormatToggle = (format: string) => {
    const formats = newSettings.selectedFormats;
    if (formats.includes(format)) {
      setNewSettings({
        ...newSettings,
        selectedFormats: formats.filter((f) => f !== format),
      });
    } else {
      setNewSettings({
        ...newSettings,
        selectedFormats: [...formats, format],
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Calibre Integration</h3>
        <p className="text-sm text-zinc-400">
          Connect to Calibre Content Server to sync your library and convert formats
        </p>
      </div>

      {/* Info Box */}
      <div className="rounded-lg bg-blue-900/20 border border-blue-800 p-4">
        <h4 className="font-medium text-blue-300 mb-2">📖 About Calibre Integration</h4>
        <p className="text-sm text-zinc-300 mb-2">
          Inkarr can sync your media files to a Calibre library using the Calibre Content Server.
          This allows you to:
        </p>
        <ul className="text-sm text-zinc-400 list-disc list-inside space-y-1">
          <li>Automatically import downloaded files into Calibre</li>
          <li>Convert files to different formats (EPUB, AZW3, PDF, etc.)</li>
          <li>Manage ebook metadata through Calibre</li>
          <li>Sync to e-readers connected to Calibre</li>
        </ul>
        <p className="text-sm text-zinc-400 mt-2">
          <a
            href="https://manual.calibre-ebook.com/server.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300"
          >
            Learn how to set up Calibre Content Server →
          </a>
        </p>
      </div>

      <div className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h4 className="font-medium">Calibre Servers</h4>
          <button
            onClick={() => {
              setShowAddModal(true);
              setEditingId(null);
              setNewSettings(emptySettings);
              setModalTestResult(null);
              setAvailableLibraries([]);
            }}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            + Add Server
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
          </div>
        ) : settings.length === 0 ? (
          <div className="p-8 text-center text-zinc-400">
            No Calibre servers configured. Add one to enable library syncing.
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {settings.map((setting) => (
              <div
                key={setting.id}
                className="flex items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => handleToggleEnabled(setting)}
                    className={`w-10 h-6 rounded-full transition-colors ${
                      setting.enable ? "bg-green-600" : "bg-zinc-700"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform ${
                        setting.enable ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </button>
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {setting.name}
                      {setting.library && (
                        <span className="text-xs px-2 py-0.5 rounded bg-purple-900/50 text-purple-300">
                          {setting.library}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-zinc-400">
                      {setting.useSsl ? "https" : "http"}://{setting.host}:{setting.port}
                      {setting.urlBase && `/${setting.urlBase}`}
                    </div>
                    {setting.outputFormat && (
                      <div className="text-xs text-zinc-500 mt-1">
                        Convert to: {setting.outputFormat}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {testResult?.id === setting.id && (
                    <span
                      className={`text-sm ${
                        testResult.result.success ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {testResult.result.success
                        ? "✓ Connected"
                        : testResult.result.message || "Failed"}
                    </span>
                  )}
                  <button
                    onClick={() => handleTestSettings(setting.id)}
                    disabled={testing === setting.id}
                    className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
                  >
                    {testing === setting.id ? "Testing..." : "Test"}
                  </button>
                  <button
                    onClick={() => handleEditSettings(setting)}
                    className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteSettings(setting.id)}
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

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-zinc-900 rounded-lg border border-zinc-700 p-6 w-full max-w-lg my-8">
            <h3 className="text-lg font-medium mb-4">
              {editingId ? "Edit Calibre Server" : "Add Calibre Server"}
            </h3>
            <form onSubmit={handleAddSettings} className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Name</label>
                <input
                  type="text"
                  value={newSettings.name}
                  onChange={(e) => setNewSettings({ ...newSettings, name: e.target.value })}
                  placeholder="My Calibre Server"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm text-zinc-400 mb-1">Host</label>
                  <input
                    type="text"
                    value={newSettings.host}
                    onChange={(e) => setNewSettings({ ...newSettings, host: e.target.value })}
                    placeholder="localhost or IP address"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Port</label>
                  <input
                    type="number"
                    value={newSettings.port}
                    onChange={(e) =>
                      setNewSettings({ ...newSettings, port: parseInt(e.target.value) || 8080 })
                    }
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={newSettings.useSsl}
                    onChange={(e) => setNewSettings({ ...newSettings, useSsl: e.target.checked })}
                    className="rounded border-zinc-600 bg-zinc-800 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-zinc-300">Use SSL (HTTPS)</span>
                </label>
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-1">URL Base (optional)</label>
                <input
                  type="text"
                  value={newSettings.urlBase}
                  onChange={(e) => setNewSettings({ ...newSettings, urlBase: e.target.value })}
                  placeholder="e.g., calibre"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Username (optional)</label>
                  <input
                    type="text"
                    value={newSettings.username}
                    onChange={(e) => setNewSettings({ ...newSettings, username: e.target.value })}
                    placeholder="Username"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Password (optional)</label>
                  <input
                    type="password"
                    value={newSettings.password}
                    onChange={(e) => setNewSettings({ ...newSettings, password: e.target.value })}
                    placeholder="Password"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-1">Library</label>
                {availableLibraries.length > 0 ? (
                  <select
                    value={newSettings.library}
                    onChange={(e) => setNewSettings({ ...newSettings, library: e.target.value })}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Select library...</option>
                    {availableLibraries.map((lib) => (
                      <option key={lib} value={lib}>
                        {lib}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={newSettings.library}
                    onChange={(e) => setNewSettings({ ...newSettings, library: e.target.value })}
                    placeholder="Test connection to see available libraries"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                  />
                )}
                <p className="text-xs text-zinc-500 mt-1">
                  Leave empty to use the default library
                </p>
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-2">
                  Output Formats (for conversion)
                </label>
                <div className="flex flex-wrap gap-2">
                  {outputFormats.map((format) => (
                    <button
                      key={format}
                      type="button"
                      onClick={() => handleFormatToggle(format)}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                        newSettings.selectedFormats.includes(format)
                          ? "border-blue-500 bg-blue-900/30 text-blue-300"
                          : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                      }`}
                    >
                      {format}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  Select formats to convert imported files to. Leave empty to skip conversion.
                </p>
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-1">Output Profile</label>
                <select
                  value={newSettings.outputProfile}
                  onChange={(e) =>
                    setNewSettings({ ...newSettings, outputProfile: e.target.value })
                  }
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  {outputProfiles.map((profile) => (
                    <option key={profile.value} value={profile.value}>
                      {profile.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-zinc-500 mt-1">
                  Optimize converted files for specific e-reader devices
                </p>
              </div>

              {/* Test Result */}
              {modalTestResult && (
                <div
                  className={`p-3 rounded-lg text-sm ${
                    modalTestResult.success
                      ? "bg-green-900/30 border border-green-800 text-green-300"
                      : "bg-red-900/30 border border-red-800 text-red-300"
                  }`}
                >
                  {modalTestResult.success ? "✓ " : "✗ "}
                  {modalTestResult.message}
                  {modalTestResult.libraries && modalTestResult.libraries.length > 0 && (
                    <div className="mt-1 text-xs">
                      Available libraries: {modalTestResult.libraries.join(", ")}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleTestModalSettings}
                  disabled={modalTesting || !newSettings.host || !newSettings.port}
                  className="px-4 py-2 text-sm font-medium border border-zinc-600 text-zinc-300 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  {modalTesting ? "Testing..." : "Test Connection"}
                </button>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false);
                      setEditingId(null);
                      setNewSettings(emptySettings);
                    }}
                    className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {editingId ? "Save" : "Add"}
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
