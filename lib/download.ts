import { fetchApi } from "@/lib/api";

/**
 * Download a file from an authenticated endpoint (the browser cannot attach the bearer
 * token to a plain link). Uses the server's Content-Disposition filename when present.
 */
export async function downloadWithAuth(url: string, fallbackFilename: string): Promise<void> {
  const response = await fetchApi(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Download failed (${response.status})`);

  let filename = fallbackFilename;
  const disposition = response.headers.get("content-disposition");
  const match = disposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
  if (match?.[1]) filename = match[1].replace(/['"]/g, "");

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
