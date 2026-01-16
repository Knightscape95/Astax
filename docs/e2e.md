# End-to-End (E2E) Test Guide

This guide explains how to validate the core end-to-end flows and how to run the automated E2E checks provided in `scripts/e2e`.

## Goals
- Validate experiment tracking (Colab -> Experiments API -> Dashboard)
- Verify metrics ingestion and retrieval
- Validate model creation flow (via API)

## Running automated E2E checks

1. Ensure the dev server is running: `pnpm dev`
2. Set an experiment API key (used by Colab):

   ```bash
   export EXPERIMENT_API_KEY=your_test_api_key
   # Windows PowerShell
   # $env:EXPERIMENT_API_KEY = 'your_test_api_key'
   ```

3. Run the E2E script:

   ```bash
   pnpm e2e:experiments
   ```

4. The script will:
   - Create a test experiment via `POST /api/experiments` using `X-API-Key`
   - Post a small batch of epoch metrics to `/api/experiments/:id/metrics`
   - Fetch the experiment list and verify the experiment is present
   - Clean up by marking the experiment as `cancelled` (so test artifacts are visible but non-active)

## Notes
- The script uses `EXPERIMENT_API_KEY` environment variable. Configure `EXPERIMENT_API_KEYS` or `EXPERIMENT_API_KEY` in your `.env.local` if running the server.
- Some checks (model file upload) require an authenticated session and are not included in this automated script.
