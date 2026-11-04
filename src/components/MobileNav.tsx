"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useInboxUnread } from "@/components/InboxUnreadProvider";
import PushToggle from "@/components/PushToggle";
import {
  IconBoard,
  IconDashboard,
  IconInbox,
  IconMore,
  IconProspects,
  isNavActive,
} from "@/components/navIcons";

const TABS = [
  { href: "/dashboard", label: "Dashboard", Icon: IconDashboard },
  { href: "/", label: "Board", Icon: IconBoard },
  { href: "/prospek", label: "Prospects", Icon: IconProspects },
  { href: "/inbox", label: "Inbox", Icon: IconInbox },
];

// Menu "More": Leaderboard untuk semua user, sisanya khusus admin
// (Sales & Settings tidak terlihat oleh sales biasa).
const MORE_LINKS = [{ href: "/leaderboard", label: "Leaderboard" }];
const ADMIN_MORE_LINKS = [
  { href: "/sales", label: "Sales" },
  { href: "/settings", label: "Settings" },
];

// Bottom tab bar untuk layar telepon (<768px). Di layar lebih besar
// (`md:` ke atas) disembunyikan — navigasi pakai Sidebar di kiri.
export default function MobileNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const { totalUnread } = useInboxUnread();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (href: string) => isNavActive(pathname, href);

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-[var(--color-border)] bg-[var(--color-surface)] pb-[env(safe-area-inset-bottom)]">
      {moreOpen && (
        <>
          {/* Lapisan tembus pandang untuk menutup menu saat disentuh di luar. */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
            className="fixed inset-0 z-0 cursor-default"
          />
          <div className="absolute bottom-full right-2 mb-2 z-10 min-w-36 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg overflow-hidden">
            {(isAdmin ? [...MORE_LINKS, ...ADMIN_MORE_LINKS] : MORE_LINKS).map((link) => (
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
            <div className="border-t border-[var(--color-border)] px-4 py-3 text-sm">
              <PushToggle />
            </div>
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
      </div>
    </nav>
  );
}
