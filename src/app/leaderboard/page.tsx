import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentMonth } from "@/lib/leaderboard";
import { loadLeaderboard } from "./data";
import LeaderboardView from "@/components/LeaderboardView";

export const dynamic = "force-dynamic";

// Halaman "Leaderboard" — terbuka untuk semua user yang login (tim bisa
// melihat progres satu sama lain), tapi hanya admin yang bisa mengatur
// target. Bulan dipilih lewat ?month=YYYY-MM (default: bulan ini, WIB).
export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  const requested = (await searchParams).month;
  const month =
    typeof requested === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested)
      ? requested
      : currentMonth();

  const { profiles, rows } = await loadLeaderboard(month);

  return (
    <LeaderboardView
      month={month}
      profiles={profiles}
      rows={rows}
      isAdmin={!!profile?.is_admin}
      currentUserId={user.id}
    />
  );
}
