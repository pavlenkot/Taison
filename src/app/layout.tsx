import type { Metadata, Viewport } from "next";
import "./globals.css";
import { currentUser } from "@/lib/supabase/server";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Taison — особисті фінанси",
  description: "Витрати, доходи, підписки, цілі та щоденні завдання в одному місці",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Taison" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9fafb" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();

  return (
    <html lang="uk">
      <body>
        {user ? (
          <div className="md:flex">
            <Nav email={user.email ?? ""} />
            <main className="min-w-0 flex-1 px-4 pb-6 pt-4 md:px-8 md:pt-8">
              <div className="mx-auto w-full max-w-4xl">{children}</div>
            </main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
