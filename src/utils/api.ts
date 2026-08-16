import { supabase } from "../lib/supabase";

const API_URL = normalizeApiBase(import.meta.env?.VITE_API_URL || "");

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
  detail?: string;
  message?: string;
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function normalizeApiBase(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function buildApiUrl(baseUrl: string, endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) {
    throw new Error("apiFetch endpoints must be relative API paths.");
  }
  const normalizedEndpoint = `/${endpoint.replace(/^\/+/, "")}`;
  return `${normalizeApiBase(baseUrl)}${normalizedEndpoint}`;
}

type ApiFetchDependencies = {
  apiUrl: string;
  fetchImpl: typeof fetch;
  getAccessToken: () => Promise<string | null>;
};

export function createApiFetch(dependencies: ApiFetchDependencies) {
  return async function authenticatedApiFetch<T = unknown>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const accessToken = await dependencies.getAccessToken();
    const headers = new Headers(options.headers);

    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    if (options.body != null && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await dependencies.fetchImpl(
      buildApiUrl(dependencies.apiUrl, endpoint),
      { ...options, headers },
    );

    if (response.status === 204) return undefined as T;

    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await response.json().catch(() => undefined)
      : await response.text().catch(() => undefined);

    if (!response.ok) {
      const structured = body && typeof body === "object" ? body as ApiErrorBody : undefined;
      const code = structured?.error?.code || (response.status === 401 ? "unauthorized" : "api_error");
      const message = structured?.error?.message
        || structured?.detail
        || structured?.message
        || `API request failed with status ${response.status}.`;
      throw new ApiError(response.status, code, message, body);
    }

    return body as T;
  };
}

export const apiFetch = createApiFetch({
  apiUrl: API_URL,
  fetchImpl: (input, init) => fetch(input, init),
  async getAccessToken() {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new ApiError(401, "session_unavailable", "Authentication session is unavailable.");
    return data.session?.access_token ?? null;
  },
});
