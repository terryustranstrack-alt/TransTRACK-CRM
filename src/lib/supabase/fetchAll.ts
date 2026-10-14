import "server-only";

const PAGE_SIZE = 1000;

// Supabase membatasi 1000 baris per permintaan — ambil halaman demi halaman
// sampai habis, supaya hitungan (leaderboard, pengingat harian) tidak
// terpotong diam-diam. `query(from, to)` = query dengan .range(from, to).
export async function fetchAll<T>(
  query: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}
