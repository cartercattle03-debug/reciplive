import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RecipLive",
  description: "RecipLive - embryo transfer recip records: transfers, preg checks, open inventory and owner reports.",
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
