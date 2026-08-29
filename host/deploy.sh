#!/usr/bin/env bash
set -euo pipefail

PROJECT="${PROJECT:-beautysales}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-vendas-api}"
IMAGE="${IMAGE:-${REGION}-docker.pkg.dev/${PROJECT}/vendas/api:latest}"
SA="vendas-api@${PROJECT}.iam.gserviceaccount.com"
SQL_INSTANCE="${PROJECT}:${REGION}:starter-postgres-db"
ROOT="$(cd "$(dirname "$0")" && pwd)"

docker build --platform linux/amd64 -t "$IMAGE" "$ROOT"
docker push "$IMAGE"

gcloud run deploy "$SERVICE" \
  --project="$PROJECT" \
  --region="$REGION" \
  --image="$IMAGE" \
  --service-account="$SA" \
  --add-cloudsql-instances="$SQL_INSTANCE" \
  --set-secrets="DATABASE_URL=vendas-database-url:latest,HOST_PASSWORD=vendas-host-password:latest,SESSION_SECRET=vendas-session-secret:latest,PAIRING_CODE=vendas-pairing-code:latest" \
  --cpu=1 \
  --memory=512Mi \
  --timeout=120 \
  --concurrency=20 \
  --min-instances=0 \
  --max-instances=3 \
  --allow-unauthenticated \
  --port=8080

gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)'
