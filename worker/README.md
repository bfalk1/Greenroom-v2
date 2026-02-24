# Greenroom Preview Worker

Generates MP3 previews for Greenroom samples. Runs on Railway.

## What it does

- Checks for published samples missing previews every 5 minutes
- Downloads the original WAV from Supabase storage
- Converts to 30-second, 128kbps MP3 using ffmpeg
- Uploads to the `previews` bucket
- Updates the sample's `previewUrl` in the database

## Deploy to Railway

1. Create a new project on [Railway](https://railway.app)
2. Connect this repo (or the `worker` directory)
3. Add environment variables:
   - `DATABASE_URL` - Postgres connection string
   - `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
   - `CRON_SCHEDULE` (optional) - Cron expression, default `*/5 * * * *`

4. Deploy!

## Local Development

```bash
cp .env.example .env
# Fill in your credentials
npm install
npx prisma generate
node index.js
```

## Why MP3 previews?

- **Theft prevention**: 30-second 128kbps MP3 is useless for production
- **Full files stay protected**: WAVs require purchase to download
- **Industry standard**: Same approach as Splice, Loopcloud, etc.
