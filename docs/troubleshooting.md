# Troubleshooting Guide

Common issues and fixes when running the training pipeline and dashboard integration.

## Colab dependency errors
- Symptom: ImportError for packages like `xgboost`, `wandb`, `optuna`.
- Fix: Ensure you run the dependencies cell in the notebook and restart the runtime. Use `pip install` at the top of the notebook.

## ONNX Export fails
- Symptom: ONNX model fails validation or `onnxruntime` cannot open the file.
- Fix: Check your model export step. For PyTorch, ensure you set the model to `eval()` and provide a proper input tensor shape when exporting. Verify with `onnx.checker.check_model`.

## Dashboard upload returns 401
- Symptom: Uploading model returns `Unauthorized` or session required errors.
- Fix: Model upload requires an authenticated session. Use the dashboard UI while signed in, or use the API with an authenticated session cookie.

## Experiments not appearing in dashboard
- Symptom: POSTing experiments from Colab succeeds but they don't show up in the dashboard.
- Fix: Ensure experiments are created using the `X-API-Key` header (Colab) or by an authenticated dashboard session. Verify the experiment has `wandb_run_id` if using W&B integration.

## Checkpoint resume doesn't restore state
- Symptom: After reconnecting to Colab, resuming from checkpoint yields different results or missing parameters.
- Fix: Checkpoint saving logic and ensure the checkpoint includes optimizer state, model state, and scheduler state. Confirm checkpoint load path and file integrity.

## Timeouts / Long training times
- Symptom: Training exceeds Colab free-tier limits.
- Fix: Reduce epochs, use smaller datasets, or use early stopping / pruning. Use smaller models for quick experiments.
