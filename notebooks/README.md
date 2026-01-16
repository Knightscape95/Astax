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
