# Model Selection Guide

This guide explains when to choose different model families supported by Traycer.

- LSTM: Good for sequence prediction when you have time series data and want to predict future values using recurrent models.
- Transformer: Preferred for longer sequences where attention mechanisms reduce recurrence-related training issues.
- DNN: Simple feed-forward networks for tabular / engineered features and quick prototyping.
- Random Forest: Fast baseline for tabular data with interpretability and less hyperparameter tuning.
- XGBoost: High-performance gradient-boosted trees often used for tabular prediction tasks; strong baseline.
- RL (PPO): Use when framing trading as a sequential decision-making problem with discrete actions.

Tips:
- Start with a fast tree-based baseline (XGBoost / RF) to establish a performance baseline quickly.
- Use neural models (LSTM / Transformer / DNN) when you need to model temporal dynamics or complex feature interactions.
- Use RL only when you can simulate rewards reliably and have sufficient training time.
