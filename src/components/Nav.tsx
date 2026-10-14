"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const TABS: { href: string; label: string }[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/transfers", label: "Transfers" },
  { href: "/preg-check", label: "Preg Check" },
  { href: "/day75", label: "75+ Day Cows" },
  { href: "/open", label: "Open Inventory" },
  { href: "/lookup", label: "Cow Lookup" },
  { href: "/repeats", label: "Repeat Transfers" },
  { href: "/breakdowns", label: "Breakdowns" },
  { href: "/customer", label: "Customer Search" },
  { href: "/master", label: "Master Sheet" },
  { href: "/archive", label: "Master Archive" },
  { href: "/lists", label: "Lists" },
];

export function Nav() {
  const path = usePathname() ?? "";
  return (
    <nav className="no-print flex gap-1 overflow-x-auto bg-brand-600 px-3 pt-1.5 shadow-sm">
      {TABS.map((t) => {
        const on = path === t.href || path.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              "whitespace-nowrap rounded-t-md border-b-[3px] px-3.5 py-2.5 text-[15px] font-semibold transition " +
              (on ? "border-rust bg-white text-brand-700" : "border-transparent text-white/90 hover:bg-brand-700 hover:text-white")
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SignOut() {
  return (
    <button
      className="btn-quiet"
      onClick={async () => {
        const { signOut } = await import("next-auth/react");
        signOut({ callbackUrl: "/login" });
      }}
    >
      Log out
    </button>
  );
}
