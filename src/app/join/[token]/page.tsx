import { Logo } from "@/components/Logo";
import { findInvite } from "@/lib/server/invites";
import { JoinForm } from "./JoinForm";

export const dynamic = "force-dynamic";

/** The page a new ranch's owner opens from their link: set a name and password, then into their (empty) ranch. */
export default async function Join({ params }: { params: { token: string } }) {
  const inv = await findInvite(params.token);
  return (
    <div className="flex min-h-screen items-center justify-center bg-tan/40 p-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-5 flex justify-center">
          <Logo large />
        </div>
        {inv ? (
          <JoinForm token={params.token} email={inv.email} ranch={inv.organization.name} />
        ) : (
          <p className="text-sm text-slate-600">This link has expired or was already used. Ask whoever sent it for a new one - or, if you already set your password, <a href="/login" className="font-semibold text-brand-600 underline">sign in</a>.</p>
        )}
      </div>
    </div>
  );
}
