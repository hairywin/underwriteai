const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BODY_EXCERPT_CHARS = 5_000;

const SENSITIVE_HEADER_KEYS = new Set(["authorization", "x-api-key"]);
const SENSITIVE_QUERY_KEYS = new Set(["apiKey", "apikey", "key", "token", "access_token"]);

export type HttpErrorLabel =
  | "Likely CORS blocked or network failure"
  | "Request timed out after 15s"
  | "No internet connection"
  | "HTTP error"
  | "Network error";

export type HttpErrorReport = {
  contextLabel: string;
  label: HttpErrorLabel;
  message: string;
  hint?: string;
  timestamp: string;
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  responseHeaders?: Record<string, string>;
  bodyExcerpt?: string;
  requestHeaders?: Record<string, string>;
};

export class HttpRequestError extends Error {
  report: HttpErrorReport;

  constructor(report: HttpErrorReport) {
    const message = report.status != null
      ? `${report.contextLabel} error ${report.status}: ${report.bodyExcerpt || report.statusText || report.message}`
      : `${report.contextLabel}: ${report.label}`;
    super(message);
    this.name = "HttpRequestError";
    this.report = report;
  }
}

function truncate(value: string) {
  return value.length <= MAX_BODY_EXCERPT_CHARS ? value : `${value.slice(0, MAX_BODY_EXCERPT_CHARS)}…`;
}

function sanitizeHeaders(headers?: HeadersInit) {
  if (!headers) return undefined;
  const pairs = new Headers(headers);
  const out: Record<string, string> = {};
  pairs.forEach((value, key) => {
    out[key] = SENSITIVE_HEADER_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : value;
  });
  return out;
}

function sanitizeUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    for (const key of SENSITIVE_QUERY_KEYS) {
      if (parsed.searchParams.has(key)) parsed.searchParams.set(key, "[REDACTED]");
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

async function parseErrorBody(response: Response) {
  const clone = response.clone();
  try {
    return truncate(JSON.stringify(await clone.json()));
  } catch {
    return truncate(await response.text());
  }
}

function pickResponseHeaders(headers: Headers) {
  const contentType = headers.get("content-type");
  const requestId = headers.get("x-request-id");
  const out: Record<string, string> = {};
  if (contentType) out["content-type"] = contentType;
  if (requestId) out["x-request-id"] = requestId;
  return Object.keys(out).length ? out : undefined;
}

function logError(report: HttpErrorReport) {
  console.error({
    contextLabel: report.contextLabel,
    url: report.url,
    method: report.method,
    status: report.status,
    label: report.label,
    message: report.message,
    bodyExcerpt: report.bodyExcerpt,
  });
}

export async function httpFetch(url: string, options: RequestInit = {}, contextLabel: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), REQUEST_TIMEOUT_MS);
  const method = options.method || "GET";
  const sanitizedUrl = sanitizeUrl(url);
  const requestHeaders = sanitizeHeaders(options.headers);

  try {
    if (options.signal) {
      options.signal.addEventListener("abort", () => controller.abort("upstream"), { once: true });
    }
    const response = await fetch(url, { ...options, signal: controller.signal });

    if (!response.ok) {
      const bodyExcerpt = await parseErrorBody(response);
      const report: HttpErrorReport = {
        contextLabel,
        label: "HTTP error",
        message: `HTTP ${response.status} ${response.statusText}`,
        timestamp: new Date().toISOString(),
        url: sanitizedUrl,
        method,
        status: response.status,
        statusText: response.statusText,
        responseHeaders: pickResponseHeaders(response.headers),
        bodyExcerpt,
        requestHeaders,
      };
      logError(report);
      throw new HttpRequestError(report);
    }

    return response;
  } catch (error: any) {
    if (error instanceof HttpRequestError) throw error;
    const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
    const timedOut = error?.name === "AbortError";
    const failedToFetch = error instanceof TypeError && /failed to fetch/i.test(error.message || "");

    const report: HttpErrorReport = {
      contextLabel,
      label: "Network error",
      message: error?.message || "Network request failed",
      timestamp: new Date().toISOString(),
      url: sanitizedUrl,
      method,
      requestHeaders,
    };

    if (timedOut) {
      report.label = "Request timed out after 15s";
      report.message = "The request was aborted after exceeding the timeout.";
    } else if (isOffline) {
      report.label = "No internet connection";
      report.message = "Your browser appears to be offline.";
    } else if (failedToFetch) {
      report.label = "Likely CORS blocked or network failure";
      report.hint = "Check DevTools > Network for an OPTIONS preflight failure and CORS headers";
    }

    logError(report);
    throw new HttpRequestError(report);
  } finally {
    clearTimeout(timeout);
  }
}
