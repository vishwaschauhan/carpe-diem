#!/usr/bin/env bash
# Deploy Carpe Diem to Cloud Run. Usage: ./deploy.sh <gcp-project-id> [region]
set -euo pipefail
PROJECT="${1:?Usage: ./deploy.sh <gcp-project-id> [region]}"
REGION="${2:-us-central1}"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project "$PROJECT"
gcloud run deploy carpe-diem --source . --project "$PROJECT" --region "$REGION" \
  --allow-unauthenticated --port 8080 --memory 256Mi --min-instances 0 --max-instances 2
