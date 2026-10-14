"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { post, toast } from "./ui";

export type LH = { name: string; address: string; phone: string; email: string; logo: string | null };

/** Shrinks a picture in the browser to at most 600 x 300 so it stays small and prints sharp. */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => bad(new Error("That file isn't a picture we can read - try a PNG or JPG."));
      i.src = url;
    });
    const k = Math.min(1, 600 / img.width, 300 / img.height);
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The invoice header: logo, business name, address, phone, email. Saves as you go; prints on every invoice. */
export function LetterheadForm({ lh }: { lh: LH }) {
  const router = useRouter();
  const [logo, setLogo] = useState(lh.logo);
  const save = async (body: Record<string, unknown>, ok = "Saved.") => {
    try {
      await post("/api/billing", { action: "letterhead", ...body });
      toast(ok);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const box = (k: keyof LH, label: string, w = "w-64") => (
    <label className="text-xs font-medium text-slate-600">
      {label}
      <input className={"field mt-0.5 " + w} defaultValue={String(lh[k] ?? "")} onBlur={(e) => e.target.value !== String(lh[k] ?? "") && save({ [k]: e.target.value })} />
    </label>
  );
  return (
    <div className="card edit-only mb-5 p-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Invoice header - prints at the top of every invoice</span>
      <div className="mt-2 flex flex-wrap items-start gap-4">
        <div className="flex flex-col items-start gap-1.5">
          <div className="flex h-24 w-48 items-center justify-center rounded border border-dashed border-slate-300 bg-white">
            {logo ? <img src={logo} alt="Logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-slate-400">No logo yet</span>}
          </div>
          <label className="btn-quiet cursor-pointer">
            {logo ? "Change logo" : "Upload logo"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const d = await shrink(f);
                  setLogo(d);
                  await save({ logo: d }, "Logo saved.");
                } catch (x) {
                  toast((x as Error).message, true);
                }
              }}
            />
          </label>
          {logo && (
            <button className="text-xs text-red-700 hover:underline" onClick={() => (setLogo(null), save({ logo: "" }, "Logo taken off."))}>
              Remove logo
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          {box("name", "Business name")}
          <label className="text-xs font-medium text-slate-600">
            Address (one line per row)
            <textarea className="field mt-0.5 h-20 w-64" defaultValue={lh.address} onBlur={(e) => e.target.value !== lh.address && save({ address: e.target.value })} placeholder={"PO Box 123\nStratford, OK 74872"} />
          </label>
          <div className="flex flex-col gap-3">
            {box("phone", "Phone", "w-48")}
            {box("email", "Email", "w-64")}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The header as it shows and prints on an invoice. */
export function LetterheadView({ lh }: { lh: LH }) {
  return (
    <div className="flex items-start gap-4">
      {lh.logo && <img src={lh.logo} alt="" className="max-h-24 max-w-[220px] object-contain" />}
      <div className="text-sm leading-snug text-slate-700">
        <div className="text-lg font-bold text-slate-900">{lh.name}</div>
        {lh.address.split("\n").filter(Boolean).map((l, i) => (
          <div key={i}>{l}</div>
        ))}
        {lh.phone && <div>{lh.phone}</div>}
        {lh.email && <div>{lh.email}</div>}
      </div>
    </div>
  );
}
