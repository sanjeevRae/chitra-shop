# Secrets Rotation Runbook — Chitra E-commerce

**Purpose:** This document lists every key currently stored in `.env.local`, its provider rotation URL, and the procedure to revoke/regenerate and redeploy credentials.

**IMPORTANT:** Do not commit `.env.local` or any file containing real secrets to Git. `.env*` is gitignored via `.gitignore` line 34.

---

## Keys in `.env.local` and Rotation URLs

| Key | Provider | Rotation URL | Secret Level |
|-----|----------|--------------|--------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | https://supabase.com/dashboard | Public (URL only) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | https://supabase.com/dashboard/project/kbgshexjackuikkveohe/settings/api | Public (anon key) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | https://supabase.com/dashboard/project/kbgshexjackuikkveohe/settings/api | **CRITICAL** — full DB admin access |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Cloudinary | https://console.cloudinary.com | Public (cloud name) |
| `CLOUDINARY_UPLOAD_PRESET` | Cloudinary | https://console.cloudinary.com/settings/uploads | Public-ish (preset name) |
| `CLOUDINARY_1_CLOUD_NAME` | Cloudinary | https://console.cloudinary.com | Public |
| `CLOUDINARY_1_API_KEY` | Cloudinary | https://console.cloudinary.com | **SECRET** |
| `CLOUDINARY_1_API_SECRET` | Cloudinary | https://console.cloudinary.com | **CRITICAL** |
| `CLOUDINARY_2_CLOUD_NAME` | Cloudinary | https://console.cloudinary.com | Public |
| `CLOUDINARY_2_API_KEY` | Cloudinary | https://console.cloudinary.com | **SECRET** |
| `CLOUDINARY_2_API_SECRET` | Cloudinary | https://console.cloudinary.com | **CRITICAL** |
| `CLOUDINARY_3_CLOUD_NAME` | Cloudinary | https://console.cloudinary.com | Public |
| `CLOUDINARY_3_API_KEY` | Cloudinary | https://console.cloudinary.com | **SECRET** |
| `CLOUDINARY_3_API_SECRET` | Cloudinary | https://console.cloudinary.com | **CRITICAL** |
| `GROQ_API_KEY` | Groq | https://console.groq.com/keys | **CRITICAL** |
| `BREVO_API_KEY` | Brevo | https://app.brevo.com/settings/api | **CRITICAL** |
| `RESEND_API_KEY` | Resend | https://resend.com/api-keys | **CRITICAL** |
| `SMTP_HOST` | Your SMTP provider | Provider dashboard | **SECRET** |
| `SMTP_USER` | Your SMTP provider | Provider dashboard | **SECRET** |
| `SMTP_PASS` | Your SMTP provider | Provider dashboard | **CRITICAL** |
| `SMTP_FROM` | Your SMTP provider | Provider dashboard | Public |

---

## Rotation Procedure

### Step 1: Check for historical leaks

Before rotating, verify whether `.env.local` (or any secrets file) was ever committed to Git:

```bash
git log --all --full-history -- .env.local
```

If any commits appear, those commits contain exposed secrets. Treat all keys in those commits as **compromised** and rotate them immediately.

### Step 2: Revoke and regenerate each key

For each key marked **CRITICAL** or **SECRET**:

1. Open the provider's rotation URL listed above.
2. Revoke the current key / secret (this invalidates the old value immediately).
3. Generate a new key / secret.
4. Copy the new value (do not save it in any local file yet).

**Priority order:**
1. `SUPABASE_SERVICE_ROLE_KEY` — full database admin access; rotate first
2. `CLOUDINARY_*_API_SECRET` (all 3 accounts) — full control over image storage
3. `GROQ_API_KEY` — AI search query expansion
4. `BREVO_API_KEY` / `RESEND_API_KEY` — email sending (spam risk if abused)
5. `SMTP_PASS` / `SMTP_USER` — email account access

### Step 3: Update deployment platform environment variables

Add each new value to your deployment platform (Vercel, Railway, Render, Fly.io, etc.) via the platform's environment variables dashboard or CLI. Do **not** write them to `.env.local`.

Example for Vercel:
```bash
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add CLOUDINARY_1_API_SECRET
# ... repeat for each secret
```

### Step 4: Delete `.env.local`

```bash
rm .env.local
```

### Step 5: Verify the application still works

Deploy with the new environment variables and confirm:
- Admin login works
- Product uploads work via `/api/cloudinary?action=sign`
- Order checkout computes correct totals
- Email notifications send correctly

---

## `NEXT_PUBLIC_` Variable Audit

The following `NEXT_PUBLIC_` variables are **not secrets** and are safe to keep with the prefix:
- `NEXT_PUBLIC_SUPABASE_URL` — public project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public-facing anon key (RLS-protected)
- `NEXT_PUBLIC_SITE_URL` — public site URL
- `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` — public cloud name

The following was **removed from `NEXT_PUBLIC_`**:
- `CLOUDINARY_UPLOAD_PRESET` (was `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`) — preset name kept server-side only

No other `NEXT_PUBLIC_` variables contain secret values.

---

## Pre-Commit Protection

A gitleaks pre-commit hook is installed at `.husky/pre-commit`. It runs `gitleaks protect` on every commit to prevent accidental secret commits.

```bash
# Install husky (one-time setup)
npx husky init
npm install --save-dev gitleaks
```

## Emergency Contact

If you suspect any secret has been exposed beyond `.env.local`:
1. Rotate all **CRITICAL** keys immediately
2. Review Git history with `git log --all -p -- .env.local`
3. Check Cloudinary and Supabase audit logs for unusual activity
