import {
  CANONICAL_API_PREFIX,
  DEFAULT_API_BASE,
  IDEMPOTENCY_HEADER,
} from './constants.js';
import {
  RiseonlyAbortError,
  RiseonlyError,
  RiseonlyNetworkError,
  RiseonlyResponseError,
  RiseonlyTimeoutError,
} from './errors.js';
import type {
  AnswerCallbackQueryOptions,
  ApiEnvelope,
  BotCommand,
  Capabilities,
  Chat,
  ClientOptions,
  DeleteMessageOptions,
  DeleteMyCommandsOptions,
  DeleteWebhookOptions,
  EditMessageTextOptions,
  GetChatOptions,
  GetMyCommandsOptions,
  GetUpdatesOptions,
  MediaInput,
  Message,
  RequestOptions,
  SendChatActionOptions,
  SendMediaOptions,
  SendMessageOptions,
  SetMyCommandsOptions,
  SetWebhookOptions,
  SetWebhookResult,
  Update,
  User,
  WebhookInfo,
} from './types/index.js';

type QueryValue = string | number | boolean | undefined | null;

export class ApiClient {
  readonly token: string;
  readonly baseUrl: string;
  readonly fetchImpl: typeof fetch;
  readonly requestTimeoutMs: number;
  readonly useCompatibleEndpoint: boolean;

