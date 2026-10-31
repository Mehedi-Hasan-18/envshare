import { supabase } from "./supabase";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api").replace(/\/+$/, "");

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  const cleanPath = path.replace(/^\/+/, "").replace(/^api\//, "");
  const url = API_BASE_URL.endsWith("/api")
    ? `${API_BASE_URL}/${cleanPath}`
    : `${API_BASE_URL}/api/${cleanPath}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.headers || {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });

  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`;

    try {
      const errorPayload = await response.json();
      if (typeof errorPayload?.detail === "string") {
        detail = errorPayload.detail;
      } else {
        detail = JSON.stringify(errorPayload);
      }
    } catch {
      // Keep the status-based detail when the response is not valid JSON.
    }

    throw new Error(detail);
  }

  return (await response.json()) as T;
}
