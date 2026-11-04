import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./login/actions";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import InboxUnreadProvider from "@/components/InboxUnreadProvider";

// UI/body face: a step away from the Inter-everywhere look most SaaS
// dashboards default to, while staying just as legible for forms and tables.
const uiFont = Plus_Jakarta_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
});

// Data face: tracked/measured/timestamped values (see .font-data in
// globals.css) — a fleet-tracking CRM's numbers should read as precise.
const dataFont = JetBrains_Mono({
  variable: "--font-data",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TransTRACK CRM",
  description: "Track sales lead progress.",
  // Supaya di iPhone, "Add to Home Screen" membuka CRM seperti aplikasi
  // (layar penuh) — syarat dari Apple untuk bisa menerima notifikasi push.
  appleWebApp: { capable: true, title: "TransTRACK", statusBarStyle: "default" },
  icons: { apple: "/logo.png" },
};

// viewportFit "cover" + safe-area padding di bawah supaya bottom nav di
// telepon tidak ketutup notch / home-indicator.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Layout dasar semua halaman: menu samping (desktop) / bar bawah (telepon)
// + info user & tombol keluar (hanya kalau sudah login), lalu isi halamannya.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Perlu tahu status admin di sini supaya Sidebar/MobileNav bisa memunculkan/
  // menyembunyikan menu "Sales" (khusus admin).
  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    isAdmin = profile?.is_admin ?? false;
  }

  return (
    <html
      lang="en"
      className={`${uiFont.variable} ${dataFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {user ? (
          <InboxUnreadProvider>
            {/* Desktop/tablet: menu samping kiri + isi halaman di kanan.
                Telepon: bar atas tipis (logo + Log out) + bar menu bawah. */}
            <div className="flex flex-1 min-h-0">
              <Sidebar isAdmin={isAdmin} email={user.email ?? ""} />
              <div className="flex-1 flex flex-col min-w-0">
                <header className="md:hidden flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm">
                  <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
                    <Image
                      src="/logo.png"
                      alt=""
                      width={28}
                      height={28}
                      className="rounded"
                      priority
                    />
                    <span className="font-semibold tracking-tight">TransTRACK CRM</span>
                  </Link>
                  <form action={signOut}>
                    <button
                      type="submit"
                      className="text-[var(--color-muted)] hover:text-foreground hover:underline"
                    >
                      Log Out
                    </button>
                  </form>
                </header>
                {/* padding bawah supaya bar menu telepon tidak menutupi isi. */}
                <div className="flex-1 flex flex-col min-w-0 pb-14 md:pb-0">
                  {children}
                </div>
              </div>
            </div>
            <MobileNav isAdmin={isAdmin} />
          </InboxUnreadProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
