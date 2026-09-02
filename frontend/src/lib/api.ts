const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError("The API request failed.", response.status);
  }

  return response.json() as Promise<T>;
}

export type HealthStatus = {
  status: "ok";
  database: "available";
  blockchain_enabled: boolean;
};

export function getHealth() {
  return apiRequest<HealthStatus>("/health/");
}
