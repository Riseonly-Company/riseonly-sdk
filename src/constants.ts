export const DEFAULT_API_BASE = 'https://api.riseonly.net';

export const CANONICAL_API_PREFIX = '/api/bot/v1';

export const WEBHOOK_SECRET_HEADER = 'x-riseonly-bot-api-secret-token';

export const IDEMPOTENCY_HEADER = 'x-request-id';

export const SUPPORTED_METHODS = [
  'getMe',
  'sendMessage',
  'sendPhoto',
  'sendVideo',
  'sendDocument',
  'sendAudio',
  'sendVoice',
  'sendAnimation',
  'editMessageText',
  'deleteMessage',
  'sendChatAction',
  'getUpdates',
  'setWebhook',
  'deleteWebhook',
  'getWebhookInfo',
  'setMyCommands',
  'getMyCommands',
  'deleteMyCommands',
  'answerCallbackQuery',
  'getChat',
] as const;

export type BotApiMethod = (typeof SUPPORTED_METHODS)[number];

export const UPDATE_TYPES = [
  'message',
  'edited_message',
  'callback_query',
  'chat_member',
  'my_chat_member',
] as const;

export type UpdateType = (typeof UPDATE_TYPES)[number];

export const CHAT_ACTIONS = [
  'typing',
  'upload_photo',
  'record_video',
  'upload_video',
  'record_voice',
  'upload_voice',
  'upload_document',
  'choose_sticker',
  'find_location',
  'record_video_note',
  'upload_video_note',
] as const;

export type ChatAction = (typeof CHAT_ACTIONS)[number];

export const COMMAND_SCOPES = [
  'default',
  'all_private_chats',
  'all_group_chats',
  'all_chat_administrators',
] as const;

export type CommandScope = (typeof COMMAND_SCOPES)[number] | `chat:${string}` | `chat_administrators:${string}`;
