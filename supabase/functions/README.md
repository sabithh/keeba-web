# Supabase Edge Functions

Functions included:

- `chat-message`: builds personalized context from profile/documents/history and streams Claude output.
- `extract-document-text`: fetches a file from Supabase Storage and extracts text (text files directly, image/PDF through Claude when API key is set).

## Deploy

From project root:

```bash
supabase functions deploy chat-message
supabase functions deploy extract-document-text
```

## Required Secrets

```bash
supabase secrets set ANTHROPIC_API_KEY=your_key_here
```

Supabase automatically injects `SUPABASE_URL` and `SUPABASE_ANON_KEY` into Edge Functions.
