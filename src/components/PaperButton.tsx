"use client";
import { useRef, useState } from "react";
import { post, toast } from "./ui";
import type { PaperKind, PaperPage } from "@/lib/paper";

/** An iPhone photo (.heic / .heif) - most browsers but Safari can't open one. */
const isHeic = (f: File) => /^image\/hei[cf]/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);
const loadScript = (src: string) =>
  new Promise<void>((ok, no) => {
    const sc = document.createElement("script");
    sc.src = src;
    sc.onload = () => ok();
    sc.onerror = () => no(new Error("no converter"));
    document.head.appendChild(sc);
  });
/** A .heic photo as a JPEG (same as HerdLive): the converter is fetched only the first time one is picked. */
async function fromHeic(file: File): Promise<File> {
  try {
    await createImageBitmap(file);
    return file;
  } catch {
    /* converted below */
  }
  try {
    const w = window as unknown as { HeicTo?: (o: { blob: Blob; type: string; quality: number }) => Promise<Blob> };
    if (!w.HeicTo) await loadScript("https://cdn.jsdelivr.net/npm/heic-to@1.5.2/dist/iife/heic-to.js");
    const blob = await w.HeicTo!({ blob: file, type: "image/jpeg", quality: 0.9 });
    if (blob?.size) return new File([blob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" });
  } catch {
    /* below */
  }
  throw new Error("This iPhone photo (.heic) couldn't be opened here - save it as a JPEG first (iPhone: Settings > Camera > Formats > Most Compatible).");
}
/** A phone photo made small enough to send (the reader works at about 1,600 px on the long side). */
async function shrink(file: File): Promise<{ data: string; type: string }> {
  const asBase64 = (b: Blob) =>
    new Promise<string>((ok, no) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ""));
      r.onerror = () => no(r.error);
      r.readAsDataURL(b);
    });
  if (file.type === "application/pdf") return { data: await asBase64(file), type: "application/pdf" };
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.9));
    if (blob) return { data: await asBase64(blob), type: "image/jpeg" };
  } catch {
    /* sent as it is */
  }
  return { data: await asBase64(file), type: file.type || "image/jpeg" };
}

/**
 * "Read paper sheet" (Carter, 2026-11-18): photos or a PDF of a handwritten transfer or preg check sheet, read page by
 * page; the rows come back to the page for review - nothing is saved here.
 */
export function PaperButton({ kind, onRead, label = "Read paper sheet" }: { kind: PaperKind; onRead: (pages: PaperPage[]) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  async function go(files: File[]) {
    const pages: PaperPage[] = [];
    for (let i = 0; i < files.length; i++) {
      setBusy(files.length > 1 ? `Reading page ${i + 1} of ${files.length}...` : "Reading the sheet...");
      try {
        let f = files[i];
        if (isHeic(f)) f = await fromHeic(f);
        const r = await post<{ page: PaperPage; used: number; cap: number | null }>("/api/paper-read", { ...(await shrink(f)), kind });
        pages.push(r.page);
        if (r.cap && r.cap - r.used <= 10) toast(`${r.cap - r.used} paper pages left this month.`);
      } catch (x) {
        toast(`${files[i].name}: ${(x as Error).message}`, true);
        if (/pages for the month|isn't switched on/.test((x as Error).message)) break;
      }
    }
    setBusy("");
    if (pages.length) onRead(pages);
  }
  return (
    <>
      <button type="button" className="btn-quiet" disabled={!!busy} onClick={() => input.current?.click()} title="A photo or PDF of a handwritten sheet - read into the lines for you to check, nothing saved until you add it">
        {busy || label}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/*,.heic,.heif,application/pdf"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) go(files);
        }}
      />
    </>
  );
}
