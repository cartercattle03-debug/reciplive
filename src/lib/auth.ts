import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

/** Missed passwords per email: after 5 in 10 minutes the door stays shut for a minute. */
const misses = new Map<string, number[]>();
function tooMany(email: string) {
  const now = Date.now();
  const list = (misses.get(email) ?? []).filter((t) => now - t < 10 * 60_000);
  misses.set(email, list);
  return list.length >= 5 && now - list[list.length - 1] < 60_000;
}

export const authOptions: AuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = credentials.email.trim().toLowerCase();
        if (tooMany(email)) throw new Error("locked");
        const user = await prisma.user.findUnique({ where: { email } });
        const ok = !!user && (await bcrypt.compare(credentials.password, user.passwordHash));
        if (!user || !ok) {
          misses.set(email, [...(misses.get(email) ?? []), Date.now()]);
          return null;
        }
        misses.delete(email);
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), loginCount: { increment: 1 } } }).catch(() => null);
        return { id: user.id, email: user.email, name: user.name } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.userId = (user as { id: string }).id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) (session.user as { id?: string }).id = token.userId as string;
      return session;
    },
  },
};
