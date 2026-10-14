/** Paste rows (copied from a sheet, heading row first): which heading goes to which column. Order doesn't matter. */
export const PASTE_FIELDS: { field: string; label: string; names: string[] }[] = [
  { field: "batch", label: "Group", names: ["group", "batch", "group (transfer date)"] },
  { field: "cowId", label: "Cow ID", names: ["cow id", "cow", "id", "recip", "recip id", "tag"] },
  { field: "mating", label: "Mating", names: ["mating", "embryo", "cross"] },
  { field: "owner", label: "Owner", names: ["owner", "customer"] },
  { field: "embryoType", label: "Embryo Type", names: ["embryo type", "type", "fresh/frozen"] },
  { field: "grade", label: "Grade", names: ["grade", "stage/grade", "stage"] },
  { field: "company", label: "Company", names: ["company", "et company", "lab"] },
  { field: "status", label: "Status", names: ["status", "result"] },
  { field: "deliveryStatus", label: "Delivery Status", names: ["delivery status", "delivery"] },
  { field: "notes", label: "Notes", names: ["notes", "note", "comments"] },
];

export function matchHeading(h: string): string | null {
  const n = h.trim().toLowerCase().replace(/\s+/g, " ");
  if (!n) return null;
  for (const f of PASTE_FIELDS) if (f.names.includes(n)) return f.field;
  return null;
}

/** Tab-separated text (what a copy from Sheets / Excel gives) into rows of cells. */
export function splitPaste(text: string): string[][] {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => l.split("\t").map((c) => c.trim()));
}
