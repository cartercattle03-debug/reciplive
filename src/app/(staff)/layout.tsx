import { Shell } from "@/components/Shell";
import { loadLists } from "@/lib/server/data";
import { staffPage } from "@/lib/server/session";
import { pickedYear, yearChoices } from "@/lib/server/year";

export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const member = await staffPage();
  const year = pickedYear();
  const lists = await loadLists(member.organizationId);
  return (
    <Shell member={member} year={{ year, years: yearChoices(lists, [year]) }}>
      {children}
    </Shell>
  );
}
