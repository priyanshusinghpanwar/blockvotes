const defaultApiBaseUrl = "https://screen-uniformly-scoured.ngrok-free.dev"

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined

export const apiBaseUrl = (rawApiBaseUrl?.trim() || defaultApiBaseUrl).replace(/\/+$/, "")

function isNgrokTunnel(url: string): boolean {
  try {
    return /\.ngrok(-free)?\.dev$/i.test(new URL(url).hostname)
  } catch {
    return false
  }
}

const usesNgrokTunnel = isNgrokTunnel(apiBaseUrl)

export function apiUrl(path: string): string {
  if (!apiBaseUrl || !path.startsWith("/")) return path
  return `${apiBaseUrl}${path}`
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)

  if (usesNgrokTunnel) {
    headers.set("ngrok-skip-browser-warning", "true")
  }

  return fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers,
  })
}
