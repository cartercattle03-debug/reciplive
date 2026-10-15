"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ask, post, toast } from "./ui";

export function ChangePassword() {
  const [f, setF] = useState({ current: "", next: "" });
  return (
    <form
      className="card max-w-md p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await post("/api/account", { action: "password", ...f });
          toast("Password changed.");
          setF({ current: "", next: "" });
        } catch (x) {
          toast((x as Error).message, true);
        }
      }}
    >
      <h2 className="mb-3 text-sm font-semibold">Change your password</h2>
      <input className="field mb-2" type="password" placeholder="Current password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} autoComplete="current-password" />
      <input className="field mb-3" type="password" placeholder="New password (8+ characters)" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} autoComplete="new-password" />
      <button className="btn">Change password</button>
    </form>
  );
}

type Login = { id: string; email: string; name: string; role: string; ownerName: string | null; lastLogin: string };

export function Logins({ logins, owners }: { logins: Login[]; owners: string[] }) {
  const router = useRouter();
  const [f, setF] = useState({ role: "CUSTOMER", ownerName: owners[0] ?? "", name: "", email: "", password: "" });
  const act = async (body: Record<string, unknown>, ok: string) => {
    try {
      await post("/api/account", body);
      toast(ok);
      router.refresh();
      return true;
    } catch (x) {
      toast((x as Error).message, true);
      return false;
    }
  };
  return (
    <div className="card max-w-4xl overflow-hidden">
      <div className="bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Logins</div>
      <p className="px-4 pt-2 text-xs text-slate-500">A customer login sees only that owner&apos;s cows (their own report, live) and can&apos;t change anything. A manager login is view only - no changes, no imports, no printing or downloads - and sees nothing about money or customer contact info: no Billing, Master Sheet or Master Archive, and no purchase, cost or sale figures on Cow Lookup.</p>
      <table className="keep-width m-3 text-sm">
        <thead>
          <tr className="text-xs text-slate-500">
            <th className="px-2">Email</th>
            <th className="px-2">Name</th>
            <th className="px-2">Kind</th>
            <th className="px-2">Sees</th>
            <th className="px-2">Last log in</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {logins.map((l, i) => (
            <tr key={l.id} className={i % 2 ? "bg-stripe" : ""}>
              <td className="tc">{l.email}</td>
              <td className="tc">{l.name}</td>
              <td className="tc">{l.role === "OWNER" ? "Owner" : l.role === "MANAGER" ? "Manager" : "Customer"}</td>
              <td className="tc">
                {l.role === "CUSTOMER" ? (
                  <a className="text-brand-600 underline" href={`/my?as=${encodeURIComponent(l.ownerName ?? "")}`} title="See exactly what this login sees">
                    {l.ownerName}&apos;s cows
                  </a>
                ) : l.role === "MANAGER" ? "View only - no billing, costs, sales or customer contact info" : "Everything"}
              </td>
              <td className="tc">{l.lastLogin}</td>
              <td className="tc whitespace-nowrap">
                {l.role !== "OWNER" && (
                  <>
                    <button
                      className="mr-2 text-xs text-brand-600 hover:underline"
                      onClick={async () => {
                        const pw = window.prompt(`New password for ${l.email} (8+ characters):`);
                        if (pw) act({ action: "resetPassword", id: l.id, password: pw }, "Password set - give it to them.");
                      }}
                    >
                      Set password
                    </button>
                    <button className="text-xs text-red-700 hover:underline" onClick={async () => (await ask(`Remove the login for ${l.email}? Their records aren't touched.`, "Remove")) && act({ action: "removeLogin", id: l.id }, "Login removed.")}>
                      Remove
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="flex flex-wrap items-end gap-2 border-t border-slate-100 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await act({ action: "addLogin", ...f }, `Login made for ${f.email}. Give them the email and starting password.`)) setF({ ...f, name: "", email: "", password: "" });
        }}
      >
        <span className="w-full text-xs font-semibold uppercase tracking-wide text-slate-500">Add a login</span>
        <label className="text-xs font-medium text-slate-600">
          Kind
          <select className="field mt-0.5 w-32" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            <option value="CUSTOMER">Customer</option>
            <option value="MANAGER">Manager (view only, no money)</option>
          </select>
        </label>
        {f.role === "CUSTOMER" && (
          <label className="text-xs font-medium text-slate-600">
            Owner
            <select className="field mt-0.5 w-36" value={f.ownerName} onChange={(e) => setF({ ...f, ownerName: e.target.value })}>
              {owners.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs font-medium text-slate-600">
          Name
          <input className="field mt-0.5 w-36" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Email
          <input className="field mt-0.5 w-52" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Starting password
          <input className="field mt-0.5 w-40" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
        </label>
        <button className="btn">Add login</button>
      </form>
    </div>
  );
}

export function UndoList({ snaps }: { snaps: { id: string; label: string; when: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="card max-w-2xl overflow-hidden">
      <div className="bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Undo</div>
      <p className="px-4 pt-2 text-xs text-slate-500">A copy is kept before every big step (imports, Confirm & Archive, deleting a record) - the last 15. Undo puts every record back exactly as it was just before that step. Undo itself keeps a copy too, so it can be undone.</p>
      {snaps.length === 0 && <p className="p-4 text-sm text-slate-500">Nothing to undo yet.</p>}
      <ul className="divide-y divide-slate-100 p-2">
        {snaps.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-2 py-2 text-sm">
            <span className="flex-1">
              <b>{s.label}</b> <span className="text-xs text-slate-500">· {s.when}</span>
            </span>
            <button
              className="btn-quiet"
              disabled={busy}
              onClick={async () => {
                if (!(await ask(`Put every record back the way it was just before "${s.label}" (${s.when})?\n\nAnything changed since then is replaced.`, "Undo"))) return;
                setBusy(true);
                try {
                  await post("/api/undo", { id: s.id });
                  toast("Done - records are back as they were.");
                  router.refresh();
                } catch (x) {
                  toast((x as Error).message, true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Undo to before this
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
