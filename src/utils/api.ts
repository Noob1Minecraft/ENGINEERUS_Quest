// src/utils/api.ts
// NOTE: must fall back to empty string (same-origin) when VITE_API_URL is unset,
// otherwise the URL becomes "undefined/api/..." and every request 404s.
const API_URL = import.meta.env.VITE_API_URL || '';

export const apiFetch = async (endpoint: string, options?: RequestInit) => {
  const url = `${API_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
};
