# EnvShare

EnvShare is a zero-knowledge team secret sharing app for `.env` files. Teams upload encrypted env values from the browser or CLI. The backend stores only ciphertext and metadata; plaintext values and team keys never leave the user's device.

## Demo GIF / Video

Demo placeholder: add a 30-60 second walkthrough GIF or MP4 here.

![Demo GIF placeholder](./assets/demo-placeholder.gif)

## Problem

Teams often share `.env` files through chat, email, or screenshots. Those secrets remain in chat history, are hard to rotate, and are easy to lose or overwrite. EnvShare keeps secrets in the browser or CLI, encrypts them before upload, and tracks version history so a team can safely pull the latest environment file.

## Features

- Google sign-in through Supabase
- Team-based project and environment management
- Client-side AES-256-GCM encryption with a team key stored in the browser
- Version history and diff view for environment changes
- One-time share links for brief secret handoff
- CLI login and push/pull workflow using personal API tokens
- Audit log for push, pull, invite, join, removal, and project creation events

## How the encryption works

1. A team owner creates a team and a random AES-256-GCM key in the browser.
2. The browser exports the key as base64 and stores it in `localStorage` for the team.
3. Before upload, the browser encrypts the `.env` text with a random 12-byte IV.
4. The server receives only `ciphertext`, `iv`, and key names; no plaintext env values or team keys are sent.
5. To read a version, the browser fetches the encrypted blob and decrypts it locally using the saved team key.

The invite flow uses the URL fragment trick: the team key is appended after `#` in the invite URL and is read on the `/invite/[token]` page before Google login. This preserves the key client-side and keeps it out of the server.

## How auth works

- Web app: Google login is handled by Supabase Auth.
- Backend: FastAPI verifies each Supabase access token by calling Supabase `/auth/v1/user` before trusting it.
- CLI: a personal API token is created in the web app at `/settings/cli`, stored as a SHA-256 hash on the backend, and sent as a bearer token in `Authorization`.

## Tech stack

- Frontend: Next.js, TypeScript, Tailwind, Zustand
- Backend: FastAPI, SQLAlchemy, PostgreSQL/Supabase
- Encryption: Web Crypto API in the browser, Node `crypto` in the CLI
- Auth: Supabase Google provider
- Hosting: Vercel + Render

## Setup instructions

### 1) Prerequisites

- Node.js 18+
- Python 3.11+
- A Supabase project with:
  - project URL
  - anon key
  - Postgres connection string
- Google OAuth configured in Supabase and Google Cloud Console

### 2) Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# edit .env with your Supabase and database values
uvicorn app.main:app --reload
```

### 3) Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

### 4) CLI

```bash
cd cli
npm install
node bin/envshare.js --help
```

## Local URLs

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- API docs: http://localhost:8000/docs

## Known limits

- Lost team key means lost data. There is no recovery path.
- Invite links are single-use and expire after 24 hours.
- Removing a member does not rotate the team key. Create a new team key and re-push if you need a stronger boundary.
- This project intentionally avoids enterprise features such as SAML, per-environment role separation, and secret rotation automation.

## Future work

- Team key rotation
- Per-environment permission policies
- GitHub Actions integration for CI secret pulls
- Device-code login for the CLI instead of pasting an API token

## Live URL

Placeholder: add the deployed Vercel URL here once it is live.

https://your-app.vercel.app
