declare module "next" {
  export type Metadata = { title?: string; description?: string; [k: string]: any };
  export type Viewport = { width?: string; initialScale?: number; [k: string]: any };
}
declare module "next/link" {
  import * as React from "react";
  const Link: React.FC<React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean; children?: React.ReactNode }>;
  export default Link;
}
declare module "next/navigation" {
  export function useRouter(): { push(href: string): void; refresh(): void; replace(href: string): void; back(): void };
  export function usePathname(): string | null;
  export function redirect(url: string): never;
  export function notFound(): never;
}
declare module "next/server" {
  export class NextResponse extends Response {
    static json(body: any, init?: { status?: number; headers?: any }): NextResponse;
  }
}
declare module "next-auth" {
  export type AuthOptions = {
    session?: any; pages?: any; providers: any[];
    callbacks?: { jwt?: (p: { token: any; user?: any }) => any; session?: (p: { session: any; token: any }) => any };
  };
  export function getServerSession(opts: AuthOptions): Promise<{ user?: { name?: string | null; email?: string | null } } | null>;
  export default function NextAuth(opts: AuthOptions): any;
}
declare module "next-auth/react" {
  export function signIn(provider: string, opts?: any): Promise<{ error?: string | null; ok?: boolean } | undefined>;
  export function signOut(opts?: any): Promise<void>;
}
declare module "next-auth/providers/credentials" {
  export default function CredentialsProvider(opts: {
    name: string; credentials: any;
    authorize: (credentials: Record<string, string> | undefined, req?: any) => any;
  }): any;
}
declare module "bcryptjs" {
  export function hash(s: string, rounds: number): Promise<string>;
  export function compare(s: string, h: string): Promise<boolean>;
  const _default: { hash: typeof hash; compare: typeof compare };
  export default _default;
}
declare module "zod" { export const z: any; }
declare module "stripe" {
  namespace Stripe { type Event = any; namespace Checkout { type Session = any } type Subscription = any; }
  class Stripe { constructor(key: string, opts?: any); customers: any; checkout: any; webhooks: any; }
  export default Stripe;
}
declare module "xlsx" {
  export function read(data: any, opts?: any): { SheetNames: string[]; Sheets: Record<string, any> };
  export const utils: { decode_range(r: string): { s: { r: number; c: number }; e: { r: number; c: number } }; encode_cell(c: { r: number; c: number }): string };
  export const SSF: { is_date(z: any): boolean; parse_date_code(v: number): { y: number; m: number; d: number } | null };
}
declare module "*.css";
