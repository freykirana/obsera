/**
 * Backend URLs. The browser calls the Express API directly (CORS, Bearer token from
 * localStorage); Next.js route handlers on the server use BACKEND_URL.
 */

const trimSlash = (url: string | undefined) => (url ?? "").replace(/\/+$/, "");

/** Absolute backend URL for a path like "/api/logs", for code that runs in the browser. */
export function apiUrl(path: string): string {
  const base = trimSlash(process.env.NEXT_PUBLIC_API_URL);
  if (!base) throw new Error("NEXT_PUBLIC_API_URL is not set. Copy .env.example to .env.local.");
  return `${base}${path}`;
}

/** Absolute backend URL for server-side code; falls back to NEXT_PUBLIC_API_URL. */
export function serverApiUrl(path: string): string {
  const base = trimSlash(process.env.BACKEND_URL) || trimSlash(process.env.NEXT_PUBLIC_API_URL);
  if (!base) throw new Error("BACKEND_URL is not set. Copy .env.example to .env.local.");
  return `${base}${path}`;
}

/** fetch with the session token attached; a 401 signs the user out. */
export async function fetchApi(url: string, options: RequestInit = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("obsera_token") : null;

  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  // Intercept 401 Unauthorized globally
  if (response.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("obsera_token");
      window.dispatchEvent(new Event("auth_changed"));

      // Prevent redirect loop if already on login page
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
  }

  return response;
}
