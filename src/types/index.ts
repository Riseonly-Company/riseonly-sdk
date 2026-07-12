import type { BotApiMethod, ChatAction, CommandScope, UpdateType } from '../constants.js';

export interface ApiResponse<T> {
  ok: true;
  result: T;
}

export interface ApiErrorResponse {
  ok: false;
  error_code: number;
  description: string;
  parameters?: {
    retry_after?: number;
  };
}

export type ApiEnvelope<T> = ApiResponse<T> | ApiErrorResponse;

export interface Capabilities {
  platform: string;
  api_version: string;
  canonical_endpoint: string;
  compatible_endpoint: string;
  authorization: string;
  idempotency_header: string;
  webhook_secret_header: string;
  update_delivery: string[];
  mini_app_production_scheme: string;
  methods: BotApiMethod[];
}

export interface ClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  requestTimeoutMs?: number;
  useCompatibleEndpoint?: boolean;
}

export interface RequestOptions {
  requestId?: string;
  signal?: AbortSignal;
}

export interface User {
  id: string;
  is_bot: boolean;
  first_name: string;
  name?: string;
  username?: string;
  description?: string;
  avatar_url?: string;
  banner_url?: string;
  is_premium?: boolean;
  is_official?: boolean;
  is_online?: boolean;
  last_seen?: string;
  bot_owner_id?: string;
  can_join_groups?: boolean;
  supports_inline_queries?: boolean;
  privacy_mode?: boolean;
}

export interface Chat {
  id: string;
  type: 'private' | 'group' | 'channel' | string;
  title?: string;
  username?: string;
  description?: string;
  avatar_url?: string;
  member_count?: number;
}

export interface MediaVariant {
  variant_type?: string;
  width?: number;
  height?: number;
  size?: number;
  file_url?: string;
  file_id?: string;
  bitrate?: number;
  quality?: string;
}

export interface MediaFile {
  type?: string;
  media_type?: string;
  file_id?: string;
  file_url?: string;
  thumbnail_url?: string;
  duration?: number;
  width?: number;
  height?: number;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
  bitrate?: number;
  fps?: number;
  codec?: string;
  sticker_id?: string;
  pack_id?: string;
  sticker_type?: string;
  associated_emojis?: string[];
  variants?: MediaVariant[];
}

export interface MessageEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: User;
}

export interface WebAppInfo {
  url: string;
  bot_id?: string;
  mini_app_id?: string;
}

export interface InlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
  web_app?: WebAppInfo;
}

