import type { Calc } from "./recip";

/**
 * Recip Rating, 1 to 5 in half stars (Carter, 2026-10-15) - for the cull call on cows still on hand (a Safe cow goes to
 * her new owner at 75 days, so the scale is set for the open list): 5 = as good as a fresh recip, 1 = cull.
 * Built only from what is already recorded:
 *
 *   - Each finished transfer is weighed against how that embryo normally does (the ranch's own Safe rate for that
 *     company + embryo type + grade). A Safe on a weak embryo lifts her more; an Open on a strong embryo costs her more.
 *   - A Probable she lost: if the others transferred that day from the same company and type mostly held, it's on her -
 *     a full Open. If loss was common that day (1 in 4 or more of them lost), it's the process - counted at half.
 *     A second loss is always a full Open plus a knock (repeat offender).
 *   - Passes don't count: the data shows a cow with passes takes as well as one without.
 *   - Every result counts in full - nothing is averaged away, so a third Open sinks her further than a second
 *     (Carter, 2026-10-15: 6311, three Opens and never caught, sat only half a star under 6310 when results were averaged).
 *
 * Tested on the 2026 season (rating before her next transfer vs whether it took): each step down took less often.
 */
export type RatingStep = { batch: string; text: string; effect: "up" | "down" | "light" | "none" };
export type Rating = { stars: number; score: number; tries: number; steps: RatingStep[]; cull: boolean };

const REPEAT_LOSS = 0.15;
const PROCESS_SHARE = 0.25; // this share or more of her peers lost too = the process, not her
// Points per star (one Open on an average embryo is about 0.4 points). Picked on the 2026 season so each step down took
// less often on her next transfer: 5 = 56%, 4 = 33%, 3½ = 27%, 3 = 25%, 2½ = 17%, 2 and under 0 of 2.
const STEP = 0.4;
/** At or under this, she's flagged a cull candidate: about 1 in 6 or worse on her next transfer (2026). */
export const CULL_AT = 2.5;

const finished = (c: Calc) => c.outcome === "Safe" || c.outcome === "Open";
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** How each embryo kind normally does, from every finished transfer on the ranch. */
export function embryoOdds(calc: Calc[]) {
  const done = calc.filter(finished);
  const safeRate = (l: Calc[]) => l.filter((c) => c.outcome === "Safe").length / l.length;
  const herd = done.length ? safeRate(done) : 0.4;
  const groups: { key: (c: Calc) => string; min: number; map: Map<string, Calc[]> }[] = [
    { key: (c) => (c.company && c.embryoType && c.grade ? `${c.company}|${c.embryoType}|${c.grade}` : ""), min: 15, map: new Map() },
    { key: (c) => (c.company && c.embryoType ? `${c.company}|${c.embryoType}` : ""), min: 20, map: new Map() },
    { key: (c) => c.embryoType || "", min: 30, map: new Map() },
  ];
  for (const c of done)
    for (const g of groups) {
      const k = g.key(c);
      if (!k) continue;
      if (!g.map.has(k)) g.map.set(k, []);
      g.map.get(k)!.push(c);
    }
  return (c: Calc) => {
    for (const g of groups) {
      const l = g.map.get(g.key(c));
      if (g.key(c) && l && l.length >= g.min) return Math.min(0.65, Math.max(0.2, safeRate(l)));
    }
    return Math.min(0.65, Math.max(0.2, herd));
  };
}

/** Every cow's rating, keyed by Cow ID. Pass the whole ranch (every year) - a cow's history is lifetime. */
export function recipRatings(calc: Calc[]): Map<string, Rating> {
  const odds = embryoOdds(calc);
  // Peers for a lost Probable: same group, company and embryo type, checked Probable, with a final answer.
  const peerKey = (c: Calc) => `${c.batch}|${c.company}|${c.embryoType}`;
  const peers = new Map<string, Calc[]>();
  for (const c of calc)
    if (c.wasProbable && finished(c)) {
      const k = peerKey(c);
      if (!peers.has(k)) peers.set(k, []);
      peers.get(k)!.push(c);
    }
  const byCow = new Map<string, Calc[]>();
  for (const c of calc) {
    if (!c.cowId) continue;
    if (!byCow.has(c.cowId)) byCow.set(c.cowId, []);
    byCow.get(c.cowId)!.push(c);
  }
  const out = new Map<string, Rating>();
  for (const [cow, recs] of byCow) {
    let pts = 0;
    let tries = 0;
    let losses = 0;
    const steps: RatingStep[] = [];
    const ord = (c: Calc) => (c.batch ? c.batchOrder : Number.MAX_SAFE_INTEGER);
    for (const c of [...recs].sort((a, b) => ord(a) - ord(b) || a.seq - b.seq)) {
      const what = [c.company, c.embryoType, c.grade].filter(Boolean).join(" ") || "embryo not recorded";
      if (c.outcome === "Pass") {
        steps.push({ batch: c.batch, text: "Pass - doesn't count", effect: "none" });
        continue;
      }
      if (!finished(c)) continue;
      tries++;
      const e = odds(c);
      const strength = e >= 0.45 ? "strong" : e < 0.35 ? "weak" : "average";
      if (c.outcome === "Safe") {
        pts += 1 - e;
        steps.push({ batch: c.batch, text: `Safe on ${what} (${strength} embryo, ~${pct(e)})`, effect: "up" });
      } else if (!c.wasProbable) {
        pts -= e;
        steps.push({ batch: c.batch, text: `Open on ${what} (${strength} embryo, ~${pct(e)})`, effect: "down" });
      } else {
        losses++;
        const others = (peers.get(peerKey(c)) ?? []).filter((x) => x.id !== c.id);
        const lostToo = others.filter((x) => x.outcome === "Open").length;
        const process = losses === 1 && others.length >= 4 && lostToo / others.length >= PROCESS_SHARE;
        if (losses > 1) {
          pts -= e + REPEAT_LOSS;
          steps.push({ batch: c.batch, text: `Lost a Probable again on ${what} - repeat offender`, effect: "down" });
        } else if (process) {
          pts -= e / 2;
          steps.push({ batch: c.batch, text: `Lost a Probable on ${what} - ${lostToo} of ${others.length} others that day lost too (process), counted at half`, effect: "light" });
        } else {
          pts -= e;
          steps.push({ batch: c.batch, text: `Lost a Probable on ${what} - ${others.length ? `only ${lostToo} of ${others.length} others that day lost` : "others held"} (on her), counts as an Open`, effect: "down" });
        }
      }
    }
    const score = pts;
    const stars = Math.max(1, Math.min(5, Math.round((5 + score / STEP) * 2) / 2));
    out.set(cow, { stars, score, tries, steps, cull: tries > 0 && stars <= CULL_AT });
  }
  return out;
}

/** ★★★½ for 3.5 - full stars, a half, then empty to five. */
export function starText(n: number) {
  const full = Math.floor(n);
  const half = n - full >= 0.5;
  return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(5 - full - (half ? 1 : 0));
}
