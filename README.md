# @riseonly/sdk

Official Riseonly Bot API SDK for Node.js.

## Install

```bash
npm install @riseonly/sdk
```

## Quick start

```js
import { RiseonlyBot } from '@riseonly/sdk';

const bot = new RiseonlyBot(process.env.BOT_TOKEN, { polling: true });

bot.command('start', async (message) => {
  await bot.reply(message, 'Welcome to Riseonly');
});

bot.hears(/hello/i, (message) => bot.reply(message, 'Hi!'));
bot.action(/^track:/, (query) => bot.answer(query, 'Loading track…'));
bot.catch((error) => console.error('Bot handler failed', error));
```

## Bot API client

Use `ApiClient` when you only need HTTP methods without event loop helpers:

```js
import { ApiClient } from '@riseonly/sdk';

const api = new ApiClient(process.env.BOT_TOKEN, {
  baseUrl: 'http://localhost:8080',
});

const me = await api.getMe();
console.log(`Connected as @${me.username}`);
await api.sendMessage({ chat_id: 'chat-id', text: 'hello' });
```

## Webhooks

### Built-in server

```js
import { RiseonlyBot } from '@riseonly/sdk';

const bot = new RiseonlyBot(process.env.BOT_TOKEN);

bot.on('message', async (message) => {
  await bot.reply(message, 'got it');
});

await bot.setWebhook({
  url: 'https://example.com/hook',
  secret_token: 'my-secret',
});

await bot.startWebhook({
  path: '/hook',
  port: 3000,
  secretToken: 'my-secret',
});
```

Webhook handlers return a retryable HTTP 500 when your application handler fails. Updates are acknowledged only after handlers finish successfully.

## Configure from code

Keep bot commands and delivery configuration in source control instead of repeating setup by hand:

```js
await bot.setup({
  name: 'Music Bot',
  description: 'Find and preview music',
  profilePhoto: { url: 'https://cdn.example.com/music-bot.jpg' },
  commands: [
    { command: 'start', description: 'Start the bot' },
    { command: 'help', description: 'Show help' },
  ],
  webhook: false,
});

await bot.launch();
```

Use `webhook: { url, secret_token }` to configure webhook delivery instead. `bot.stop()` gracefully stops polling and the built-in webhook server.

Profile settings written by `setup()` use the same backend source of truth as the Riseonly owner settings screen, so changes are immediately visible in the app. Individual `setMyName`, `getMyName`, `setMyDescription`, `getMyDescription`, `setMyProfilePhoto`, and `removeMyProfilePhoto` methods are also available.

## Media metadata

Remote HTTPS media can include metadata used by Riseonly clients:

```js
await bot.sendAudio({
  url: 'https://cdn.example.com/song.mp3',
  file_name: 'Artist - Song.mp3',
  mime_type: 'audio/mpeg',
  thumbnail_url: 'https://cdn.example.com/cover.jpg',
  duration: 180,
}, {
  chat_id: 'chat-id',
  caption: 'Artist — Song',
});
```

## Express / Fastify webhook adapter

```js
import express from 'express';
import { createWebhookHandler } from '@riseonly/sdk';

const app = express();
app.use(express.json());

const handleWebhook = createWebhookHandler({
  secretToken: process.env.WEBHOOK_SECRET,
  onUpdate: (update) => bot.processUpdate(update),
});

app.post('/hook', async (req, res) => {
  const result = await handleWebhook({ headers: req.headers, body: req.body });
  res.status(result.status).json(result.body);
});
```

## Mini app init data

```js
import { verifyInitData, extractInitDataFromLaunchUrl } from '@riseonly/sdk';

const initData = extractInitDataFromLaunchUrl(launchUrl);
const fields = verifyInitData(process.env.BOT_TOKEN, initData);
const user = JSON.parse(fields.user);
```

## Supported methods

- `getMe`
- `sendMessage`
- `sendPhoto`, `sendVideo`, `sendDocument`, `sendAudio`, `sendVoice`, `sendAnimation`
- `editMessageText`
- `deleteMessage`
- `sendChatAction`
- `getUpdates`
- `setWebhook`, `deleteWebhook`, `getWebhookInfo`
- `setMyCommands`, `getMyCommands`, `deleteMyCommands`
- `answerCallbackQuery`
- `getChat`

## Idempotency

Pass `requestId` to any method that supports retries:

```js
import { createRequestId } from '@riseonly/sdk';

const requestId = createRequestId();
await bot.sendMessage({
  chat_id: 'chat-id',
  text: 'safe retry',
  requestId,
});
```

## TypeScript

The package ships with full type definitions. Import types directly:

```ts
import type { Message, Update, InlineKeyboardMarkup } from '@riseonly/sdk';
```

## Local development

```bash
npm install
npm test
npm run build
```

Point the SDK to a local api-gateway:

```js
const bot = new RiseonlyBot(token, {
  baseUrl: 'http://localhost:8080',
  polling: true,
});
```

## Release channels

CI bumps versions automatically via `publish-prod.yml`:

- push to `staging` → prerelease bump → publish `next` (OIDC)
- merge to `main` with `deploy` label → patch bump → publish `latest` (OIDC)

Manual dispatch is also available from GitHub Actions.

```bash
npm install @riseonly/sdk
npm install @riseonly/sdk@next
```

## License

MIT
