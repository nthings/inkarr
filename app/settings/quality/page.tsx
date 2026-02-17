"use client";

import { useEffect, useState } from "react";

interface QualityProfile {
  id: number;
  name: string;
  cutoff: string;
  items: { quality: string; allowed: boolean }[];
}

const defaultQualities = [
  { quality: "CBZ", label: "CBZ", description: "Comic Book Zip Archive" },
  { quality: "CBR", label: "CBR", description: "Comic Book RAR Archive" },
  { quality: "PDF", label: "PDF", description: "Portable Document Format" },
  { quality: "EPUB", label: "EPUB", description: "Electronic Publication" },
  { quality: "MOBI", label: "MOBI", description: "Mobipocket eBook" },
  { quality: "RAW", label: "Raw Images", description: "Folder of images (PNG/JPG)" },
];

export default function QualityPage() {
  const [profiles, setProfiles] = useState<QualityProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<QualityProfile | null>(null);

  const [newProfile, setNewProfile] = useState({
    name: "",
    cutoff: "CBZ",
    items: defaultQualities.map((q) => ({ quality: q.quality, allowed: true })),
  });

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    try {
      const res = await fetch("/api/v1/qualityprofile");
      const data = await res.json();
      setProfiles(data);
    } catch (error) {
      console.error("Failed to fetch quality profiles:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/v1/qualityprofile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProfile),
      });

      if (res.ok) {
        setShowAddModal(false);
        setNewProfile({
          name: "",
          cutoff: "CBZ",
          items: defaultQualities.map((q) => ({ quality: q.quality, allowed: true })),
        });
        fetchProfiles();
      }
    } catch (error) {
      console.error("Failed to add quality profile:", error);
    }
  };

  const handleDeleteProfile = async (id: number) => {
    if (!confirm("Are you sure you want to delete this quality profile?")) return;
    try {
      await fetch(`/api/v1/qualityprofile/${id}`, { method: "DELETE" });
      fetchProfiles();
    } catch (error) {
      console.error("Failed to delete quality profile:", error);
    }
  };

  const toggleQuality = (quality: string) => {
    setNewProfile({
      ...newProfile,
      items: newProfile.items.map((item) =>
        item.quality === quality ? { ...item, allowed: !item.allowed } : item
      ),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Quality</h3>
        <p className="text-sm text-zinc-400">Configure quality profiles for your series</p>
      </div>

      {/* Quality Definitions */}
      <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
        <h4 className="font-medium mb-4">Quality Definitions</h4>
        <div className="space-y-2">
          {defaultQualities.map((q) => (
            <div
              key={q.quality}
              className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50"
            >
              <div>
                <div className="font-medium">{q.label}</div>
                <div className="text-sm text-zinc-400">{q.description}</div>
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-zinc-700 text-zinc-300">
                {q.quality}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Quality Profiles */}
      <div className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h4 className="font-medium">Quality Profiles</h4>
          <button
            onClick={() => setShowAddModal(true)}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            + Add Profile
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
          </div>
        ) : profiles.length === 0 ? (
          <div className="p-8 text-center text-zinc-400">
            No quality profiles. Add one or use the default profile.
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className="flex items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors"
              >
                <div>
                  <div className="font-medium">{profile.name}</div>
                  <div className="text-sm text-zinc-400">
                    Cutoff: {profile.cutoff} • {profile.items.filter((i) => i.allowed).length} formats allowed
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setEditingProfile(profile)}
                    className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteProfile(profile.id)}
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
          <div className="bg-zinc-900 rounded-lg border border-zinc-700 p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-medium mb-4">Add Quality Profile</h3>
            <form onSubmit={handleAddProfile} className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Name</label>
                <input
                  type="text"
                  value={newProfile.name}
                  onChange={(e) => setNewProfile({ ...newProfile, name: e.target.value })}
                  placeholder="e.g., HD Comics"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Upgrade Until (Cutoff)</label>
                <select
                  value={newProfile.cutoff}
                  onChange={(e) => setNewProfile({ ...newProfile, cutoff: e.target.value })}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  {defaultQualities.map((q) => (
                    <option key={q.quality} value={q.quality}>
                      {q.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Allowed Qualities</label>
                <div className="space-y-2">
                  {defaultQualities.map((q) => {
                    const item = newProfile.items.find((i) => i.quality === q.quality);
                    return (
                      <label
                        key={q.quality}
                        className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50 cursor-pointer hover:bg-zinc-800"
                      >
                        <input
                          type="checkbox"
                          checked={item?.allowed ?? false}
                          onChange={() => toggleQuality(q.quality)}
                          className="rounded border-zinc-600 bg-zinc-700 text-blue-500 focus:ring-blue-500"
                        />
                        <div>
                          <div className="font-medium">{q.label}</div>
                          <div className="text-sm text-zinc-400">{q.description}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
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
