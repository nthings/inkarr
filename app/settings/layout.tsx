"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Header } from "@/app/components/Header";

const settingsNav = [
  { href: "/settings/mediamanagement", label: "Media Management", icon: "📁" },
  { href: "/settings/quality", label: "Quality", icon: "⭐" },
  { href: "/settings/indexers", label: "Indexers", icon: "🔍" },
  { href: "/settings/downloadclients", label: "Download Clients", icon: "⬇️" },
  { href: "/settings/calibre", label: "Calibre", icon: "📚" },
  { href: "/settings/import", label: "Import", icon: "📥" },
  { href: "/settings/tasks", label: "Scheduled Tasks", icon: "🕐" },
  { href: "/settings/general", label: "General", icon: "⚙️" },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  
  const currentNav = settingsNav.find(item => pathname === item.href);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Header />

      <div className="mx-auto max-w-7xl px-4 py-6 md:py-8">
        <h2 className="text-xl md:text-2xl font-semibold mb-4 md:mb-6">Settings</h2>

        <div className="flex flex-col md:flex-row gap-4 md:gap-8">
          {/* Mobile Navigation Dropdown */}
          <div className="md:hidden">
            <button
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-left"
            >
              <div className="flex items-center gap-3">
                <span suppressHydrationWarning>{currentNav?.icon || "⚙️"}</span>
                <span className="font-medium">{currentNav?.label || "Settings"}</span>
              </div>
              <svg
                className={`w-5 h-5 text-zinc-400 transition-transform ${mobileNavOpen ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {mobileNavOpen && (
              <nav className="mt-2 bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden">
                {settingsNav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileNavOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 text-sm transition-colors border-b border-zinc-800 last:border-0 ${
                      pathname === item.href
                        ? "bg-zinc-800 text-white"
                        : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                    }`}
                  >
                    <span suppressHydrationWarning>{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
              </nav>
            )}
          </div>

          {/* Desktop Sidebar */}
          <nav className="hidden md:block w-56 flex-shrink-0">
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
          <div className="flex-1 min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
