"use client";

import { useState, useEffect } from "react";

interface GeneralSettings {
  apiKey: string;
  authenticationMethod: string;
  logLevel: string;
}

interface User {
  id: number;
  username: string;
  isAdmin: boolean;
  createdAt: string;
}

export default function GeneralSettingsPage() {
  const [settings, setSettings] = useState<GeneralSettings>({
    apiKey: "",
    authenticationMethod: "none",
    logLevel: "info",
  });
  const [users, setUsers] = useState<User[]>([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", password: "", isAdmin: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadSettings();
    loadUsers();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/v1/config");
      if (!response.ok) throw new Error("Failed to load settings");
      
      const config = await response.json();
      
      setSettings({
        apiKey: config.ApiKey || "",
        authenticationMethod: config.AuthenticationMethod || "none",
        logLevel: config.LogLevel || "info",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await fetch("/api/v1/users");
      if (response.ok) {
        const data = await response.json();
        setUsers(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to load users:", err);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const updates: Record<string, string> = {
        AuthenticationMethod: settings.authenticationMethod,
        LogLevel: settings.logLevel,
      };

      const response = await fetch("/api/v1/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!response.ok) throw new Error("Failed to save settings");
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateApiKey = async () => {
    try {
      const response = await fetch("/api/v1/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "ApiKey", regenerate: true }),
      });

      if (!response.ok) throw new Error("Failed to regenerate API key");
      
      const result = await response.json();
      setSettings(prev => ({ ...prev, apiKey: result.value }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate API key");
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch("/api/v1/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create user");
      }
      
      setNewUser({ username: "", password: "", isAdmin: false });
      setShowAddUser(false);
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    
    try {
      const response = await fetch(`/api/v1/users/${id}`, { method: "DELETE" });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete user");
      }
      
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    }
  };

  const copyApiKey = () => {
    navigator.clipboard.writeText(settings.apiKey);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">General</h3>
        <p className="text-sm text-zinc-400">Configure security and logging settings</p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-900/50 border border-red-700 p-4 text-red-200">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-white">×</button>
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-green-900/50 border border-green-700 p-4 text-green-200">
          Settings saved successfully
        </div>
      )}

      {/* Security */}
      <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
        <h4 className="font-medium mb-4">Security</h4>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Authentication</label>
            <select
              value={settings.authenticationMethod}
              onChange={(e) => setSettings({ ...settings, authenticationMethod: e.target.value })}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="none">None</option>
              <option value="forms">Forms (Login page)</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm text-zinc-400 mb-1">API Key</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={settings.apiKey}
                readOnly
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white font-mono text-sm"
              />
              <button
                onClick={handleRegenerateApiKey}
                className="px-3 py-2 text-sm bg-zinc-700 rounded-lg hover:bg-zinc-600 transition-colors"
              >
                Regenerate
              </button>
              <button
                onClick={copyApiKey}
                className="px-3 py-2 text-sm bg-zinc-700 rounded-lg hover:bg-zinc-600 transition-colors"
              >
                Copy
              </button>
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Use this key in the X-Api-Key header to authenticate API requests
            </p>
          </div>
        </div>
      </div>

      {/* Users */}
      {settings.authenticationMethod !== "none" && (
        <div className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-zinc-800">
            <h4 className="font-medium">Users</h4>
            <button
              onClick={() => setShowAddUser(true)}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              + Add User
            </button>
          </div>
          
          {users.length === 0 ? (
            <div className="p-8 text-center text-zinc-500">
              No users configured. Add a user to enable authentication.
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {users.map((user) => (
                <div key={user.id} className="flex items-center justify-between p-4 hover:bg-zinc-800/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center">
                      <span className="text-sm font-medium text-white">
                        {user.username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="font-medium">{user.username}</div>
                      <div className="text-sm text-zinc-400">
                        {user.isAdmin ? "Administrator" : "User"}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteUser(user.id)}
                    className="text-zinc-400 hover:text-red-400 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Logging */}
      <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
        <h4 className="font-medium mb-4">Logging</h4>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Log Level</label>
          <select
            value={settings.logLevel}
            onChange={(e) => setSettings({ ...settings, logLevel: e.target.value })}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
          >
            <option value="trace">Trace</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {/* Add User Modal */}
      {showAddUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-900 rounded-lg border border-zinc-700 p-6 w-full max-w-md">
            <h3 className="text-lg font-medium mb-4">Add User</h3>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Username</label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  required
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Password</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  required
                  minLength={4}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isAdmin"
                  checked={newUser.isAdmin}
                  onChange={(e) => setNewUser({ ...newUser, isAdmin: e.target.checked })}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-800"
                />
                <label htmlFor="isAdmin" className="text-sm text-zinc-300">Administrator</label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddUser(false)}
                  className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Add User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
