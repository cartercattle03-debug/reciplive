/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Read a paper sheet (Carter, 2026-11-18 - "the pdf reader the other programs have"): one photo or PDF of a transfer
 * or preg check sheet goes to Claude (Anthropic's API - ANTHROPIC_API_KEY in this site's settings), which copies it into
 * rows. Nothing is decided or saved here: the rows go to the screen, where the owner checks them before anything is added.
 */
import { PAPER_FIELDS, type PaperField, type PaperKind, type PaperPage } from "@/lib/paper";

const MODEL = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
/** Dollars per million tokens (input, output), for the cost kept on each read. */
const PRICES: Record<string, [number, number]> = { "claude-sonnet-5-5": [2, 10], "claude-opus-5-5": [4, 20], "claude-haiku-5-5": [0.1, 0.5] };

const FIELD_HELP: Record<PaperField, string> = {
  cowId: "the recipient cow's ID / tag (\"Recip\", \"Cow\", \"Tag\", \"ID\")",
  group: "transfer group / batch label if written per row",
  mating: "the mating as written when it is one column (\"Sire x Donor\", \"Mating\", \"Embryo\")",
  sire: "embryo sire when it has its own column",
  donor: "embryo donor (dam) when it has its own column",
  owner: "embryo / pregnancy owner, customer, client",
  company: "embryo company / ET company / lab",
  embryoType: "Fresh or Frozen (F/FZ/Frz = Frozen, Fr/Fresh = Fresh) as written",
  grade: "embryo grade or stage/grade as written (1, 2, 1-7, 4/1) - keep it as text, never a date",
  status: "on a transfer sheet: PASS / no transfer / culled as written, else empty",
  result: "on a preg check sheet: the result as written (P, Prob, Open, O, Safe, +, -)",
  checkDate: "preg check date when written per row",
  notes: "any comment on the row as written",
};

const TOOL = {
  name: "record_sheet",
  description: "Record exactly what is on this recip transfer or preg check sheet.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "The page's title or heading as written. Blank if none." },
      header: {
        type: "object",
        description: "Filled-in blanks above or around the table. Empty string when not written.",
        properties: { transferDate: { type: "string" }, group: { type: "string" }, owner: { type: "string" }, company: { type: "string" }, checkDate: { type: "string" } },
        required: ["transferDate", "group", "owner", "company", "checkDate"],
      },
      rows: {
        type: "array",
        description: "Every row with anything in it, top to bottom, including rows written in by hand below the printed table. Skip empty rows.",
        items: {
          type: "object",
          properties: {
            ...Object.fromEntries(PAPER_FIELDS.map((f) => [f, { type: "string", description: FIELD_HELP[f] }])),
            unsure: { type: "array", items: { type: "string", enum: [...PAPER_FIELDS] }, description: "Fields whose reading you are not sure of." },
            why: { type: "string", description: "A short reason for anything unsure or unusual on the row (\"could be 6311\", \"written over\")." },
            struck: { type: "boolean", description: "The whole row is crossed out." },
          },
          required: ["cowId"],
        },
      },
      lists: {
        type: "array",
        description: "Cow IDs listed outside the table with their label (\"PASS: 37, 6314\", \"No CL: 59\").",
        items: { type: "object", properties: { label: { type: "string" }, ids: { type: "array", items: { type: "string" } } }, required: ["label", "ids"] },
      },
      remarks: { type: "string", description: "Anything the rancher should know about the page in one or two plain sentences. Blank if nothing." },
    },
    required: ["title", "header", "rows", "lists", "remarks"],
  },
};

const PROMPT = `You are reading a cattle rancher's paper embryo transfer (recip) record into RecipLive, his recip records program. A page is either a TRANSFER sheet (which recip got which embryo on a transfer day) or a PREG CHECK sheet (each recip's pregnancy result). It may be printed, handwritten, or both. Copy it into the record_sheet tool exactly.

Rules - these matter more than anything else:
- Copy what is written. Never guess, never fill in what isn't there, never correct a value.
- Cow IDs exactly as written: keep leading zeros (054 is not 54), letters and dashes. Never drop or add a character.
- When you are not sure of a cell, give your best reading AND list its field in "unsure", with a short "why".
- Ditto marks, arrows or lines down a column mean "same as the row above": write the value from above, not the mark.
- A value crossed out and rewritten: give the final value. A row crossed out entirely: struck = true.
- Dates exactly as written. Do not add a year that isn't written. Grades and group labels stay text ("7-1", "1-2") - never turn them into dates.
- Each field: ${PAPER_FIELDS.map((f) => `${f} = ${FIELD_HELP[f]}`).join("; ")}.
- A sheet with one column "Sire x Donor" or "Embryo": that goes in mating. Separate Sire and Donor columns go in sire and donor.
- Ignore drawings, tally marks and anything that isn't part of the records.`;