export interface ReplyKeyboardButton {
  text: string;
  request_contact?: boolean;
  request_location?: boolean;
  web_app?: WebAppInfo;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface ReplyKeyboardMarkup {
  keyboard: ReplyKeyboardButton[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
  selective?: boolean;
}

export interface ReplyKeyboardRemove {
  remove_keyboard: true;
  selective?: boolean;
}

export interface ForceReply {
  force_reply: true;
  selective?: boolean;
}

export type ReplyMarkup =
  | InlineKeyboardMarkup
  | ReplyKeyboardMarkup
  | ReplyKeyboardRemove
  | ForceReply;

export interface WebAppData {
  data: string;
  button_text: string;
}

export interface ForwardOrigin {
  chat_id: string;
  message_id: string;
  sender_id?: string;
  sender_name?: string;
  sender_logo?: string;
  date?: number;
  forward_chain_count?: number;
  original_message_id?: string;
}

export interface ReactionCount {
  reaction: string;
  count: number;
  reacted_by_you?: boolean;
}

export interface Message {
  message_id: string;
  date: number;
  timestamp?: number;
  chat: Chat;
  from?: User;
  text?: string;
  content?: string;
  original_content?: string;
  content_type?: string;
  is_edited?: boolean;
  is_bot_message?: boolean;
  edit_date?: number;
  caption?: string;
  entities?: MessageEntity[];
  reply_markup?: ReplyMarkup;
  web_app_data?: WebAppData;
  reply_to_message?: Message;
  forward_origin?: ForwardOrigin;
  via_bot?: User;
  message_thread_id?: string;
  temp_id?: string;
  media_items?: MediaFile[];
  photo?: MediaFile[];
  video?: MediaFile;
  video_note?: MediaFile;
  audio?: MediaFile;
  voice?: MediaFile;
  document?: MediaFile;
  animation?: MediaFile;
  sticker?: MediaFile;
  reactions?: ReactionCount[];
}

export interface CallbackQuery {
  id: string;
  from: User;
  message?: Message;
  inline_message_id?: string;
  chat_instance?: string;
  data?: string;
  game_short_name?: string;
}

export interface Update {
  update_id: number;
  message?: Message;
  edited_message?: Message;
  callback_query?: CallbackQuery;
  chat_member?: unknown;
  my_chat_member?: unknown;
}

export interface BotCommand {
  command: string;
  description: string;
}

export interface WebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
  allowed_updates?: UpdateType[];
  enabled?: boolean;
}

export interface SetWebhookResult {
  url: string;
  enabled: boolean;
}

export interface SendMessageOptions {
  chat_id: string;
  text?: string;
  caption?: string;
  parse_mode?: string;
  disable_notification?: boolean;
  reply_to_message_id?: string;
  reply_markup?: ReplyMarkup;
  requestId?: string;
}

export interface SendMediaOptions {
  chat_id: string;
  caption?: string;
  disable_notification?: boolean;
  reply_to_message_id?: string;
  reply_markup?: ReplyMarkup;
  requestId?: string;
}

export interface EditMessageTextOptions {
  chat_id?: string;
  message_id?: string;
  inline_message_id?: string;
  text: string;
  parse_mode?: string;
  reply_markup?: ReplyMarkup;
  requestId?: string;
}

export interface DeleteMessageOptions {
  chat_id: string;
  message_id: string;
  requestId?: string;
}

export interface SendChatActionOptions {
  chat_id: string;
  action: ChatAction;
  requestId?: string;
}

export interface GetUpdatesOptions {
  offset?: number;
  limit?: number;
  timeout?: number;
  allowed_updates?: UpdateType[];
  requestId?: string;
  signal?: AbortSignal;
}

export interface SetWebhookOptions {
  url: string;
  secret_token?: string;
  max_connections?: number;
  allowed_updates?: UpdateType[];
  drop_pending_updates?: boolean;
  requestId?: string;
}

export interface DeleteWebhookOptions {
  drop_pending_updates?: boolean;
  requestId?: string;
}

export interface SetMyCommandsOptions {
  commands: BotCommand[];
  scope?: CommandScope;
  language_code?: string;
  requestId?: string;
}

export interface GetMyCommandsOptions {
  scope?: CommandScope;
  language_code?: string;
  requestId?: string;
}

export interface DeleteMyCommandsOptions {
  scope?: CommandScope;
  language_code?: string;
  requestId?: string;
}

export interface AnswerCallbackQueryOptions {
  callback_query_id: string;
  text?: string;
  show_alert?: boolean;
  url?: string;
  requestId?: string;
}

export interface GetChatOptions {
  chat_id: string;
  requestId?: string;
}

export type MediaInput = string | { file_id?: string; url?: string };

export interface PollingOptions {
  interval?: number;
  timeout?: number;
  limit?: number;
  allowed_updates?: UpdateType[];
  autoStart?: boolean;
}

export interface WebhookServerOptions {
  path?: string;
  host?: string;
  port?: number;
  secretToken?: string;
}

export interface BotOptions extends ClientOptions {
  polling?: boolean | PollingOptions;
  webhook?: false | WebhookServerOptions;
  allowed_updates?: UpdateType[];
}

export type MessageHandler = (message: Message, update: Update) => void | Promise<void>;
export type EditedMessageHandler = (message: Message, update: Update) => void | Promise<void>;
export type CallbackQueryHandler = (query: CallbackQuery, update: Update) => void | Promise<void>;
export type UpdateHandler = (update: Update) => void | Promise<void>;
export type ErrorHandler = (error: unknown) => void | Promise<void>;
export type PollingErrorHandler = (error: unknown) => void | Promise<void>;

export type BotEventMap = {
  message: MessageHandler;
  edited_message: EditedMessageHandler;
  callback_query: CallbackQueryHandler;
  update: UpdateHandler;
  polling_error: PollingErrorHandler;
  error: ErrorHandler;
};

export type BotEvent = keyof BotEventMap;
