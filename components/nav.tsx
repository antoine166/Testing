"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions/auth";

const LINKS = [
  { href: "/", label: "Today" },
  { href: "/domains", label: "Domains" },
  { href: "/projects", label: "Projects" },
  { href: "/tasks", label: "Tasks" },
  { href: "/habits", label: "Habits" },
  { href: "/analytics", label: "Analytics" },
  { href: "/routines", label: "Routines" },
  { href: "/checklists", label: "Checklists" },
  { href: "/checkin", label: "Check-in" },
  { href: "/library", label: "Library" },
  { href: "/coach", label: "Coach" },
  { href: "/trash", label: "Trash" },
  { href: "/settings", label: "Settings" },
];

export default function Nav({ userEmail }: { userEmail?: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-black/90">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
          Life OS
        </Link>

        <div className="hidden items-center gap-4 md:flex">
          {LINKS.filter((l) => l.href !== "/").map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium ${
                pathname === link.href
                  ? "text-zinc-950 underline dark:text-zinc-50"
                  : "text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Log out
            </button>
          </form>
        </div>

        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close menu" : "Open menu"}
          className="flex h-10 w-10 items-center justify-center rounded-md border border-zinc-300 text-lg text-zinc-700 dark:border-zinc-700 dark:text-zinc-300 md:hidden"
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {open && (
        <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800 md:hidden">
          <div className="flex flex-col gap-1">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`rounded-md px-2 py-2.5 text-sm font-medium ${
                  pathname === link.href
                    ? "bg-zinc-100 text-zinc-950 dark:bg-zinc-900 dark:text-zinc-50"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                {link.label}
              </Link>
            ))}
            {userEmail && (
              <p className="px-2 pt-2 text-xs text-zinc-500">Signed in as {userEmail}</p>
            )}
            <form action={logout} className="px-2 pt-1">
              <button
                type="submit"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
      )}
    </nav>
  );
}
