"use client";
import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Logo } from "@/components/Logo";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex min-h-screen items-center justify-center bg-tan/40 p-4">
      <form
        className="card w-full max-w-sm p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr("");
          const r = await signIn("credentials", { email, password, redirect: false });
          setBusy(false);
          if (r?.error) setErr(r.error === "locked" ? "Too many tries - wait a minute and try again." : "Email or password isn't right.");
          else window.location.href = "/";
        }}
      >
        <div className="mb-6 flex justify-center">
          <Logo large />
        </div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
        <input className="field mb-3" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className="mb-1 block text-xs font-medium text-slate-600">Password</label>
        <input className="field mb-4" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <p className="mb-3 text-sm text-red-700">{err}</p>}
        <button className="btn w-full justify-center" disabled={busy}>
          {busy ? "Logging in..." : "Log in"}
        </button>
        <p className="mt-4 text-center text-xs text-slate-500">
          Setting up RecipLive for the first time? <Link className="text-brand-600 underline" href="/register">Make the ranch login</Link>
        </p>
      </form>
    </div>
  );
}
