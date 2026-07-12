import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { ApiClient } from './client.js';
import { RiseonlyError } from './errors.js';
import { createWebhookHandler } from './webhook.js';
import type {
  BotEvent,
  BotEventMap,
  BotOptions,
  CallbackQuery,
  Message,
  PollingOptions,
  Update,
  WebhookServerOptions,
} from './types/index.js';

type Listener<T extends BotEvent> = BotEventMap[T][];

export class RiseonlyBot extends ApiClient {
  private readonly listeners: { [K in BotEvent]: Listener<K> } = {
    message: [],
    edited_message: [],
    callback_query: [],
    update: [],
    polling_error: [],
    error: [],
  };

  private pollingOptions: PollingOptions;
  private webhookOptions?: WebhookServerOptions;
  private polling = false;
  private pollingAbort?: AbortController;
  private offset = 0;
  private webhookServer?: Server;

  constructor(token: string, options: BotOptions = {}) {
    super(token, options);
    this.pollingOptions = normalizePollingOptions(options.polling);
    this.webhookOptions = options.webhook === false ? undefined : options.webhook;
    if (options.allowed_updates) {
      this.pollingOptions.allowed_updates = options.allowed_updates;
    }
    if (this.pollingOptions.autoStart) {
      void this.startPolling();
    }
  }

  /**
   * Registers an event listener.
   */
  on<T extends BotEvent>(event: T, handler: BotEventMap[T]): this {
    this.listeners[event].push(handler);
    return this;
  }

  /**
   * Removes a previously registered listener.
   */
  off<T extends BotEvent>(event: T, handler: BotEventMap[T]): this {
    const bucket = this.listeners[event];
    const index = bucket.indexOf(handler);
    if (index >= 0) {
      bucket.splice(index, 1);
    }
    return this;
  }

  /**
   * Registers a one-time event listener.
   */
  once<T extends BotEvent>(event: T, handler: BotEventMap[T]): this {
    const wrapper = ((...args: Parameters<BotEventMap[T]>) => {
      this.off(event, wrapper as BotEventMap[T]);
      return (
        handler as unknown as (...inner: Parameters<BotEventMap[T]>) => void | Promise<void>
      )(...args);
    }) as unknown as BotEventMap[T];
    return this.on(event, wrapper);
  }

  /**
   * Starts long polling for bot updates.
   */
  async startPolling(options: PollingOptions = {}): Promise<void> {
    if (this.polling) {
      return;
    }
    this.polling = true;
    this.pollingOptions = { ...this.pollingOptions, ...options, autoStart: true };
    this.pollingAbort = new AbortController();
    void this.pollLoop();
  }

  /**
   * Stops long polling.
   */
  async stopPolling(): Promise<void> {
    this.polling = false;
    this.pollingAbort?.abort();
    this.pollingAbort = undefined;
  }

  /**
   * Starts a built-in HTTP server that receives webhook updates.
   */
  async startWebhook(options: WebhookServerOptions = {}): Promise<void> {
    const config = { ...this.webhookOptions, ...options };
    this.webhookOptions = config;
    const path = config.path ?? '/';
    const host = config.host ?? '0.0.0.0';
    const port = config.port ?? 3000;

    const handler = createWebhookHandler({
      secretToken: config.secretToken,
      onUpdate: (update) => this.processUpdate(update),
      onError: (error) => this.emit('error', error),
    });

    if (this.webhookServer) {
      return;
    }

    this.webhookServer = createServer(async (req, res) => {
      if (req.method !== 'POST' || req.url?.split('?')[0] !== path) {
        respond(res, 404, { ok: false });
        return;
      }
      try {
        const body = await readJsonBody(req);
        const result = await handler({
          headers: normalizeHeaders(req.headers),
          body,
        });
        respond(res, result.status, result.body);
      } catch (error) {
        await this.emit('error', error);
        respond(res, 500, { ok: false });
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.webhookServer!.once('error', reject);
      this.webhookServer!.listen(port, host, () => resolve());
    });
  }

  /**
   * Stops the built-in webhook server.
   */
  async stopWebhook(): Promise<void> {
    if (!this.webhookServer) {
      return;
    }
    const server = this.webhookServer;
    this.webhookServer = undefined;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  /**
   * Processes a single update and dispatches events.
   */
  async processUpdate(update: Update): Promise<void> {
    await this.emit('update', update);
    if (update.message) {
      await this.emit('message', update.message, update);
    }
    if (update.edited_message) {
      await this.emit('edited_message', update.edited_message, update);
    }
    if (update.callback_query) {
      await this.emit('callback_query', update.callback_query, update);
    }
  }

  /**
   * Sends a text message to a chat.
   */
  async reply(message: Message, text: string, extra: Record<string, unknown> = {}): Promise<Message> {
    return this.sendMessage({
      chat_id: message.chat.id,
      text,
      reply_to_message_id: message.message_id,
      ...extra,
    });
  }

  /**
   * Answers a callback query and optionally sends a toast.
   */
  async answer(query: CallbackQuery, text?: string, showAlert = false): Promise<boolean> {
    return this.answerCallbackQuery({
      callback_query_id: query.id,
      text,
      show_alert: showAlert,
    });
  }

  private async pollLoop(): Promise<void> {
    while (this.polling) {
      try {
        const updates = await this.getUpdates({
          offset: this.offset,
          timeout: this.pollingOptions.timeout,
          limit: this.pollingOptions.limit,
          allowed_updates: this.pollingOptions.allowed_updates,
          signal: this.pollingAbort?.signal,
        });
        let processed = 0;
        for (const update of updates) {
          if (update.update_id < this.offset) {
            continue;
          }
          this.offset = Math.max(this.offset, update.update_id + 1);
          await this.processUpdate(update);
          processed += 1;
        }
        if (processed === 0) {
          await sleep(this.pollingOptions.interval ?? 1000);
        }
      } catch (error) {
        if (!this.polling || isAbortError(error)) {
          return;
        }
        await this.emit('polling_error', error);
        if (error instanceof RiseonlyError && error.retryAfter) {
          await sleep(error.retryAfter * 1000);
        } else {
          await sleep(this.pollingOptions.interval ?? 1000);
        }
      }
    }
  }

  private async emit<T extends BotEvent>(
    event: T,
    ...args: Parameters<BotEventMap[T]>
  ): Promise<void> {
    for (const listener of [...this.listeners[event]]) {
      try {
        await (listener as (...inner: Parameters<BotEventMap[T]>) => void | Promise<void>)(...args);
      } catch (error) {
        await this.emit('error', error);
      }
    }
  }
}

function normalizePollingOptions(
  value: BotOptions['polling'],
): PollingOptions & { autoStart: boolean } {
  if (!value) {
    return { interval: 1000, timeout: 30, limit: 100, autoStart: false };
  }
  if (value === true) {
    return { interval: 1000, timeout: 30, limit: 100, autoStart: true };
  }
  return {
    interval: 1000,
    timeout: 30,
    limit: 100,
    autoStart: true,
    ...value,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function normalizeHeaders(
  headers: IncomingMessage['headers'],
): Record<string, string | string[] | undefined> {
  const normalized: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key] = value;
  }
  return normalized;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function respond(res: ServerResponse, status: number, body?: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(body === undefined ? undefined : JSON.stringify(body));
}
