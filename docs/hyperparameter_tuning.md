# Hyperparameter Tuning Guide

This document gives beginner-friendly advice on tuning key hyperparameters for each model type.

## General Tips
- Use a validation set or cross-validation for reliable comparisons.
- Start with coarse grid or random search, then refine with Bayesian or Optuna.
- Keep experiments reproducible: log seeds, config, and W&B runs.

## Model-specific suggestions
- LSTM / Transformer:
  - Learning rate: 1e-4 to 1e-2
  - Hidden size / d_model: 64, 128, 256
  - Batch size: 32, 64
  - Number of epochs: 10–100 depending on dataset
- DNN:
  - Learning rate: 1e-4 to 1e-2
  - Hidden layers and units: 1–3 layers, 64–512 units
  - Regularization: dropout 0.1–0.5, L2 weight decay
- XGBoost / Random Forest:
  - n_estimators: 50–500
  - max_depth: 3–10
  - learning_rate (XGBoost): 0.01–0.3
- RL (PPO):
  - learning_rate: 1e-5 to 1e-3
  - n_steps: 128–2048
  - batch size (minibatch): 64–256

## Using Optuna
- For automated tuning, use Optuna and persist trials to W&B or a database so you can resume.
- Limit trial max runtime (Colab free tier) and use pruning to save resources.
