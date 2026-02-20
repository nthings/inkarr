"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DownloadQueue } from "./DownloadQueue";
import { ImportManager } from "./ImportManager";

interface User {
  id: number;
  username: string;
  isAdmin: boolean;
}

const navItems = [
  { href: "/series", label: "Library" },
  { href: "/settings", label: "Settings" },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // Check if auth is enabled
      const configRes = await fetch("/api/v1/config?key=AuthenticationMethod");
      const config = await configRes.json();
      const isAuthEnabled = config.value && config.value !== "none";
      setAuthEnabled(isAuthEnabled);

      if (isAuthEnabled) {
        // Get current user
        const authRes = await fetch("/api/v1/auth");
        const authData = await authRes.json();
        if (authData.authenticated && authData.user) {
          setUser(authData.user);
        }
      }
    } catch (error) {
      console.error("Auth check failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/v1/auth", { method: "DELETE" });
      setUser(null);
      setShowUserMenu(false);
      router.push("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const isActive = (href: string) => {
    if (href === "/series") {
      return pathname === "/series" || pathname.startsWith("/series/");
    }
    if (href === "/settings") {
      return pathname.startsWith("/settings");
    }
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <header className="border-b border-zinc-800 bg-zinc-900">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <img src="/logo.png" alt="Inkarr" className="w-50" />            
          </Link>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-sm transition-colors ${
                isActive(item.href)
                  ? "text-white font-medium"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <ImportManager />
          <DownloadQueue />
          
          {/* User Menu */}
          {authEnabled && user && (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center">
                  <span className="text-xs font-medium text-white">
                    {user.username.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="hidden sm:inline">{user.username}</span>
                <svg
                  className={`w-4 h-4 transition-transform ${showUserMenu ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-48 rounded-lg bg-zinc-800 border border-zinc-700 shadow-lg z-50">
                    <div className="px-4 py-3 border-b border-zinc-700">
                      <p className="text-sm font-medium text-white">{user.username}</p>
                      <p className="text-xs text-zinc-400">
                        {user.isAdmin ? "Administrator" : "User"}
                      </p>
                    </div>
                    <div className="py-1">
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
                      >
                        Sign out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </nav>

        {/* Mobile Menu Button */}
        <div className="flex md:hidden items-center gap-2">
          <ImportManager />
          <DownloadQueue />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-zinc-400 hover:text-white transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-zinc-800 bg-zinc-900">
          <nav className="px-4 py-3 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive(item.href)
                    ? "bg-zinc-800 text-white font-medium"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                }`}
              >
                {item.label}
              </Link>
            ))}
            {authEnabled && user && (
              <>
                <div className="border-t border-zinc-800 my-2" />
                <div className="px-3 py-2">
                  <p className="text-sm font-medium text-white">{user.username}</p>
                  <p className="text-xs text-zinc-400">
                    {user.isAdmin ? "Administrator" : "User"}
                  </p>
                </div>
                <button
                  onClick={() => {
                    handleLogout();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-zinc-800/50 transition-colors"
                >
                  Sign out
                </button>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
