import { redirect } from "next/navigation";

/**
 * /history/[id] route - redirects to /history/[id]/recommendations by default
 */
export default async function HistoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const search = await searchParams;

  // Preserve query params when redirecting
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (typeof value === "string") {
      urlParams.set(key, value);
    }
  }

  const queryString = urlParams.toString();
  redirect(
    `/history/${id}/recommendations${queryString ? `?${queryString}` : ""}`
  );
}
