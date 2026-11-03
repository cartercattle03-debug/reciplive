"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { post, toast } from "./ui";

export type RanchRow = {
  id: string;
  name: string;
  own: boolean;
  owner: string;
  ownerName: string;
  invited: string;
  inviteOpen: boolean;
  status: string;
  trialEnds: string;
  paidThrough: string;
  note: string;
  locked: boolean;
  created: string;
  lastLogin: string;
  logins: number;
  transfers: number;
  cows: number;
  invoices: number;
};

const LABEL: Record<string, string> = { TRIAL: "Testing", ACTIVE: "Active", PAUSED: "Paused" };

/** The owner's set-your-password link, shown once to copy and send. */
function LinkBox({ link, email, onClose }: { link: string; email: string; onClose: () => void }) {
  return (
    <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm">
      <p className="mb-1 font-semibold text-emerald-900">Send this link to {email}</p>
      <p className="mb-2 text-xs text-emerald-800">It works once, for 14 days. They open it, set their own password, and they&apos;re in their ranch.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input readOnly value={link} className="field min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              toast("Link copied - paste it into a text or email.");
            } catch {
              toast("Couldn't copy - press and hold the link to copy it.", true);
            }
          }}
        >
          Copy link
        </button>
        <button type="button" className="btn-quiet" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

function NewRanch() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", email: "", trialDays: "30", note: "" });
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ link: string; email: string } | null>(null);
  if (made) return <LinkBox {...made} onClose={() => setMade(null)} />;
  return (
    <form
      className="card mb-5 max-w-4xl p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const r = await post<{ link: string; email: string }>("/api/admin", { action: "create", ...f });
          setMade(r);
          setF({ name: "", email: "", trialDays: "30", note: "" });
          router.refresh();
        } catch (x) {
          toast((x as Error).message, true);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="mb-2 text-sm font-semibold text-slate-900">+ New ranch</h2>
      <p className="mb-3 text-xs text-slate-500">A blank slate: no cows, lists or invoices. Its owner gets everything you have - transfers, preg check, open inventory, billing, and their own customer, manager and office logins.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-600">
          Ranch name
          <input className="field mt-1 w-56" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Owner&apos;s email
          <input className="field mt-1 w-64" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Testing for (days)
          <input className="field mt-1 w-24" inputMode="numeric" value={f.trialDays} onChange={(e) => setF({ ...f, trialDays: e.target.value.replace(/\D/g, "") })} />
        </label>
        <label className="min-w-[12rem] flex-1 text-xs font-medium text-slate-600">
          Note (only you see it)
          <input className="field mt-1" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </label>
        <button className="btn" disabled={busy}>
          {busy ? "Making..." : "Make ranch"}
        </button>
      </div>
    </form>
  );
}

function Row({ r }: { r: RanchRow }) {
  const router = useRouter();
  const [f, setF] = useState({ status: r.status, trialEnds: r.trialEnds, paidThrough: r.paidThrough, note: r.note });
  const [link, setLink] = useState<{ link: string; email: string } | null>(null);
  const changed = f.status !== r.status || f.trialEnds !== r.trialEnds || f.paidThrough !== r.paidThrough || f.note !== r.note;
  const save = async () => {
    try {
      await post("/api/admin", { action: "update", id: r.id, ...f });
      toast(`${r.name} saved.`);
      router.refresh();
    } catch (x) {
      toast((x as Error).message, true);
    }
  };
  return (
    <>
      <tr className="border-t border-slate-200 align-top">
        <td className="px-2 py-2 text-left">
          <div className="font-semibold text-slate-900">{r.name}</div>
          <div className="text-[11px] text-slate-500">since {r.created}</div>
        </td>
        <td className="px-2 py-2 text-left text-xs">
          {r.owner ? (
            <>
              <div>{r.ownerName || r.owner}</div>
              {r.ownerName && <div className="text-slate-500">{r.owner}</div>}
            </>
          ) : (
            <div className="text-amber-700">
              Not set up yet{r.invited ? ` - link sent to ${r.invited}` : ""}
              {r.invited && !r.inviteOpen ? " (expired)" : ""}
              <button
                type="button"
                className="mt-1 block text-brand-600 underline"
                onClick={async () => {
                  try {
                    setLink(await post<{ link: string; email: string }>("/api/admin", { action: "invite", id: r.id }));
                    router.refresh();
                  } catch (x) {
                    toast((x as Error).message, true);
                  }
                }}
              >
                New owner link
              </button>
            </div>
          )}
        </td>
        <td className="px-2 py-2">
          {r.own ? (
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">Your ranch</span>
          ) : (
            <select className="field w-28 py-1" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              {Object.entries(LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          )}
          {r.locked && <div className="mt-1 text-[11px] font-semibold text-red-700">View only now</div>}
        </td>
        <td className="px-2 py-2">{!r.own && <input type="date" className="field w-36 py-1" value={f.trialEnds} onChange={(e) => setF({ ...f, trialEnds: e.target.value })} />}</td>
        <td className="px-2 py-2">{!r.own && <input type="date" className="field w-36 py-1" value={f.paidThrough} onChange={(e) => setF({ ...f, paidThrough: e.target.value })} />}</td>
        <td className="px-2 py-2 text-xs">{r.lastLogin || "-"}</td>
        <td className="px-2 py-2 text-xs">
          {r.transfers} transfers · {r.cows} cows · {r.invoices} invoices · {r.logins} {r.logins === 1 ? "login" : "logins"}
        </td>
        <td className="px-2 py-2">{!r.own && <input className="field w-44 py-1" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />}</td>
        <td className="px-2 py-2">
          {!r.own && (
            <button type="button" className={changed ? "btn" : "btn-quiet"} disabled={!changed} onClick={save}>
              Save
            </button>
          )}
        </td>
      </tr>
      {link && (
        <tr>
          <td colSpan={9} className="px-2 pb-3">
            <LinkBox {...link} onClose={() => setLink(null)} />
          </td>
        </tr>
      )}
    </>
  );
}

export function AdminRanches({ rows }: { rows: RanchRow[] }) {
  return (
    <div>
      <NewRanch />
      <div className="card overflow-x-auto">
        <table className="m-2 text-sm">
          <thead>
            <tr className="text-xs text-slate-500">
              <th className="px-2 text-left">Ranch</th>
              <th className="px-2 text-left">Owner</th>
              <th className="px-2">Service</th>
              <th className="px-2">Testing ends</th>
              <th className="px-2">Paid through</th>
              <th className="px-2">Last sign-in</th>
              <th className="px-2">On file</th>
              <th className="px-2">Note</th>
              <th className="px-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
