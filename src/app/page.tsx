import Link from "next/link";
import LeadBoard from "@/components/LeadBoard";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

// Halaman utama ("/"): papan Kanban leads (LeadBoard) + tombol tambah lead.
export default function Home() {
  return (
    <main className="flex flex-col flex-1 gap-6 p-4 sm:p-8 min-w-0">
      <PageHeader
        title="Lead Pipeline"
        description="Drag a card to another column to change its status"
        actions={
          <Link href="/leads/baru" className="btn-primary">
            + Add Lead
          </Link>
        }
      />
      <LeadBoard />
    </main>
  );
}
