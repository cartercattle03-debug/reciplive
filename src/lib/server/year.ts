import { cookies } from "next/headers";
import { ranchToday } from "@/lib/recip";
import type { Lists } from "./data";

export const thisYear = () => Number(ranchToday().slice(0, 4));

/** The year picked in the Year box at the top (kept on this device); this year until one is picked. */
export function pickedYear(): number {
  const v = Number(cookies().get("rl_year")?.value);
  return Number.isInteger(v) && v > 2000 && v < 2200 ? v : thisYear();
}

/** Years to offer: every year with a batch, this year, and next year (so a new year can be started). */
export function yearChoices(lists: Lists, extra: number[] = []): number[] {
  const ys = new Set<number>([thisYear(), thisYear() + 1, ...extra]);
  for (const b of lists.batches) if (b.transferDate) ys.add(Number(b.transferDate.slice(0, 4)));
  return [...ys].sort((a, b) => a - b);
}
