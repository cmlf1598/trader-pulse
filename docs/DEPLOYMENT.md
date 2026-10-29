# Production deployment

How TraderPulse runs in production, how to redeploy each half, and the smoke tests that prove the
**Frontend → Backend → AI** chain works. Background on why it is shaped this way is in
[ARCHITECTURE.md → Deployment topology](../ARCHITECTURE.md#7-deployment-topology).

## 1. Live environment

| | Value |
| --- | --- |
| Frontend (Vercel) | https://traderpulse-ten.vercel.app — project `cmlf1598s-projects/traderpulse` |
| Backend (Cloud Run) | https://traderpulse-api-549697455926.northamerica-south1.run.app — service `traderpulse-api` |
| GCP project | `ai-native-dev-513023` |
| Region | `northamerica-south1` (Querétaro, the closest Cloud Run region to the team) |
| Image | `northamerica-south1-docker.pkg.dev/ai-native-dev-513023/traderpulse/traderpulse-api:<tag>` |
| Runtime identity | `traderpulse-api-sa@ai-native-dev-513023.iam.gserviceaccount.com` |
| Secret | `traderpulse-gemini-key` (Secret Manager) → env `GEMINI_API_KEY` |
| Resources | 1 CPU / 512 MiB, `--allow-unauthenticated` |

Backend environment on Cloud Run:

| Variable | Source | Value |
| --- | --- | --- |
| `GEMINI_API_KEY` | Secret Manager `traderpulse-gemini-key:latest` | — |
| `ENVIRONMENT` | plain env | `production` (hides `/docs`, CORS allows only `FRONTEND_URL`) |
| `FRONTEND_URL` | plain env | `https://traderpulse-ten.vercel.app` |

Frontend environment on Vercel (Production): `NEXT_PUBLIC_API_URL` = the Cloud Run URL above.
Yahoo Finance (`yfinance`) needs no credentials.

## 2. One-time setup (already done)

Recorded for rebuilding the environment in a fresh project. Run from `backend/` with
`PROJECT_ID`, `REGION=northamerica-south1` set.

```bash
gcloud config set project $PROJECT_ID
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com secretmanager.googleapis.com iam.googleapis.com

# Dedicated runtime identity instead of the default compute service account.
gcloud iam service-accounts create traderpulse-api-sa --display-name="TraderPulse API (Cloud Run)"
SA=traderpulse-api-sa@$PROJECT_ID.iam.gserviceaccount.com

# Secret: read the key from stdin so it never appears in shell history.
printf '%s' "<gemini-api-key>" | gcloud secrets create traderpulse-gemini-key \
  --replication-policy=automatic --data-file=-
# Accessor is granted on this one secret only, not project-wide.
gcloud secrets add-iam-policy-binding traderpulse-gemini-key \
  --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor

gcloud artifacts repositories create traderpulse --repository-format=docker --location=$REGION
```

Vercel: `npx vercel link --project traderpulse` from `frontend/`, then
`npx vercel env add NEXT_PUBLIC_API_URL production`.

## 3. Redeploying

### Backend

From `backend/`:

```bash
TAG=$(date +%Y%m%d-%H%M%S)
gcloud builds submit --config cloudbuild.yaml --substitutions=_TAG=$TAG .
gcloud run deploy traderpulse-api \
  --image=northamerica-south1-docker.pkg.dev/$PROJECT_ID/traderpulse/traderpulse-api:$TAG \
  --region=northamerica-south1 \
  --service-account=traderpulse-api-sa@$PROJECT_ID.iam.gserviceaccount.com \
  --memory=512Mi --cpu=1 \
  --set-secrets=GEMINI_API_KEY=traderpulse-gemini-key:latest \
  --set-env-vars=ENVIRONMENT=production,FRONTEND_URL=https://traderpulse-ten.vercel.app \
  --allow-unauthenticated
```

- [`cloudbuild.yaml`](../backend/cloudbuild.yaml) builds the Dockerfile's `runtime` target with
  BuildKit enabled (the Dockerfile uses `RUN --mount=type=cache`).
- [`.gcloudignore`](../backend/.gcloudignore) keeps `.env` and `.venv/` out of the source upload.
  Check with `gcloud meta list-files-for-upload .` if you change it.
- A revision with invalid settings exits at startup, and traffic stays on the previous revision.

**Rotating the Gemini key:** `printf '%s' "<new-key>" | gcloud secrets versions add traderpulse-gemini-key --data-file=-`,
then deploy a new revision (`gcloud run services update traderpulse-api --region=northamerica-south1`)
so instances pick up `latest`.

### Frontend

From `frontend/`: `npx vercel --prod`. `NEXT_PUBLIC_API_URL` is frozen into the bundle at build
time, so changing it on Vercel requires another `vercel --prod`.

### CORS sync

If the Vercel production domain ever changes (custom domain, renamed project):

```bash
gcloud run services update traderpulse-api --region=northamerica-south1 \
  --update-env-vars=FRONTEND_URL=https://<new-domain>
```

The backend compares origins as exact strings, so use the bare `https://host` with no trailing path.
Vercel **preview** URLs are not in the allow-list by design.

## 4. Smoke tests

Run after every deploy. `API` and `WEB` are the two URLs from section 1.

```bash
API=https://traderpulse-api-549697455926.northamerica-south1.run.app
WEB=https://traderpulse-ten.vercel.app
```

| # | Check | Command | Expected |
| --- | --- | --- | --- |
| 1 | Backend liveness | `curl -s $API/api/v1/health` | `200`, `{"status":"active","version":"1.0.0","environment":"production"}` |
| 1b | Service index | `curl -s $API/` | `200`, `name`, `version`, absolute `https://…/api/v1/health` link, `"docs": null` |
| 2 | Secret mounted | (implied by 1) | The service only boots if `GEMINI_API_KEY` resolved and settings validated |
| 3 | CORS allows the frontend | `curl -si -X OPTIONS $API/api/v1/stocks/AAPL -H "Origin: $WEB" -H "Access-Control-Request-Method: GET"` | `200`, `access-control-allow-origin: $WEB` |
| 4 | CORS rejects others | same, with `-H "Origin: https://evil.example"` | `400`, no `access-control-allow-origin` |
| 5 | API docs hidden in prod | `curl -s -o /dev/null -w "%{http_code}" $API/docs` | `404` |
| 6 | Market data (Yahoo Finance) | `curl -s $API/api/v1/stocks/AAPL` | `200`, quote JSON with `price` |
| 7 | AI sentiment (Gemini) | `curl -s $API/api/v1/sentiment/AAPL` | `200`, `sentiment`, `confidence`, `justification` |
| 8 | Frontend up | `curl -s -o /dev/null -w "%{http_code}" $WEB/` | `200` |
| 9 | Frontend wired to backend | grep the `/_next/static/**.js` chunks served by `$WEB` for the Cloud Run hostname | found |
| 10 | Browser handshake | Open `$WEB`, pick a symbol | Quote and chart load, AI sentiment card fills in, DevTools shows no CORS errors |

Checks 3–7 cover the server side of the handshake; check 10 is the human end-to-end confirmation.

### Results — 2026-10-28 (initial deploy, revision `traderpulse-api-00002-jt6`)

| # | Result |
| --- | --- |
| 1 | ✅ `200` `{"status":"active","version":"1.0.0","environment":"production"}` |
| 3 | ✅ `200`, `access-control-allow-origin: https://traderpulse-ten.vercel.app` |
| 4 | ✅ `400`, no allow-origin header |
| 5 | ✅ `404` |
| 6 | ✅ `200` in 0.6 s (AAPL 343.83 USD) |
| 7 | ✅ `200`, Gemini returned `neutral` / 0.65 with justification and key factors; cached repeat 0.3 s |
| 8 | ✅ `200` |
| 9 | ✅ Cloud Run hostname present in the production JS bundle |
| 10 | ✅ Confirmed manually in the browser: dashboard loads and talks to the API |

### Results — 2026-10-28 (`GET /` index, revision `traderpulse-api-00003-448`)

| # | Result |
| --- | --- |
| 1 | ✅ `200` `{"status":"active","version":"1.0.0","environment":"production"}` |
| 1b | ✅ `200`, health link is `https://traderpulse-api-549697455926.northamerica-south1.run.app/api/v1/health`, `docs` is `null` |
| 5 | ✅ `404` |
| — | ✅ `ENVIRONMENT`, `FRONTEND_URL` and the `GEMINI_API_KEY` secret mapping carried over to the new revision |
