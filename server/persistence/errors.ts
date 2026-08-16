export class PersistenceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PersistenceError";
  }
}

export function sendPersistenceError(
  response: import("express").Response,
  error: unknown,
): void {
  if (error instanceof PersistenceError) {
    response.status(error.status).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  response.status(503).json({
    error: { code: "persistence_unavailable", message: "Persistent storage is temporarily unavailable." },
  });
}
