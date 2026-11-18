import { prisma } from "@/lib/prisma";

/** Pages a ranch has read since the 1st of this month. */
export async function pagesThisMonth(organizationId: string): Promise<number> {
  const now = new Date();
  return prisma.paperRead.count({ where: { organizationId, createdAt: { gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) } } });
}
