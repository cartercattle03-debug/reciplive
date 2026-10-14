import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const s = await getServerSession(authOptions);
  redirect(s ? "/dashboard" : "/login");
}
