/** Her Cow ID as typed - exact, any case, or 54 for 054 when only one cow fits; else the IDs that contain it, to pick from. */
export function findCowId(ids: string[], q: string): { id?: string; maybe: string[] } {
  const t = q.trim().toLowerCase();
  if (!t) return { maybe: [] };
  const exact = ids.find((id) => id.toLowerCase() === t);
  if (exact) return { id: exact, maybe: [] };
  if (/^\d+$/.test(t)) {
    const z = ids.filter((id) => /^\d+$/.test(id) && id.replace(/^0+/, "") === t.replace(/^0+/, ""));
    if (z.length === 1) return { id: z[0], maybe: [] };
  }
  // Close but not her: offered to pick from, never opened on its own (348 must not pull up 348-1).
  return { maybe: ids.filter((id) => id.toLowerCase().includes(t)).slice(0, 12) };
}
