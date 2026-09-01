const KAZSTANDARD_ORIGIN = "https://new-shop.ksm.kz";
const DEFAULT_TIMEOUT_MS = 5_000;
// Public catalog pages are normally far smaller. Two megabytes leave generous room for
// metadata markup while bounding memory use from an unexpected upstream response.
export const MAX_KAZSTANDARD_HTML_BYTES = 2_000_000;

type Fetch = typeof fetch;

export type KazStandardClient = {
  searchKazStandard(query: string): Promise<{ html: string; sourceUrl: string }>;
  getKazStandardDocument(documentId: string): Promise<{ html: string; sourceUrl: string }>;
};

type KazStandardClientOptions = {
  fetchImpl?: Fetch;
  timeoutMs?: number;
};

async function readBoundedHtml(response: Response, controller: AbortController): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (Number.isFinite(length) && length > MAX_KAZSTANDARD_HTML_BYTES) {
      controller.abort();
      throw new Error("KazStandard response exceeded the metadata-only size limit.");
    }
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let html = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_KAZSTANDARD_HTML_BYTES) {
        controller.abort();
        await reader.cancel().catch(() => undefined);
        throw new Error("KazStandard response exceeded the metadata-only size limit.");
      }
      html += decoder.decode(value, { stream: true });
    }
    return html + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function assertAllowedUrl(url: URL): void {
  if (url.origin !== KAZSTANDARD_ORIGIN) {
    throw new Error("KazStandard request target is not allowlisted.");
  }
  if (!url.pathname.startsWith("/catalog/")) {
    throw new Error("KazStandard request path is not allowlisted.");
  }
}

export function createKazStandardClient(options: KazStandardClientOptions = {}): KazStandardClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function getHtml(url: URL): Promise<{ html: string; sourceUrl: string }> {
    assertAllowedUrl(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        headers: {
          Accept: "text/html",
          "User-Agent": "EngineerusQuest/0.1 (metadata-only KazStandard lookup; https://engineerus-quest.vercel.app)",
        },
        signal: controller.signal,
      });

      if (response.status >= 300 && response.status < 400) {
        throw new Error("KazStandard redirect was refused.");
      }
      if (!response.ok) {
        throw new Error(`KazStandard request failed with HTTP ${response.status}.`);
      }
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.includes("text/html")) {
        throw new Error("KazStandard returned a non-HTML response.");
      }

      const html = await readBoundedHtml(response, controller);
      return { html, sourceUrl: url.toString() };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async searchKazStandard(query) {
      const normalizedQuery = query.trim();
      if (!normalizedQuery) throw new Error("KazStandard search query is empty.");
      const url = new URL("/catalog/search/", KAZSTANDARD_ORIGIN);
      url.searchParams.set("q", normalizedQuery);
      return getHtml(url);
    },

    async getKazStandardDocument(documentId) {
      if (!/^\d+$/.test(documentId)) {
        throw new Error("KazStandard document ID must be numeric.");
      }
      return getHtml(new URL(`/catalog/document/${documentId}/`, KAZSTANDARD_ORIGIN));
    },
  };
}