  constructor(token: string, options: ClientOptions = {}) {
    if (!token?.trim()) {
      throw new Error('bot token is required');
    }
    this.token = token.trim();
    this.baseUrl = (options.baseUrl ?? DEFAULT_API_BASE).replace(/\/$/, '');
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new Error('global fetch is unavailable; provide ClientOptions.fetch');
    }
    this.fetchImpl = options.fetch ? fetchImpl : fetchImpl.bind(globalThis);
    this.requestTimeoutMs = options.requestTimeoutMs ?? 60_000;
    if (!Number.isFinite(this.requestTimeoutMs) || this.requestTimeoutMs <= 0) {
      throw new Error('requestTimeoutMs must be a positive number');
    }
    this.useCompatibleEndpoint = options.useCompatibleEndpoint ?? false;
  }

  /**
   * Returns the platform capabilities document.
   */
  async getCapabilities(signal?: AbortSignal): Promise<Capabilities> {
    const url = `${this.baseUrl}${CANONICAL_API_PREFIX}/capabilities`;
    const { response, body } = await this.fetchJson(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    }, { signal });
    if (!response.ok) {
      throw new RiseonlyResponseError(
        `capabilities request failed with status ${response.status}`,
        response.status,
        serializeResponseBody(body),
      );
    }
    if (!isRecord(body) || !Array.isArray(body.methods)) {
      throw new RiseonlyResponseError('capabilities response is invalid', response.status);
    }
    return body as unknown as Capabilities;
  }

  /**
   * Calls a Bot API method and returns the typed result.
   */
  async callMethod<T>(
    method: string,
    payload: Record<string, unknown> = {},
    options: RequestOptions = {},
  ): Promise<T> {
    const envelope = await this.request<T>(method, payload, options);
    return envelope.result;
  }

  /**
   * Performs a raw Bot API request and returns the full envelope.
   */
  async request<T>(
    method: string,
    payload: Record<string, unknown> = {},
    options: RequestOptions = {},
  ): Promise<ApiEnvelope<T> & { ok: true; result: T }> {
    const url = this.buildMethodUrl(method);
    const headers: Record<string, string> = {
      Authorization: `Bot ${this.token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (options.requestId) {
      headers[IDEMPOTENCY_HEADER] = options.requestId;
    }

    const { response, body } = await this.fetchJson(
      url,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      },
      options,
    );
    if (isApiErrorResponse(body)) {
      throw RiseonlyError.fromApiResponse(body);
    }
    if (!response.ok) {
      throw new RiseonlyResponseError(
        `Bot API request failed with status ${response.status}`,
        response.status,
        serializeResponseBody(body),
      );
    }
    if (!isRecord(body) || body.ok !== true || !('result' in body)) {
      throw new RiseonlyResponseError('Bot API response envelope is invalid', response.status);
    }
    return body as unknown as ApiEnvelope<T> & { ok: true; result: T };
  }

  async getMe(options?: RequestOptions): Promise<User> {
    return this.callMethod<User>('getMe', {}, options);
  }

  async sendMessage(options: SendMessageOptions): Promise<Message> {
    const { request, payload } = splitRequestOptions(options);
    return this.callMethod<Message>('sendMessage', payload, request);
  }

  async sendPhoto(photo: MediaInput, options: SendMediaOptions): Promise<Message> {
    return this.sendMedia('sendPhoto', 'photo', photo, options);
  }

  async sendVideo(video: MediaInput, options: SendMediaOptions): Promise<Message> {
    return this.sendMedia('sendVideo', 'video', video, options);
  }

  async sendDocument(document: MediaInput, options: SendMediaOptions): Promise<Message> {
    return this.sendMedia('sendDocument', 'document', document, options);
  }

  async sendAudio(audio: MediaInput, options: SendMediaOptions): Promise<Message> {
    return this.sendMedia('sendAudio', 'audio', audio, options);
  }

  async sendVoice(voice: MediaInput, options: SendMediaOptions): Promise<Message> {
    return this.sendMedia('sendVoice', 'voice', voice, options);
  }

  async sendAnimation(animation: MediaInput, options: SendMediaOptions): Promise<Message> {
    return this.sendMedia('sendAnimation', 'animation', animation, options);
  }

  async editMessageText(options: EditMessageTextOptions): Promise<Message> {
    const { request, payload } = splitRequestOptions(options);
    return this.callMethod<Message>('editMessageText', payload, request);
  }

  async deleteMessage(options: DeleteMessageOptions): Promise<boolean> {
    const { request, payload } = splitRequestOptions(options);
    return this.callMethod<boolean>('deleteMessage', payload, request);
  }

  async sendChatAction(options: SendChatActionOptions): Promise<boolean> {
    const { request, payload } = splitRequestOptions(options);
    return this.callMethod<boolean>('sendChatAction', payload, request);
  }

  async getUpdates(options: GetUpdatesOptions = {}): Promise<Update[]> {
    const { request, payload } = splitRequestOptions(options);
    const serverTimeoutMs = (options.timeout ?? 0) * 1000 + 5_000;
    request.timeoutMs ??= Math.max(this.requestTimeoutMs, serverTimeoutMs);
    return this.callMethod<Update[]>('getUpdates', payload, request);
  }

  async setWebhook(options: SetWebhookOptions): Promise<SetWebhookResult> {
    const { request, payload } = splitRequestOptions(options);
    return this.callMethod<SetWebhookResult>('setWebhook', payload, request);
  }

  async deleteWebhook(options: DeleteWebhookOptions = {}): Promise<boolean> {
    const { request, payload } = splitRequestOptions(options);
    return this.callMethod<boolean>('deleteWebhook', payload, request);
  }

  async getWebhookInfo(options?: RequestOptions): Promise<WebhookInfo> {
    return this.callMethod<WebhookInfo>('getWebhookInfo', {}, options);
  }

  async setMyCommands(options: SetMyCommandsOptions): Promise<boolean> {
    const { request, payload } = splitRequestOptions(options);
    return this.callMethod<boolean>('setMyCommands', payload, request);
  }

  async getMyCommands(options: GetMyCommandsOptions = {}): Promise<BotCommand[]> {
    const { request, payload } = splitRequestOptions(options);
    return this.callMethod<BotCommand[]>('getMyCommands', payload, request);
  }

  async deleteMyCommands(options: DeleteMyCommandsOptions = {}): Promise<boolean> {
    const { request, payload } = splitRequestOptions(options);
    return this.callMethod<boolean>('deleteMyCommands', payload, request);
  }

  async answerCallbackQuery(options: AnswerCallbackQueryOptions): Promise<boolean> {
    const { request, payload } = splitRequestOptions(options);
    return this.callMethod<boolean>('answerCallbackQuery', payload, request);
  }

  async getChat(options: GetChatOptions): Promise<Chat> {
    const { request, payload } = splitRequestOptions(options);
    return this.callMethod<Chat>('getChat', payload, request);
  }

  private async sendMedia(
    method: string,
    field: string,
    media: MediaInput,
    options: SendMediaOptions,
  ): Promise<Message> {
    const { request, payload } = splitRequestOptions(options);
    return this.callMethod<Message>(
      method,
      {
        ...payload,
        [field]: this.normalizeMedia(media),
      },
      request,
    );
  }

  private normalizeMedia(media: MediaInput): string | Record<string, string | number> {
    if (typeof media === 'string') {
      return media;
    }
    if (media.file_id || media.url) {
      return Object.fromEntries(
        Object.entries(media).filter((entry): entry is [string, string | number] =>
          typeof entry[1] === 'string' || typeof entry[1] === 'number'
        ),
      );
    }
    throw new Error('media requires file_id or url');
  }

  private buildMethodUrl(method: string): string {
    if (this.useCompatibleEndpoint) {
      return `${this.baseUrl}/bot${this.token}/${method}`;
    }
    return `${this.baseUrl}${CANONICAL_API_PREFIX}/${method}`;
  }

  private async fetchJson(
    url: string,
    init: RequestInit,
    options: Pick<RequestOptions, 'signal' | 'timeoutMs'> = {},
  ): Promise<{ response: Response; body: unknown }> {
    const controller = new AbortController();
    let timedOut = false;
    const timeoutMs = options.timeoutMs ?? this.requestTimeoutMs;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error('timeoutMs must be a positive number');
    }
    const abortFromCaller = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) {
      throw new RiseonlyAbortError('Request was aborted', options.signal.reason);
    }
    options.signal?.addEventListener('abort', abortFromCaller, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) {
        if (timedOut) {
          throw new RiseonlyTimeoutError();
        }
        throw new RiseonlyAbortError('Request was aborted', error);
      }
      throw new RiseonlyNetworkError('network request failed', error);
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abortFromCaller);
    }

    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      throw new RiseonlyNetworkError('unable to read response body', error, response.status);
    }
    if (!text) {
      throw new RiseonlyResponseError('Bot API returned an empty response', response.status);
    }
    try {
      return { response, body: JSON.parse(text) as unknown };
    } catch {
      throw new RiseonlyResponseError(
        'Bot API returned a non-JSON response',
        response.status,
        text.slice(0, 4_096),
      );
    }
  }
}

function splitRequestOptions<T extends RequestOptions>(
  options: T,
): { request: RequestOptions; payload: Record<string, unknown> } {
  const { requestId, signal, timeoutMs, ...payload } = options;
  return {
    request: { requestId, signal, timeoutMs },
    payload: payload as Record<string, unknown>,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isApiErrorResponse(value: unknown): value is {
  ok: false;
  error_code: number;
  description: string;
  parameters?: { retry_after?: number };
} {
  return isRecord(value)
    && value.ok === false
    && typeof value.error_code === 'number'
    && typeof value.description === 'string';
}

function serializeResponseBody(body: unknown): string | undefined {
  try {
    return JSON.stringify(body).slice(0, 4_096);
  } catch {
    return undefined;
  }
}

export function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}
