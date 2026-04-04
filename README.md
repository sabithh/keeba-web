# Keeba

Keeba is a personal AI web app with profile memory, document storage, and contextual chat.

## Architecture

- Frontend: Next.js 14 + Tailwind + TypeScript (deploy on Vercel)
- Backend platform: Supabase only
  - Postgres (data)
  - Auth (email/password sessions)
  - Storage (documents)
  - Edge Functions (`chat-message`, `extract-document-text`)
- AI: Anthropic Claude (`claude-sonnet-4-6`)

## Project Layout

```
/keeba
  /client
    /app
    /components
    /lib
      api.ts
      auth.ts
      supabase.ts
  /supabase
    schema.sql
    /functions
      /chat-message
        index.ts
      /extract-document-text
        index.ts
  /server               # legacy from previous architecture, not required for deployment
```

## 1. Create Supabase Project

1. Create a new Supabase project.
2. Go to SQL Editor and run `supabase/schema.sql`.
3. In Authentication settings, enable Email/Password sign-in.
4. Decide whether email confirmation is required:
   - Enabled: users must verify email before first login.
   - Disabled: users can sign in immediately.

## 2. Deploy Edge Functions

Install and login with Supabase CLI, then deploy:

```bash
supabase functions deploy chat-message
supabase functions deploy extract-document-text
```

Set Claude key for function runtime:

```bash
supabase secrets set ANTHROPIC_API_KEY=your_anthropic_key
```

Function notes:

- `chat-message`: loads user profile, documents, and recent chat history; streams Claude response; stores messages.
- `extract-document-text`: extracts text from text files directly and uses Claude extraction for image/PDF when key is set.

## 3. Configure Frontend Env (Vercel)

Add these in Vercel Project Settings -> Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

If your Supabase dashboard only shows `sb_publishable` keys, you can use:

```
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_sb_publishable_key
```

If chat shows `Invalid JWT`, set this using the legacy anon key (JWT-style key):

```
NEXT_PUBLIC_SUPABASE_FUNCTIONS_KEY=your_legacy_anon_key
```

Optional override:

```
NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL=https://your-project-ref.supabase.co/functions/v1
```

If omitted, the app uses `NEXT_PUBLIC_SUPABASE_URL/functions/v1` automatically.

## 4. Deploy Frontend to Vercel

1. Push repo to GitHub.
2. Import project in Vercel.
3. Set project root to `client`.
4. Deploy.

## 5. Auto-Deploy Supabase Functions From GitHub

Workflow file: `.github/workflows/deploy-supabase-functions.yml`

Set these GitHub repository secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`

After that, any push to `main` that changes files under `supabase/functions/` will auto-deploy both edge functions.

## Local Development

From repo root:

```bash
npm install
npm run dev
```

This runs the Next.js client on `http://localhost:3000`.

Use `client/.env.local.example` as the template for `client/.env.local`.

## Supabase Storage Details

- Bucket: `keeba-files` (created by SQL script)
- Upload path format: `<auth_user_id>/<timestamp>-<filename>`
- Policies enforce per-user file ownership using folder prefix checks.

## Core Data Tables

- `profiles`
- `chat_messages`
- `documents`

All are protected with RLS and mapped to `auth.uid()` ownership.
