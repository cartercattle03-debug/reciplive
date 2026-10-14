"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Logo } from "@/components/Logo";
import { post } from "@/components/ui";

export default function Register() {
  const [f, setF] = useState({ ranch: "", name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="flex min-h-screen items-center justify-center bg-tan/40 p-4">
      <form
        className="card w-full max-w-sm p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr("");
          try {
            await post("/api/register", f);
            await signIn("credentials", { email: f.email, password: f.password, redirect: false });
            window.location.href = "/import";
          } catch (x) {
            setErr((x as Error).message);
            setBusy(false);
          }
        }}
      >
        <div className="mb-5 flex justify-center">
          <Logo large />
        </div>
        <p className="mb-4 text-sm text-slate-600">Make the ranch and the owner login. Customer logins are added later from Account.</p>
        {(
          [
            ["ranch", "Ranch name", "text"],
            ["name", "Your name", "text"],
            ["email", "Email", "email"],
            ["password", "Password (8+ characters)", "password"],
          ] as const
        ).map(([k, label, type]) => (
          <div key={k} className="mb-3">
            <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
            <input className="field" type={type} value={f[k]} onChange={set(k)} required={k !== "name"} />
          </div>
        ))}
        {err && <p className="mb-3 text-sm text-red-700">{err}</p>}
        <button className="btn w-full justify-center" disabled={busy}>
          {busy ? "Setting up..." : "Make the ranch"}
        </button>
      </form>
    </div>
  );
}
