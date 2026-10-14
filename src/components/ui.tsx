"use client";
import { useEffect, useState } from "react";

/** A small message in the corner. */
export function toast(msg: string, bad = false) {
  window.dispatchEvent(new CustomEvent("rl-toast", { detail: { msg, bad } }));
}
export function Toaster() {
  const [items, setItems] = useState<{ id: number; msg: string; bad: boolean }[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as { msg: string; bad: boolean };
      const id = Date.now() + Math.random();
      setItems((x) => [...x, { id, ...d }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), d.bad ? 7000 : 3500);
    };
    window.addEventListener("rl-toast", on);
    return () => window.removeEventListener("rl-toast", on);
  }, []);
  return (
    <div className="no-print fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2">
      {items.map((i) => (
        <div key={i.id} className={"rounded-lg px-4 py-2.5 text-sm shadow-lg " + (i.bad ? "bg-red-700 text-white" : "bg-brand-700 text-white")}>
          {i.msg}
        </div>
      ))}
    </div>
  );
}

/** A centered Yes / No box (never the browser's own confirm). */
export function ask(question: string, yes = "Yes", no = "Cancel"): Promise<boolean> {
  return new Promise((resolve) => window.dispatchEvent(new CustomEvent("rl-ask", { detail: { question, yes, no, resolve } })));
}
export function AskBox() {
  const [q, setQ] = useState<{ question: string; yes: string; no: string; resolve: (b: boolean) => void } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setQ((e as CustomEvent).detail);
    window.addEventListener("rl-ask", on);
    return () => window.removeEventListener("rl-ask", on);
  }, []);
  if (!q) return null;
  const done = (b: boolean) => {
    q.resolve(b);
    setQ(null);
  };
  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => done(false)}>
      <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <p className="whitespace-pre-line text-sm text-slate-800">{q.question}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-quiet" onClick={() => done(false)}>{q.no}</button>
          <button className="btn" autoFocus onClick={() => done(true)}>{q.yes}</button>
        </div>
      </div>
    </div>
  );
}

/** POST to one of RecipLive's save routes. Throws the server's own words on a refusal. */
export async function post<T = any>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // not JSON
  }
  if (!res.ok) throw new Error(data?.error || `Something went wrong (${res.status}) - nothing was saved.`);
  return data as T;
}
