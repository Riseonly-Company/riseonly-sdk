import {
  CANONICAL_API_PREFIX,
  DEFAULT_API_BASE,
  IDEMPOTENCY_HEADER,
} from './constants.js';
import { RiseonlyError, RiseonlyNetworkError, RiseonlyTimeoutError } from './errors.js';
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
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.requestTimeoutMs = options.requestTimeoutMs ?? 60_000;
    this.useCompatibleEndpoint = options.useCompatibleEndpoint ?? false;
  }

  /**
   * Returns the platform capabilities document.
   */
  async getCapabilities(signal?: AbortSignal): Promise<Capabilities> {
    const url = `${this.baseUrl}${CANONICAL_API_PREFIX}/capabilities`;
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!response.ok) {
      throw new RiseonlyNetworkError(`capabilities request failed with status ${response.status}`);
    }
    return response.json() as Promise<Capabilities>;
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    const signal = options.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new RiseonlyTimeoutError();
      }
      throw new RiseonlyNetworkError('network request failed', error);
    } finally {
      clearTimeout(timeout);
    }

    const body = (await response.json()) as ApiEnvelope<T>;
    if (!body.ok) {
      throw RiseonlyError.fromApiResponse(body);
    }
    return body;
  }

  async getMe(options?: RequestOptions): Promise<User> {
    return this.callMethod<User>('getMe', {}, options);
  }

  async sendMessage(options: SendMessageOptions): Promise<Message> {
    const { requestId, ...payload } = options;
    return this.callMethod<Message>('sendMessage', payload, { requestId });
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
    const { requestId, ...payload } = options;
    return this.callMethod<Message>('editMessageText', payload, { requestId });
  }

  async deleteMessage(options: DeleteMessageOptions): Promise<boolean> {
    const { requestId, ...payload } = options;
    return this.callMethod<boolean>('deleteMessage', payload, { requestId });
  }

  async sendChatAction(options: SendChatActionOptions): Promise<boolean> {
    const { requestId, ...payload } = options;
    return this.callMethod<boolean>('sendChatAction', payload, { requestId });
  }

  async getUpdates(options: GetUpdatesOptions = {}): Promise<Update[]> {
    const { requestId, ...payload } = options;
    return this.callMethod<Update[]>('getUpdates', payload, { requestId });
  }

  async setWebhook(options: SetWebhookOptions): Promise<SetWebhookResult> {
    const { requestId, ...payload } = options;
    return this.callMethod<SetWebhookResult>('setWebhook', payload, { requestId });
  }

  async deleteWebhook(options: DeleteWebhookOptions = {}): Promise<boolean> {
    const { requestId, ...payload } = options;
    return this.callMethod<boolean>('deleteWebhook', payload, { requestId });
  }

  async getWebhookInfo(options?: RequestOptions): Promise<WebhookInfo> {
    return this.callMethod<WebhookInfo>('getWebhookInfo', {}, options);
  }

  async setMyCommands(options: SetMyCommandsOptions): Promise<boolean> {
    const { requestId, ...payload } = options;
    return this.callMethod<boolean>('setMyCommands', payload, { requestId });
  }

  async getMyCommands(options: GetMyCommandsOptions = {}): Promise<BotCommand[]> {
    const { requestId, ...payload } = options;
    return this.callMethod<BotCommand[]>('getMyCommands', payload, { requestId });
  }

  async deleteMyCommands(options: DeleteMyCommandsOptions = {}): Promise<boolean> {
    const { requestId, ...payload } = options;
    return this.callMethod<boolean>('deleteMyCommands', payload, { requestId });
  }

  async answerCallbackQuery(options: AnswerCallbackQueryOptions): Promise<boolean> {
    const { requestId, ...payload } = options;
    return this.callMethod<boolean>('answerCallbackQuery', payload, { requestId });
  }

  async getChat(options: GetChatOptions): Promise<Chat> {
    const { requestId, ...payload } = options;
    return this.callMethod<Chat>('getChat', payload, { requestId });
  }

  private async sendMedia(
    method: string,
    field: string,
    media: MediaInput,
    options: SendMediaOptions,
  ): Promise<Message> {
    const { requestId, ...payload } = options;
    return this.callMethod<Message>(
      method,
      {
        ...payload,
        [field]: this.normalizeMedia(media),
      },
      { requestId },
    );
  }

  private normalizeMedia(media: MediaInput): string | Record<string, string> {
    if (typeof media === 'string') {
      return media;
    }
    if (media.file_id) {
      return media.file_id;
    }
    if (media.url) {
      return media.url;
    }
    throw new Error('media requires file_id or url');
  }

  private buildMethodUrl(method: string): string {
    if (this.useCompatibleEndpoint) {
      return `${this.baseUrl}/bot${this.token}/${method}`;
    }
    return `${this.baseUrl}${CANONICAL_API_PREFIX}/${method}`;
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
