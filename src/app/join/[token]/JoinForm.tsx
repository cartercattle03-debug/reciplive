"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { post } from "@/components/ui";

export function JoinForm({ token, email, ranch }: { token: string; email: string; ranch: string }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        try {
          await post("/api/join", { token, name, password });
          await signIn("credentials", { email, password, redirect: false });
          window.location.href = "/dashboard";
        } catch (x) {
          setErr((x as Error).message);
          setBusy(false);
        }
      }}
    >
      <h1 className="mb-1 text-lg font-semibold text-slate-900">Welcome to RecipLive</h1>
      <p className="mb-4 text-sm text-slate-600">
        Set up your login for <strong>{ranch}</strong>. You&apos;ll sign in with <strong>{email}</strong>.
      </p>
      <label className="mb-1 block text-xs font-medium text-slate-600">Your name</label>
      <input className="field mb-3" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      <label className="mb-1 block text-xs font-medium text-slate-600">Password (8 or more characters)</label>
      <input className="field mb-4" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={8} />
      {err && <p className="mb-3 text-sm text-red-600">{err}</p>}
      <button className="btn w-full justify-center" disabled={busy}>
        {busy ? "Setting up..." : "Set up my login"}
      </button>
    </form>
  );
}
