import MergeLeads from "@/components/MergeLeads";

// force-dynamic: data lead berubah-ubah, jangan di-cache statis.
export const dynamic = "force-dynamic";

// Halaman "/leads/<id>/merge" — gabungkan lead <id> (primary) dengan satu
// lead lain. Lead kedua bisa sudah ditentukan lewat query "?with=<id>"
// (mis. dari daftar "Possible duplicates"), atau dipilih lewat pencarian.
export default async function MergeLeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ with?: string }>;
}) {
  const { id } = await params;
  const { with: withId } = await searchParams;
  return <MergeLeads primaryId={id} initialSecondaryId={withId ?? null} />;
}
