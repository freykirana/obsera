import { serverApiUrl } from "@/lib/api";

type BackendFetchOptions = RequestInit & {
  path: string;
};

export async function backendFetch({ path, ...options }: BackendFetchOptions) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return fetch(serverApiUrl(normalizedPath), {
    cache: "no-store",
    credentials: "include",
    ...options,
  });
}
