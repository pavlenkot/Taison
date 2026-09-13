import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { currentUser } from "@/lib/supabase/server";
import { Nav } from "@/components/Nav";
import { ServiceWorkerSetup } from "@/components/ServiceWorkerSetup";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Taskly — особисті фінанси",
  description:
    "Витрати, доходи, підписки, цілі та щоденні завдання в одному місці",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Taskly" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#080D12",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();

  return (
    <html lang="uk">
      <body className={inter.variable}>
        <ServiceWorkerSetup />
        {user ? (
          <div className="app-shell">
            <Nav email={user.email ?? ""} />
            <main className="app-main">
              <div className="app-content">{children}</div>
            </main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
