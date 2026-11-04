"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useInboxUnread } from "@/components/InboxUnreadProvider";
import InboxNotifier from "@/components/InboxNotifier";
import PushToggle from "@/components/PushToggle";
import { signOut } from "@/app/login/actions";
import {
  ADMIN_NAV,
  IconLogout,
  MAIN_NAV,
  isNavActive,
  type NavItem,
} from "@/components/navIcons";

// Menu samping untuk layar tablet/laptop (md ke atas). Menggantikan bar menu
// di atas yang makin penuh: menu utama di atas, menu admin terpisah, lalu
// pengaturan notifikasi + akun + Log out di bagian bawah. Di telepon
// disembunyikan — navigasi pakai MobileNav (bar bawah).
export default function Sidebar({
  isAdmin,
  email,
}: {
  isAdmin: boolean;
  email: string;
}) {
  return (
    <aside className="hidden md:flex sticky top-0 h-dvh w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
      <Link
        href="/dashboard"
        className="flex items-center gap-2.5 px-5 h-16 shrink-0 border-b border-[var(--color-border)]"
      >
        <Image src="/logo.png" alt="" width={30} height={30} className="rounded" priority />
        <span className="font-semibold tracking-tight">
          TransTRACK <span className="text-[var(--color-muted)] font-medium">CRM</span>
        </span>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-6">
        <NavGroup items={MAIN_NAV} />
        {isAdmin && <NavGroup title="Admin" items={ADMIN_NAV} />}
      </nav>

      <div className="border-t border-[var(--color-border)] px-4 py-4 flex flex-col gap-3 text-sm">
        <InboxNotifier />
        <PushToggle className="text-xs" />
        <div className="flex items-center justify-between gap-2 pt-1">
          <span
            className="font-data text-xs text-[var(--color-muted)] truncate"
            title={email}
          >
            {email}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              title="Log out"
              aria-label="Log out"
              className="p-1.5 rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-muted-bg)] hover:text-foreground"
            >
              <IconLogout className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

// Satu kelompok menu (dengan judul kecil opsional, mis. "Admin").
function NavGroup({ title, items }: { title?: string; items: NavItem[] }) {
  const pathname = usePathname();
  const { totalUnread } = useInboxUnread();

  return (
    <div className="flex flex-col gap-0.5">
      {title && (
        <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          {title}
        </p>
      )}
      {items.map(({ href, label, Icon }) => {
        const active = isNavActive(pathname, href);
        const showBadge = href === "/inbox" && totalUnread > 0;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-[var(--color-muted-bg)] text-foreground"
                : "text-[var(--color-muted)] hover:bg-[var(--color-muted-bg)] hover:text-foreground"
            }`}
          >
            {/* Garis merah di kiri menandai halaman yang sedang dibuka. */}
            {active && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-accent" />
            )}
            <Icon className={`w-[18px] h-[18px] ${active ? "text-accent" : ""}`} />
            <span className="flex-1">{label}</span>
            {showBadge && (
              <span className="font-data bg-[var(--color-danger)] text-white text-[11px] rounded-full px-1.5 min-w-5 text-center">
                {totalUnread}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
