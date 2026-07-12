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

bot.on('message', async (message) => {
  if (message.text === '/start') {
    await bot.sendMessage({
      chat_id: message.chat.id,
      text: 'welcome to riseonly',
    });
  }
});
```

## Bot API client

Use `ApiClient` when you only need HTTP methods without event loop helpers:

```js
import { ApiClient } from '@riseonly/sdk';

const api = new ApiClient(process.env.BOT_TOKEN, {
  baseUrl: 'http://localhost:8080',
});

const me = await api.getMe();
await api.sendMessage({ chat_id: me.id, text: 'hello' });
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

### Express / Fastify adapter

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

CI bumps versions automatically:

- merge to `main` with `deploy` label → patch bump → publish `latest`
- push to `staging` → prerelease bump (`x.y.z-next.N`) → publish `next`

Manual dispatch is also available from GitHub Actions.

```bash
npm install @riseonly/sdk
npm install @riseonly/sdk@next
```

## License

MIT
