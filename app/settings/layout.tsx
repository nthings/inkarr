"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Header } from "@/app/components/Header";

const settingsNav = [
  { href: "/settings/mediamanagement", label: "Media Management", icon: "📁" },
  { href: "/settings/quality", label: "Quality", icon: "⭐" },
  { href: "/settings/indexers", label: "Indexers", icon: "🔍" },
  { href: "/settings/downloadclients", label: "Download Clients", icon: "⬇️" },
  { href: "/settings/calibre", label: "Calibre", icon: "📚" },
  { href: "/settings/tasks", label: "Scheduled Tasks", icon: "🕐" },
  { href: "/settings/general", label: "General", icon: "⚙️" },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Header />

      <div className="mx-auto max-w-7xl px-4 py-8">
        <h2 className="text-2xl font-semibold mb-6">Settings</h2>

        <div className="flex gap-8">
          {/* Sidebar */}
          <nav className="w-56 flex-shrink-0">
            <div className="space-y-1">
              {settingsNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${
                    pathname === item.href
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                  }`}
                >
                  <span suppressHydrationWarning>{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>

          {/* Content */}
          <div className="flex-1">{children}</div>
        </div>
      </div>
    </div>
  );
}
