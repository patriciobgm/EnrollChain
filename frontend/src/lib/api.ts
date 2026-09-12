const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";
const SESSION_KEY = "enrollchain-session";
type Tokens = { access: string; refresh: string };
let refreshing: Promise<boolean> | null = null;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function getTokens(): Tokens | null {
  try {
    return JSON.parse(
      sessionStorage.getItem(SESSION_KEY) ?? "null",
    ) as Tokens | null;
  } catch {
    return null;
  }
}
export function setTokens(tokens: Tokens | null) {
  if (tokens) sessionStorage.setItem(SESSION_KEY, JSON.stringify(tokens));
  else sessionStorage.removeItem(SESSION_KEY);
}

async function refreshSession(): Promise<boolean> {
  const previous = getTokens();
  if (!previous) return false;
  try {
    const response = await fetch(`${API_BASE_URL}/auth/token/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: previous.refresh }),
    });
    if (!response.ok) throw new Error("Session expired");
    const next = (await response.json()) as Tokens;
    if (getTokens()?.refresh !== previous.refresh) return false;
    setTokens(next);
    return true;
  } catch {
    if (getTokens()?.refresh === previous.refresh) {
      setTokens(null);
      window.dispatchEvent(new Event("session-expired"));
    }
    return false;
  }
}

export async function apiResponse(
  path: string,
  init?: RequestInit,
  retry = true,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (init?.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const token = getTokens()?.access;
  if (token && !path.startsWith("/auth/token"))
    headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Cannot connect to the server. Please try again.", 0);
  }
  if (
    response.status === 401 &&
    retry &&
    token &&
    !path.startsWith("/auth/token")
  ) {
    if (!refreshing)
      refreshing = refreshSession().finally(() => {
        refreshing = null;
      });
    if (await refreshing) return apiResponse(path, init, false);
  }
  if (
    response.status === 401 &&
    !retry &&
    token &&
    getTokens()?.access === token
  ) {
    setTokens(null);
    window.dispatchEvent(new Event("session-expired"));
  }
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    const explain = (value: unknown): string => {
      if (typeof value === "string") return value;
      if (Array.isArray(value)) return value.map(explain).join(" ");
      if (value && typeof value === "object")
        return Object.entries(value)
          .map(
            ([key, val]) =>
              `${key === "detail" || key === "non_field_errors" ? "" : `${key}: `}${explain(val)}`,
          )
          .join(" ");
      return "The request failed. Please try again.";
    };
    throw new ApiError(explain(data), response.status);
  }
  return response;
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await apiResponse(path, init);
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}
export const jsonBody = (data: unknown, method = "POST"): RequestInit => ({
  method,
  body: JSON.stringify(data),
});
export type HealthStatus = {
  status: "ok";
  database: "available";
  blockchain_enabled: boolean;
};
export function getHealth() {
  return apiRequest<HealthStatus>("/health/");
}
