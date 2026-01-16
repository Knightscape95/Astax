# Google Colab ML Training Pipeline

This directory contains the training pipeline for Traycer models.

## How to use

1. Download the `traycer_ml_pipeline.ipynb` file from this directory.
2. Go to [Google Colab](https://colab.research.google.com/).
3. Click **File** > **Upload notebook**.
4. Select the `traycer_ml_pipeline.ipynb` file.
5. Follow the instructions in the notebook to:
   - Install dependencies.
   - Configure your model (select Ticker, Date Range, Model Type).
   - Train the model.
   - Export the model as `model.onnx`.
6. Download the `model.onnx` file from the Colab file browser.
7. Upload the `model.onnx` file to the Traycer Dashboard.

---

## End-to-end checklist (for testers)

- [ ] Run the notebook for each model type (LSTM, Transformer, DNN, Random Forest, XGBoost, RL)
- [ ] Verify ONNX export (use `onnx.checker.check_model` in notebook)
- [ ] Log experiment metadata via the `POST /api/experiments` endpoint and include `wandb_run_id` if using W&B
- [ ] Post epoch metrics to `/api/experiments/:id/metrics` and confirm they appear in the dashboard
- [ ] Upload the ONNX file to the dashboard and ensure the model appears in `Models` list
- [ ] Verify checkpoint resume works by saving and loading a checkpoint after reconnect
- [ ] Run the `pnpm e2e:experiments` script to validate the experiments API flow (see `docs/e2e.md`)

## Supported Models
- LSTM
- XGBoost
- Transformer
- DNN
- Random Forest
- Reinforcement Learning (PPO)

## Requirements
- Google Account (for Colab)
- Basic understanding of trading parameters (Timeframe, Ticker)
