"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** The page tabs in four groups, so all of them show at once on a computer or iPad - no sliding sideways (Carter, 2026-10-14). */
export const TAB_GROUPS: { name: string; tabs: { href: string; label: string; ownerOnly?: boolean }[] }[] = [
  {
    name: "Daily",
    tabs: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/transfers", label: "Transfers" },
      { href: "/preg-check", label: "Preg Check" },
      { href: "/open", label: "Open Inventory" },
      { href: "/day75", label: "75+ Day Cows" },
    ],
  },
  {
    name: "Reports",
    tabs: [
      { href: "/breakdowns", label: "Breakdowns" },
      { href: "/repeats", label: "Repeat Transfers" },
      { href: "/customer", label: "Customer Search" },
    ],
  },
  {
    name: "Cow records",
    tabs: [
      { href: "/lookup", label: "Cow Lookup" },
      { href: "/master", label: "Master Sheet" },
      { href: "/archive", label: "Master Archive" },
    ],
  },
  {
    name: "Office",
    tabs: [
      { href: "/billing", label: "Billing", ownerOnly: true },
      { href: "/lists", label: "Lists" },
    ],
  },
];
export const TABS = TAB_GROUPS.flatMap((g) => g.tabs);

/** owner = false hides the owner-only tabs (Billing): a Manager login has no access to billing (Carter, 2026-10-14). */
export function Nav({ owner = true }: { owner?: boolean }) {
  const path = usePathname() ?? "";
  return (
    <nav className="no-print flex flex-wrap items-center gap-x-5 gap-y-2 bg-brand-600 px-3 py-2 shadow-sm">
      {TAB_GROUPS.map((g) => (
        <div key={g.name} className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[10px] font-bold uppercase tracking-wider text-white/60">{g.name}</span>
          {g.tabs.filter((t) => owner || !t.ownerOnly).map((t) => {
            const on = path === t.href || path.startsWith(t.href + "/");
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={
                  "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition " +
                  (on ? "bg-white text-brand-700 shadow ring-2 ring-rust" : "bg-white/15 text-white ring-1 ring-white/40 hover:bg-white/30")
                }
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      ))}
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