/** Reads one page. `media` is the image or PDF as base64; throws with a plain message on any failure. */
export async function readSheet(media: { data: string; type: string }, kind: PaperKind): Promise<{ page: PaperPage; cents: number }> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error("Reading paper sheets isn't switched on yet - the Anthropic API key isn't in this site's settings.");
  const model = MODEL();
  const block =
    media.type === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: media.data } }
      : { type: "image", source: { type: "base64", media_type: media.type, data: media.data } };
  const say = kind === "preg" ? "This is a PREG CHECK sheet." : "This is a TRANSFER sheet.";
  let inTok = 0;
  let outTok = 0;
  let use: any = null;
  for (const nudge of ["", " Your last answer was not the tool call. Call the tool now with what the page shows."]) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        max_tokens: 16000,
        system: PROMPT,
        tools: [TOOL],
        tool_choice: { type: "auto" },
        messages: [{ role: "user", content: [block, { type: "text", text: `${say} Read it and answer only by calling the ${TOOL.name} tool - no other reply.${nudge}` }] }],
      }),
    }).catch((e: Error) => {
      throw new Error(`The reader couldn't be reached (${e.message}). Try again in a minute.`);
    });
    const body = (await res.json().catch(() => null)) as any;
    if (!res.ok) {
      if (res.status === 401) throw new Error("The reader turned the API key down - check ANTHROPIC_API_KEY in this site's settings.");
      if (res.status === 429 || res.status === 529) throw new Error("The reader is busy right now - try this page again in a minute.");
      throw new Error(`The reader couldn't read this page: ${body?.error?.message ?? `error ${res.status}`}`);
    }
    inTok += Number(body?.usage?.input_tokens ?? 0);
    outTok += Number(body?.usage?.output_tokens ?? 0);
    use = (body?.content ?? []).find((b: any) => b.type === "tool_use" && b.name === TOOL.name);
    if (use?.input) break;
    if (body?.stop_reason === "max_tokens") throw new Error("This page has more on it than the reader can copy in one go - photograph it in two halves.");
  }
  if (!use?.input) throw new Error("The reader didn't send the rows back - try the photo again.");
  const [pi, po] = PRICES[model] ?? PRICES["claude-sonnet-5-5"];
  return { page: tidy(use.input), cents: Math.round(((inTok * pi + outTok * po) / 1e6) * 1000) / 10 };
}

/** The reader's answer, made safe: every field a string, unsure only known fields. */
export function tidy(raw: any): PaperPage {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : v === null || v === undefined ? "" : String(v).trim());
  const h = raw?.header ?? {};
  return {
    title: s(raw?.title),
    header: { transferDate: s(h.transferDate), group: s(h.group), owner: s(h.owner), company: s(h.company), checkDate: s(h.checkDate) },
    rows: (Array.isArray(raw?.rows) ? raw.rows : [])
      .map((r: any) => ({
        ...(Object.fromEntries(PAPER_FIELDS.map((f) => [f, s(r?.[f])])) as Record<PaperField, string>),
        unsure: (Array.isArray(r?.unsure) ? r.unsure : []).map(s).filter((f: string) => (PAPER_FIELDS as readonly string[]).includes(f)) as PaperField[],
        why: s(r?.why),
        struck: !!r?.struck,
      }))
      .filter((r: any) => PAPER_FIELDS.some((f) => r[f])),
    lists: (Array.isArray(raw?.lists) ? raw.lists : []).map((l: any) => ({ label: s(l?.label), ids: (Array.isArray(l?.ids) ? l.ids : []).map(s).filter(Boolean) })).filter((l: any) => l.ids.length),
    remarks: s(raw?.remarks),
  };
}
