import { Shell } from "@/components/Shell";
import { staffPage } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const member = await staffPage();
  return <Shell member={member}>{children}</Shell>;
}
