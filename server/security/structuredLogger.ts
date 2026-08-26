import { AsyncLocalStorage } from "node:async_hooks";

const SENSITIVE_KEY = /authorization|token|password|secret|api[_-]?key|cookie|set-cookie/i;
const BEARER_VALUE = /\bBearer\s+[^\s,;]+/gi;
const JWT_VALUE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const ASSIGNMENT_VALUE = /\b(authorization|access[_-]?token|refresh[_-]?token|password|secret|api[_-]?key|cookie)\s*[:=]\s*[^\s,;]+/gi;
const REDACTED = "[REDACTED]";

type LogLevel = "info" | "warn" | "error";
type LogFields = Record<string, unknown>;
type LogSink = (serialized: string) => void;

const requestContext = new AsyncLocalStorage<{ requestId: string }>();

export function runWithRequestId<T>(requestId: string, callback: () => T): T {
  return requestContext.run({ requestId }, callback);
}

export function currentRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

export function redactLogValue(value: unknown, key = "", seen = new WeakSet<object>()): unknown {
  if (SENSITIVE_KEY.test(key)) return REDACTED;
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    return value
      .replace(BEARER_VALUE, `Bearer ${REDACTED}`)
      .replace(JWT_VALUE, REDACTED)
      .replace(ASSIGNMENT_VALUE, (_match, label: string) => `${label}=${REDACTED}`);
  }
  if (value instanceof Error) return { name: value.name };
  if (Array.isArray(value)) return value.map((item) => redactLogValue(item, "", seen));
  if (typeof value === "object") {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    const sanitized = Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactLogValue(entryValue, entryKey, seen)]),
    );
    seen.delete(value);
    return sanitized;
  }
  return String(value);
}

export type StructuredLogger = {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
};

export function createStructuredLogger(sink: LogSink = (line) => console.log(line)): StructuredLogger {
  function write(level: LogLevel, event: string, fields: LogFields = {}): void {
    const requestId = currentRequestId();
    const entry = redactLogValue({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...(requestId ? { request_id: requestId } : {}),
      ...fields,
    });
    sink(JSON.stringify(entry));
  }
  return {
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields),
  };
}

export const securityLogger = createStructuredLogger();
