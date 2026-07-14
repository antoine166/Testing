"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { logout } from "@/lib/actions/auth";

type SidebarDomain = { id: string; name: string; color: string };
type SidebarProject = { id: string; name: string; domain_id: string | null };

const SMART_LISTS = [
  { href: "/inbox", label: "Inbox", icon: "📥", iconBg: "#3b82f6" },
  { href: "/", label: "Today", icon: "★", iconBg: "#eab308" },
  { href: "/upcoming", label: "Upcoming", icon: "📅", iconBg: "#ef4444" },
  { href: "/anytime", label: "Anytime", icon: "📚", iconBg: "#14b8a6" },
  { href: "/someday", label: "Someday", icon: "📦", iconBg: "#d97706" },
  { href: "/logbook", label: "Logbook", icon: "✓", iconBg: "#22c55e" },
] as const;

const UTILITY_LINKS = [
  { href: "/tasks", label: "All Tasks" },
  { href: "/habits", label: "Habits" },
  { href: "/routines", label: "Routines" },
  { href: "/checklists", label: "Checklists" },
  { href: "/checkin", label: "Check-in" },
  { href: "/library", label: "Library" },
  { href: "/coach", label: "Coach" },
  { href: "/analytics", label: "Analytics" },
  { href: "/trash", label: "Trash" },
  { href: "/settings", label: "Settings" },
];

function NavIcon({ icon, bg }: { icon: string; bg: string }) {
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
      style={{ backgroundColor: bg }}
    >
      {icon}
    </span>
  );
}

export default function SidebarNav({
  userEmail,
  domains,
  projects,
  inboxCount,
  todayCount,
}: {
  userEmail?: string;
  domains: SidebarDomain[];
  projects: SidebarProject[];
  inboxCount: number;
  todayCount: number;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeDomainId = pathname === "/tasks" ? searchParams.get("domain") : null;
  const router = useRouter();

  const counts: Record<string, number | undefined> = {
    "/inbox": inboxCount || undefined,
    "/": todayCount || undefined,
  };

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/tasks?q=${encodeURIComponent(query.trim())}`);
    setMobileOpen(false);
  }

  const sidebarContent = (
    <div className="flex h-full flex-col overflow-y-auto px-3 py-4">
      <Link
        href="/"
        className="mb-4 px-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50"
        onClick={() => setMobileOpen(false)}
      >
        Life OS
      </Link>

      <form onSubmit={handleSearch} className="mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Quick Find"
          className="w-full rounded-lg bg-zinc-100 px-3 py-1.5 text-sm text-zinc-700 placeholder:text-zinc-400 focus:outline-none dark:bg-zinc-900 dark:text-zinc-300"
        />
      </form>

      <div className="space-y-0.5">
        {SMART_LISTS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium ${
                active
                  ? "bg-zinc-200/70 text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
              }`}
            >
              <NavIcon icon={item.icon} bg={item.iconBg} />
              <span className="flex-1">{item.label}</span>
              {counts[item.href] !== undefined && (
                <span className="text-xs text-zinc-400">{counts[item.href]}</span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="mt-5 space-y-3">
        {domains.map((domain) => {
          const domainProjects = projects.filter((p) => p.domain_id === domain.id);
          const domainActive = activeDomainId === domain.id;

          return (
            <details key={domain.id} open className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1 text-sm">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: domain.color }}
                />
                <Link
                  href={`/tasks?domain=${domain.id}`}
                  onClick={() => setMobileOpen(false)}
                  className={`flex-1 truncate font-medium ${
                    domainActive
                      ? "text-zinc-950 dark:text-zinc-50"
                      : "text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  {domain.name}
                </Link>
                {domainProjects.length > 0 && (
                  <span className="text-zinc-400 transition-transform group-open:rotate-90">
                    ›
                  </span>
                )}
              </summary>
              {domainProjects.length > 0 && (
                <div className="ml-5 mt-0.5 space-y-0.5 border-l border-zinc-200 pl-3 dark:border-zinc-800">
                  {domainProjects.map((project) => (
                    <Link
                      key={project.id}
                      href={`/tasks?project=${project.id}`}
                      onClick={() => setMobileOpen(false)}
                      className="block truncate rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
                    >
                      {project.name}
                    </Link>
                  ))}
                </div>
              )}
            </details>
          );
        })}

        <Link
          href="/domains"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:bg-zinc-900"
        >
          <span className="text-base leading-none">+</span> New List
        </Link>
      </div>

      <div className="mt-5 space-y-0.5 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        {UTILITY_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setMobileOpen(false)}
            className={`block rounded-md px-2 py-1 text-sm ${
              pathname === link.href
                ? "font-medium text-zinc-950 dark:text-zinc-50"
                : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:bg-zinc-900"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>

      <div className="mt-auto space-y-2 pt-4">
        {userEmail && <p className="px-2 text-xs text-zinc-400">{userEmail}</p>}
        <form action={logout}>
          <button
            type="submit"
            className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Log out
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-black/90 md:hidden">
        <Link href="/" className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
          Life OS
        </Link>
        <button
          onClick={() => setMobileOpen((o) => !o)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 text-lg text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
        >
          {mobileOpen ? "✕" : "☰"}
        </button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 md:block">
        {sidebarContent}
      </div>
    </>
  );
}
