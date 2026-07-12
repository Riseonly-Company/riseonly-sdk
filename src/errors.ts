export class RiseonlyError extends Error {
  readonly code: number;
  readonly retryAfter?: number;
  readonly response?: unknown;

  constructor(message: string, code: number, retryAfter?: number, response?: unknown) {
    super(message);
    this.name = 'RiseonlyError';
    this.code = code;
    this.retryAfter = retryAfter;
    this.response = response;
  }

  static fromApiResponse(body: {
    error_code: number;
    description: string;
    parameters?: { retry_after?: number };
  }): RiseonlyError {
    return new RiseonlyError(
      body.description,
      body.error_code,
      body.parameters?.retry_after,
      body,
    );
  }
}

export class RiseonlyNetworkError extends RiseonlyError {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown, code = 0) {
    super(message, code);
    this.name = 'RiseonlyNetworkError';
    this.cause = cause;
  }
}

export class RiseonlyTimeoutError extends RiseonlyNetworkError {
  constructor(message = 'Request timed out') {
    super(message, undefined, 408);
    this.name = 'RiseonlyTimeoutError';
  }
}
