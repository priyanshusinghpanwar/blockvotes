const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined

export const apiBaseUrl = rawApiBaseUrl?.replace(/\/+$/, "") || ""

export function apiUrl(path: string): string {
  if (!apiBaseUrl || !path.startsWith("/")) return path
  return `${apiBaseUrl}${path}`
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), {
    credentials: "include",
    ...init,
  })
}
