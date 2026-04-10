# Supabase Edge Functions

Functions included:

- `chat-message`: builds personalized context from profile/documents/history and streams Claude output.
- `extract-document-text`: fetches a file from Supabase Storage and extracts text (text files directly, image/PDF through Claude when API key is set).
- `telegram-link-code`: creates a short-lived one-time code for linking a Telegram chat to an authenticated Keeba user.
- `telegram-webhook`: receives Telegram webhook updates, links chats with `/start <code>`, and sends Keeba replies.

## Deploy

From project root:

```bash
supabase functions deploy chat-message
supabase functions deploy extract-document-text
supabase functions deploy telegram-link-code
supabase functions deploy telegram-webhook
```

## Required Secrets

```bash
supabase secrets set ANTHROPIC_API_KEY=your_key_here
supabase secrets set TELEGRAM_BOT_TOKEN=your_bot_token_here
supabase secrets set TELEGRAM_WEBHOOK_SECRET=your_random_secret
supabase secrets set TELEGRAM_BOT_USERNAME=your_bot_username_without_at
```

Supabase automatically injects `SUPABASE_URL` and `SUPABASE_ANON_KEY` into Edge Functions.

## Telegram Webhook Registration

After deploying `telegram-webhook`, set webhook URL to your Supabase function endpoint:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
	-d "url=https://<your-project-ref>.supabase.co/functions/v1/telegram-webhook" \
	-d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

Verify webhook status:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```
