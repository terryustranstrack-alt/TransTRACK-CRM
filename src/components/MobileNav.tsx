"use client";

import { useState, type SVGProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useInboxUnread } from "@/components/InboxUnreadProvider";

// Ikon garis sederhana (tanpa library ikon — lihat aturan proyek #4).
// Semua 24x24, mewarisi warna dari `currentColor`.
function IconDashboard(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}
function IconBoard(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="5" height="16" />
      <rect x="10" y="4" width="5" height="11" />
      <rect x="17" y="4" width="4" height="7" />
    </svg>
  );
}
function IconProspects(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}
function IconInbox(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function IconMore(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  );
}

const TABS = [
  { href: "/dashboard", label: "Dashboard", Icon: IconDashboard },
  { href: "/", label: "Board", Icon: IconBoard },
  { href: "/prospek", label: "Prospects", Icon: IconProspects },
  { href: "/inbox", label: "Inbox", Icon: IconInbox },
];

// Menu "More" khusus admin (halaman ini tidak terlihat oleh sales biasa).
const MORE_LINKS = [
  { href: "/sales", label: "Sales" },
  { href: "/settings", label: "Settings" },
];

// Bottom tab bar untuk layar telepon (<640px). Di layar lebih besar
// (`sm:` ke atas) disembunyikan — navigasi pakai NavMenu di header.
export default function MobileNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const { totalUnread } = useInboxUnread();
  const [moreOpen, setMoreOpen] = useState(false);

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 border-t border-[var(--color-border)] bg-[var(--color-surface)] pb-[env(safe-area-inset-bottom)]">
      {moreOpen && isAdmin && (
        <>
          {/* Lapisan tembus pandang untuk menutup menu saat disentuh di luar. */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
            className="fixed inset-0 z-0 cursor-default"
          />
          <div className="absolute bottom-full right-2 mb-2 z-10 min-w-36 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg overflow-hidden">
            {MORE_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMoreOpen(false)}
                className={`block px-4 py-3 text-sm ${
                  isActive(link.href)
                    ? "bg-[var(--color-muted-bg)] font-medium text-foreground"
                    : "text-[var(--color-muted)]"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="flex">
        {TABS.map(({ href, label, Icon }) => {
          const active = isActive(href);
          const showBadge = href === "/inbox" && totalUnread > 0;
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                active ? "text-accent" : "text-[var(--color-muted)]"
              }`}
            >
              <span className="relative">
                <Icon className="w-6 h-6" />
                {showBadge && (
                  <span className="font-data absolute -top-1.5 -right-2 bg-[var(--color-danger)] text-white text-[10px] leading-none rounded-full px-1 py-0.5 min-w-4 text-center">
                    {totalUnread}
                  </span>
                )}
              </span>
              {label}
            </Link>
          );
        })}
        {isAdmin && (
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
              moreOpen ? "text-accent" : "text-[var(--color-muted)]"
            }`}
          >
            <IconMore className="w-6 h-6" />
            More
          </button>
        )}
      </div>
    </nav>
  );
}
