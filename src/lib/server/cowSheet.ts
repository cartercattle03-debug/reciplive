import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { showDate } from "@/lib/recip";

/**
 * The cow list that goes with an invoice (Carter, 2026-10-28): QuickBooks makes the invoice itself, so this PDF is the
 * reference to attach to that email - the cows on the bill with the 75+ Day page's fields. No prices; the money is on
 * the QuickBooks invoice.
 */
export type SheetCow = { batch: string; transferDate: string | null; cowId: string; mating: string; owner: string; dueDate: string | null; confirmedDate: string | null; daysPreg: number | null; delivery: string };
export type SheetInput = {
  lh: { name: string; address: string; phone: string; email: string; logo: string | null };
  number: number;
  invoiceDate: string;
  billTo: string;
  billRanch: string;
  billLocation: string;
  billEmail: string;
  cows: SheetCow[];
};

// The built-in PDF fonts only know plain Western letters - swap the rest so a stray character never breaks the file.
const plain = (s: string) =>
  String(s ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7e -ÿ]/g, "");

const BLUE = rgb(0x03 / 255, 0x69 / 255, 0xa1 / 255);
const GRAY = rgb(0.42, 0.45, 0.5);
const STRIPE = rgb(0xf1 / 255, 0xf3 / 255, 0xf5 / 255);

const COLS: { label: string; w: number; get: (c: SheetCow) => string }[] = [
  { label: "Group", w: 58, get: (c) => c.batch },
  { label: "Transfer Date", w: 70, get: (c) => showDate(c.transferDate) },
  { label: "Cow ID", w: 62, get: (c) => c.cowId },
  { label: "Mating", w: 190, get: (c) => c.mating },
  { label: "Owner", w: 80, get: (c) => c.owner },
  { label: "Due Date", w: 62, get: (c) => showDate(c.dueDate) },
  { label: "Confirmed", w: 62, get: (c) => showDate(c.confirmedDate) },
  { label: "Days Preg", w: 52, get: (c) => (c.daysPreg === null ? "" : String(c.daysPreg)) },
  { label: "Delivery Status", w: 76, get: (c) => c.delivery },
];

/** Cut a value to fit its column, with "..." when it runs over. */
function fit(t: string, f: PDFFont, size: number, w: number) {
  let s = plain(t);
  if (f.widthOfTextAtSize(s, size) <= w) return s;
  while (s.length > 1 && f.widthOfTextAtSize(s + "...", size) > w) s = s.slice(0, -1);
  return s + "...";
}

export async function cowSheetPdf(x: SheetInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(plain(`Confirmed pregnancies - invoice ${x.number}`));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 792, H = 612, M = 36; // letter, sideways
  const rowH = 17, size = 9;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const text = (s: string, xx: number, yy: number, sz = 10, f = font, color = rgb(0.07, 0.09, 0.15)) => page.drawText(plain(s), { x: xx, y: yy, size: sz, font: f, color });

  // Letterhead (logo on the left when there is one), and Bill To on the right.
  let lx = M;
  if (x.lh.logo) {
    try {
      const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(x.lh.logo);
      if (m) {
        const bytes = Buffer.from(m[2], "base64");
        const img = m[1] === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const s = Math.min(60 / img.height, 120 / img.width);
        page.drawImage(img, { x: M, y: y - img.height * s, width: img.width * s, height: img.height * s });
        lx = M + img.width * s + 12;
      }
    } catch {
      // a logo the PDF can't read is left off - the list still prints
    }
  }
  text(x.lh.name, lx, y - 14, 14, bold, BLUE);
  let ly = y - 28;
  for (const l of [...x.lh.address.split("\n"), x.lh.phone, x.lh.email].filter(Boolean)) {
    text(l, lx, ly, 9, font, GRAY);
    ly -= 11;
  }
  const rx = W - M - 220;
  text("BILL TO", rx, y - 10, 8, bold, GRAY);
  let ry = y - 24;
  for (const [i, l] of [x.billTo, x.billRanch, x.billLocation, x.billEmail].filter(Boolean).entries()) {
    text(l, rx, ry, i ? 9 : 11, i ? font : bold);
    ry -= i ? 11 : 13;
  }
  y = Math.min(ly, ry, y - 66) - 14;
  text("Confirmed Pregnancies - 75 Day", M, y, 16, bold, BLUE);
  text(`Invoice #${x.number}  ·  ${showDate(x.invoiceDate)}  ·  ${x.cows.length} cow${x.cows.length === 1 ? "" : "s"}`, M, y - 16, 10, font, GRAY);
  y -= 34;

  const head = () => {
    page.drawRectangle({ x: M, y: y - 5, width: W - 2 * M, height: rowH, color: BLUE });
    let cx = M + 4;
    for (const c of COLS) {
      text(c.label, cx, y, 8.5, bold, rgb(1, 1, 1));
      cx += c.w;
    }
    y -= rowH;
  };
  head();
  x.cows.forEach((c, i) => {
    if (y < M + 30) {
      page = doc.addPage([W, H]);
      y = H - M;
      text(`${x.lh.name} - invoice #${x.number} (continued)`, M, y, 9, font, GRAY);
      y -= 20;
      head();
    }
    if (i % 2) page.drawRectangle({ x: M, y: y - 5, width: W - 2 * M, height: rowH, color: STRIPE });
    page.drawLine({ start: { x: M, y: y - 5 }, end: { x: W - M, y: y - 5 }, thickness: 0.4, color: GRAY });
    let cx = M + 4;
    for (const col of COLS) {
      text(fit(col.get(c), col.label === "Cow ID" ? bold : font, size, col.w - 6), cx, y, size, col.label === "Cow ID" ? bold : font);
      cx += col.w;
    }
    y -= rowH;
  });
  y -= 10;
  if (y < M + 20) {
    page = doc.addPage([W, H]);
    y = H - M;
  }
  text(`${x.cows.length} confirmed pregnanc${x.cows.length === 1 ? "y" : "ies"}. Due Date = transfer date + 276 days. Your recips are on your RecipLive page to view and print any time.`, M, y, 9, font, GRAY);

  const pages = doc.getPages();
  pages.forEach((p, i) => p.drawText(`Page ${i + 1} of ${pages.length}`, { x: W - M - 60, y: M - 18, size: 8, font, color: GRAY }));
  return doc.save();
}
