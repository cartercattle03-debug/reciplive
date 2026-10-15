"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ask, post, toast } from "./ui";
import { showDate } from "@/lib/recip";
import { LetterheadView, type LH } from "./LetterheadForm";

export type BillingSet = { price: number | null; item: string; adjustItem: string; terms: number; nextNo: number };

/** Price, QuickBooks item names, terms, next invoice number. Each saves when you leave the box. */
export function BillingSettingsForm({ s }: { s: BillingSet }) {
  const router = useRouter();
  const save = async (k: string, v: string) => {
    try {
      await post("/api/billing", { action: "settings", [k]: v });
      toast("Saved.");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const box = (k: keyof BillingSet, label: string, w: string, hint?: string, value?: string) => (
    <label className="text-xs font-medium text-slate-600" title={hint}>
      {label}
      <input className={"field mt-0.5 " + w} defaultValue={value ?? String(s[k] ?? "")} onBlur={(e) => e.target.value !== (value ?? String(s[k] ?? "")) && save(k, e.target.value)} />
    </label>
  );
  return (
    <div className="card edit-only mb-5 flex flex-wrap items-end gap-3 p-3">
      <span className="w-full text-xs font-semibold uppercase tracking-wide text-slate-500">Billing settings</span>
      {box("price", "Price per confirmed pregnancy ($)", "w-40", "Starts every new invoice - change it on any invoice before exporting", s.price === null ? "" : s.price.toFixed(2))}
      {box("item", "QuickBooks Product/Service", "w-48", "Must match a Product/Service name in QuickBooks Online")}
      {box("adjustItem", "Adjustment Product/Service", "w-44", "What adjustment lines bill as in QuickBooks")}
      <label className="text-xs font-medium text-slate-600">
        Terms
        <select className="field mt-0.5 w-40" defaultValue={String(s.terms)} onChange={(e) => save("terms", e.target.value)}>
          <option value="0">Due on Receipt</option>
          {[10, 15, 30, 45, 60].map((d) => (
            <option key={d} value={d}>
              Net {d}
            </option>
          ))}
        </select>
      </label>
      {box("nextNo", "Next invoice #", "w-28", "Set it to follow your QuickBooks numbers")}
      <p className="w-full text-xs text-slate-500">The two Product/Service names have to match items already set up in QuickBooks Online (Sales → Products and services), and each owner's name has to match their customer name there - you can change Bill To on any invoice.</p>
    </div>
  );
}

type Line = { id: string; kind: string; description: string; cowId: string; batch: string; transferDate: string | null; mating: string; dueDate: string | null; confirmedDate: string | null; daysPreg: number | null; amount: number; /** How she reads now, if her record changed since this invoice was built. */ changed?: string | null };
export type InvoiceView = { id: string; number: number; owner: string; billTo: string; billRanch: string; billLocation: string; billEmail: string; invoiceDate: string; dueDate: string; price: number; memo: string; status: string; exported: string | null; lines: Line[] };

const $ = (n: number) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The invoice, editable until it's voided: price for every line at once, any line's amount, adjustments. */
export function InvoiceEditor({ inv, lh, canEdit }: { inv: InvoiceView; lh: LH; canEdit: boolean }) {
  const router = useRouter();
  const [price, setPrice] = useState(inv.price.toFixed(2));
  const [adj, setAdj] = useState({ description: "", amount: "" });
  const [busy, setBusy] = useState(false);
  // A Void invoice, or a view-only login, shows it plainly with nothing to change.
  const live = inv.status !== "Void" && canEdit;
  const run = async (body: Record<string, unknown>, ok?: string) => {
    setBusy(true);
    try {
      await post("/api/billing", body);
      if (ok) toast(ok);
      router.refresh();
      return true;
    } catch (e) {
      toast((e as Error).message, true);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const total = inv.lines.reduce((s, l) => s + l.amount, 0);
  const preg = inv.lines.filter((l) => l.kind === "Pregnancy");
  const field = (k: "billTo" | "billRanch" | "billLocation" | "billEmail" | "memo" | "invoiceDate" | "dueDate", type = "text", w = "w-48", ph?: string) => (
    <input
      type={type}
      placeholder={live ? ph : undefined}
      className={"field " + w}
      defaultValue={inv[k]}
      disabled={!live}
      onBlur={(e) => e.target.value !== inv[k] && run({ action: "update", id: inv.id, [k]: e.target.value }, "Saved.")}
    />
  );
  return (
    <div>
      {inv.status === "Void" && <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800">VOID - kept on file; its cows are back on Ready to bill.</div>}
      {inv.status !== "Void" && inv.lines.some((l) => l.changed) && (
        <div className="no-print mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900">
          <b>{inv.lines.filter((l) => l.changed).length} cow(s) on this invoice have changed since it was built</b> - marked in red below. The invoice keeps them as they were billed;
          the customer&apos;s own page counts them as they are now. Take a line off with its ✕ (or add a credit) if she shouldn&apos;t be billed.
        </div>
      )}
      {inv.exported && inv.status !== "Void" && <div className="no-print mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">Sent to QuickBooks {inv.exported}. If you change it now, download it again and fix the invoice in QuickBooks to match.</div>}
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        {live && (
          <a className="btn-go edit-only" href={`/api/billing/export?id=${inv.id}`} onClick={() => setTimeout(() => router.refresh(), 1500)}>
            Download for QuickBooks
          </a>
        )}
        <button className="btn-quiet edit-only" onClick={() => window.print()}>
          Print / Save PDF
        </button>
        <a className="btn-quiet" href="/billing">
          Back to Billing
        </a>
        {live && (
          <button className="btn-danger edit-only ml-auto" disabled={busy} onClick={async () => (await ask(`Void invoice #${inv.number}?\n\nIt stays on file with its number, and its ${preg.length} cow(s) go back on Ready to bill. If it's already in QuickBooks, void it there too.`, "Void it")) && run({ action: "void", id: inv.id }, "Voided.")}>
            Void invoice
          </button>
        )}
      </div>

      <div className="card p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b-2 border-brand-600 pb-4">
          <LetterheadView lh={lh} />
          <div className="text-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Bill To</div>
            <div className="no-print flex flex-col gap-1">
              {field("billTo", "text", "w-56", "QuickBooks customer name")}
              {field("billRanch", "text", "w-56", "Ranch name")}
              {field("billLocation", "text", "w-56", "Town, State")}
              {field("billEmail", "email", "w-56", "Email address")}
              {live && <span className="edit-only text-xs text-slate-500">Set an owner&apos;s info once on Lists → Owners.</span>}
            </div>
            <div className="print-only leading-snug">
              <div className="font-semibold">{inv.billTo}</div>
              {inv.billRanch && <div>{inv.billRanch}</div>}
              {inv.billLocation && <div>{inv.billLocation}</div>}
              {inv.billEmail && <div>{inv.billEmail}</div>}
            </div>
          </div>
          <div className="grid grid-cols-[auto_auto] items-center gap-x-3 gap-y-1.5 text-sm">
            <span className="col-span-2 mb-1 text-right text-2xl font-bold text-brand-700">INVOICE #{inv.number}</span>
            <span className="text-slate-500">Invoice Date</span>
            <span className="no-print">{field("invoiceDate", "date", "w-40")}</span>
            <span className="print-only">{showDate(inv.invoiceDate)}</span>
            <span className="text-slate-500">Terms</span>
            <span className="font-semibold">{inv.invoiceDate === inv.dueDate ? "Due on Receipt" : `Due ${showDate(inv.dueDate)}`}</span>
            <span className="text-slate-500">Payment Due</span>
            <span className="no-print">{field("dueDate", "date", "w-40")}</span>
            <span className="print-only">{showDate(inv.dueDate)}</span>
          </div>
        </div>

        {live && (
          <div className="no-print edit-only mb-4 flex flex-wrap items-end gap-2 rounded-md bg-slate-50 p-3">
            <label className="text-xs font-medium text-slate-600">
              Price per pregnancy ($)
              <input className="field mt-0.5 w-32" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            </label>
            <button className="btn" disabled={busy} onClick={() => run({ action: "update", id: inv.id, price, applyAll: true }, `Every pregnancy line is now $${Number(price || 0).toFixed(2)}.`)}>
              Use on every pregnancy line
            </button>
            <span className="text-xs text-slate-500">Or change any one line&apos;s amount in the table.</span>
          </div>
        )}

        <table className="keep-width w-full text-sm">
          <thead>
            <tr className="bg-brand-600 text-xs text-white">
              {["Transfer Date", "Cow ID", "Mating", "Due Date", "Date Confirmed", "Days Pregnant", "Amount", ""].map((h) => (
                <th key={h} className="px-2 py-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l) =>
              l.kind === "Adjustment" ? (
                <tr key={l.id}>
                  <td className="tc" colSpan={6}>
                    {live ? (
                      <input className="field no-print w-full max-w-md" defaultValue={l.description} onBlur={(e) => e.target.value !== l.description && run({ action: "line", lineId: l.id, description: e.target.value })} />
                    ) : null}
                    <span className={live ? "print-only" : ""}>{l.description}</span>
                  </td>
                  <td className="tc">
                    {live ? <input className="field no-print w-28 text-right" defaultValue={l.amount.toFixed(2)} onBlur={(e) => Number(e.target.value) !== l.amount && run({ action: "line", lineId: l.id, amount: e.target.value }, "Amount saved.")} /> : null}
                    <span className={live ? "print-only" : ""}>{$(l.amount)}</span>
                  </td>
                  <td className="tc">{live && <button className="edit-only no-print text-lg font-bold text-red-600" title="Take this line off" onClick={() => run({ action: "removeLine", lineId: l.id })}>✕</button>}</td>
                </tr>
              ) : (
                <tr key={l.id}>
                  <td className="tc">{showDate(l.transferDate)}</td>
                  <td className="tc font-bold">
                    {l.cowId}
                    {l.changed && <div className="no-print text-xs font-semibold text-red-700">{l.changed}</div>}
                  </td>
                  <td className="tc">{l.mating}</td>
                  <td className="tc">{showDate(l.dueDate)}</td>
                  <td className="tc">
                    {live ? <input type="date" className="field no-print w-40" defaultValue={l.confirmedDate ?? ""} onChange={(e) => run({ action: "line", lineId: l.id, confirmedDate: e.target.value })} /> : null}
                    <span className={live ? "print-only" : ""}>{showDate(l.confirmedDate)}</span>
                  </td>
                  <td className="tc">{l.daysPreg ?? ""}</td>
                  <td className="tc">
                    {live ? <input className="field no-print w-28 text-right" defaultValue={l.amount.toFixed(2)} onBlur={(e) => Number(e.target.value) !== l.amount && run({ action: "line", lineId: l.id, amount: e.target.value }, "Amount saved.")} /> : null}
                    <span className={live ? "print-only" : ""}>{$(l.amount)}</span>
                  </td>
                  <td className="tc">
                    {live && (
                      <button className="edit-only no-print text-lg font-bold text-red-600" title="Take her off this invoice (she goes back on Ready to bill)" onClick={async () => (await ask(`Take cow ${l.cowId} off invoice #${inv.number}? She goes back on Ready to bill.`, "Take her off")) && run({ action: "removeLine", lineId: l.id })}>
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              )
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-brand-600">
              <td className="px-2 py-2 text-right font-semibold" colSpan={6}>
                {preg.length} confirmed pregnanc{preg.length === 1 ? "y" : "ies"} · Total
              </td>
              <td className="px-2 py-2 text-center text-base font-bold">{$(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        {live && (
          <form
            className="no-print edit-only mt-4 flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run({ action: "adjust", id: inv.id, ...adj }, "Adjustment added.")) setAdj({ description: "", amount: "" });
            }}
          >
            <span className="w-full text-xs font-semibold uppercase tracking-wide text-slate-500">Add an adjustment</span>
            <input className="field w-72" placeholder="What it's for (e.g. Volume discount, Extra check)" value={adj.description} onChange={(e) => setAdj({ ...adj, description: e.target.value })} />
            <input className="field w-32" inputMode="decimal" placeholder="-50.00" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} />
            <button className="btn" disabled={busy}>
              Add
            </button>
            <span className="text-xs text-slate-500">A minus amount is a discount or credit; a plus amount is an extra charge.</span>
          </form>
        )}
        <div className="mt-4 text-sm">
          <span className="text-slate-500">Memo: </span>
          <span className="no-print">{field("memo", "text", "w-96")}</span>
          <span className="print-only">{inv.memo}</span>
        </div>
      </div>
    </div>
  );
}
