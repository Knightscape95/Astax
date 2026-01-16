# Getting Started

This guide helps new users get the Traycer training and dashboard pipeline running.

## Prerequisites

- Google account for Google Colab
- Git and Node.js (for running local dev server)
- Basic knowledge of Python notebooks

## Quickstart

1. Clone the repository and install dependencies:

   ```bash
   git clone <repo-url>
   cd money
   pnpm install # or npm install
   ```

2. Start the dev server (for dashboard and APIs):

   ```bash
   pnpm dev
   ```

3. Open the Colab notebook in `notebooks/traycer_ml_pipeline.ipynb` (File > Upload notebook) and follow the sections:
   - Install dependencies
   - Configure experiment parameters
   - Train and export models

4. Upload exported `model.onnx` via the dashboard `Models > Upload Model` page.

## Notes

- Experiments can be logged directly from Colab using the Experiments API and an API key (see `docs/e2e.md`).
- If you're using W&B, ensure you log the `wandb_run_id` in the experiment payload so it appears in the dashboard.
