import Link from "next/link";
import { Logo } from "./Logo";
import { Nav, SignOut } from "./Nav";
import { AskBox, Toaster } from "./ui";
import type { Member } from "@/lib/server/session";

/** The page frame: logo, ranch name, Import / Account / Log out, then the tabs (same feel as HerdLive). */
export function Shell({ member, children, customer = false }: { member: Member; children: React.ReactNode; customer?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col" data-view={member.role === "MANAGER" || undefined}>
      <header className="no-print z-30 bg-white md:sticky md:top-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 px-4 py-2">
          <Link href={customer ? "/my" : "/dashboard"} className="flex items-center">
            <Logo />
          </Link>
          <span className="truncate border-l border-slate-200 pl-3 text-sm text-slate-500">{member.ranch}</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {member.role === "MANAGER" && <span className="rounded-full bg-tan px-3 py-1 text-xs font-semibold text-brand-700">View only</span>}
            {!customer && (
              <Link href="/import" className="btn-quiet edit-only">
                Import
              </Link>
            )}
            <Link href="/account" className="btn-quiet">
              Account
            </Link>
            <SignOut />
          </div>
        </div>
        {!customer && <Nav />}
      </header>
      <main className="min-w-0 flex-1 px-4 py-5 md:px-6">{children}</main>
      <footer className="no-print px-4 pb-4 text-center text-[11px] text-slate-400">© {new Date().getFullYear()} RecipLive</footer>
      <Toaster />
      <AskBox />
    </div>
  );
}

export function PageHeader({ title, sub, children }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <div className="mr-auto min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {sub && <p className="mt-0.5 max-w-3xl text-sm text-slate-500">{sub}</p>}
      </div>
      {children && <div className="no-print flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
