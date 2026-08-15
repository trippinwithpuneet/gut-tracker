# Self-hosting Gut Tracker

Two ways to run this. Pick based on whether you want accounts.

## Option 1 — local only, no setup

```bash
npm install && npm run dev
```

No Supabase, no Google project, no environment variables. Data lives in the browser's IndexedDB, sign-in is hidden, and every feature works. Back up with Export in the You tab.

This is the right choice for one person on one device, and it is the most private option available.

## Option 2 — with accounts and sync

You'll need a Supabase project (free tier is ample) and a Google OAuth client. Budget about twenty minutes the first time.

### 1. Create the Supabase project

Sign up at [supabase.com](https://supabase.com), create a project, and note the region — put it near yourself.

From **Project Settings → API**, copy:

- the **Project URL**
- the **anon** / **publishable** key

Both are safe in a browser. Row-level security is what protects the data, and it is enabled on every table in the schema. Do not copy the service-role key; nothing in this codebase uses it.

### 2. Apply the schema

```bash
npm install -g supabase       # if you don't have the CLI
supabase link --project-ref <your-project-ref>
supabase db push
```

This creates every table, the row-level security policies, and seeds the curated symptom and food-tag libraries.

Sanity-check the migrations first if you like — this needs no Docker and no project:

```bash
npm run db:check
```

### 3. Set up Google sign-in

In the [Google Cloud console](https://console.cloud.google.com):

1. Create a project.
2. **APIs & Services → OAuth consent screen**. Choose **External**. Fill in the app name, your support email, and a privacy policy URL — this app serves one at `/privacy`, so use `https://your-domain/privacy`.
3. Scopes: you only need `email`, `profile`, and `openid`. These are **non-sensitive**, which means you can publish to production without going through Google's verification review. Do not add any others; anything sensitive triggers a review process that takes weeks.
4. **Credentials → Create credentials → OAuth client ID → Web application**.
5. Under **Authorised redirect URIs**, add the callback URL from your Supabase dashboard. It looks like `https://<project-ref>.supabase.co/auth/v1/callback`.
6. Copy the client ID and client secret.

Back in Supabase: **Authentication → Providers → Google**. Enable it, paste the client ID and secret, save.

Finally, in **Authentication → URL Configuration**, set the Site URL to your deployed domain and add `https://your-domain/auth/callback` to the redirect allow-list. For local development also add `http://localhost:3000/auth/callback`.

> While the consent screen is in **Testing** status, only accounts you list as test users can sign in, capped at 100. Publish it to production when you're ready — with only non-sensitive scopes this needs no review.

### 4. Configure the app

```bash
cp .env.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon key>
```

`npm run dev`. Sign-in now appears in the You tab.

### 5. Deploy

Any Next.js host works. On Vercel:

1. Import the repository.
2. Add the same two environment variables.
3. Deploy.

Then go back and make sure your deployed URL is in both the Supabase redirect allow-list and the Google authorised redirect URIs. Forgetting this is the single most common reason sign-in fails in production and works locally.

## Verifying it works

Worth doing once, because a mistake here is silent:

1. Sign out. Log three days. Confirm they're there.
2. Sign in with Google. The You tab should offer to move your local data across — accept it, and confirm the entries appear unchanged.
3. Sign in from a second Google account. It must see **none** of the first account's data. If it does, row-level security is not applied — stop and re-run `supabase db push`.
4. Export from the You tab and confirm the JSON contains your entries.

## Costs

Supabase free tier and Vercel hobby cover a personal instance comfortably. A row of logging is a few hundred bytes; a year of daily use is well under a megabyte.

Note that Supabase pauses free projects after a week of inactivity. It resumes on the next request, but the first load will be slow.

## Upgrading

```bash
git pull
npm install
supabase db push   # only if supabase/migrations changed
```

Migrations are additive. If you added library entries of your own, put them in a new migration rather than editing the generated seed — it gets overwritten by `npm run db:gen-seed`.
