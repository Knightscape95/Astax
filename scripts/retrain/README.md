# Daily Retraining Pipeline

Automated scripts for daily model retraining on fresh market data.

## Overview

This pipeline:
1. **Fetches** latest OHLCV data from Yahoo Finance
2. **Trains** machine learning models (LSTM, XGBoost, Random Forest, etc.)
3. **Evaluates** model performance against baseline
4. **Uploads** models to dashboard if they pass accuracy threshold
5. **Logs** experiments and metrics to Weights & Biases

## Quick Start

### Local Development

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Fetch data
python fetch_data.py --output data/latest.csv --symbols AAPL,BTC-USD

# 3. Train model
python train_and_upload.py \
  --data-path data/latest.csv \
  --model-type LSTM \
  --log-to-wandb \
  --upload
```

### Automated via GitHub Actions

The workflow runs daily at 3 AM UTC. Configure secrets in GitHub Settings:
- `EXPERIMENT_API_KEY` - API key for logging experiments
- `UPLOAD_SERVICE_TOKEN` - Token for uploading trained models
- `DASHBOARD_API_URL` - Dashboard URL
- `WANDB_API_KEY` - (Optional) Weights & Biases API key

See [GitHub Actions Setup Guide](../docs/github_actions_setup.md) for detailed instructions.

## Scripts

### `fetch_data.py`
Downloads market data from Yahoo Finance.

**Usage:**
```bash
python fetch_data.py \
  --output data/latest.csv \
  --symbols "AAPL,BTC-USD,ETH-USD" \
  --lookback-days 365 \
  --interval 1d
```

**Options:**
- `--output` (required): Output CSV file path
- `--symbols`: Comma-separated symbols (default: AAPL,BTC-USD,ETH-USD)
- `--lookback-days`: Historical data window (default: 365)
- `--interval`: Data interval (1d, 1h, 15m) (default: 1d)

**Output CSV:**
```
date,open,high,low,close,volume,symbol
2024-01-15,150.0,151.5,149.5,150.5,1000000,AAPL
```

### `train_and_upload.py`
Main training orchestrator.

**Usage:**
```bash
python train_and_upload.py \
  --data-path data/latest.csv \
  --model-type LSTM \
  --symbol AAPL \
  --checkpoint-dir checkpoints/ \
  --output-dir output/ \
  --threshold-accuracy 0.55 \
  --log-to-wandb \
  --log-experiments \
  --upload
```

**Options:**
- `--data-path` (required): Input data CSV
- `--model-type`: LSTM, XGBoost, Transformer, DNN, RandomForest, RL (default: LSTM)
- `--symbol`: Stock symbol to train on (default: AAPL)
- `--checkpoint-dir`: Save/load checkpoint (default: checkpoints/)
- `--output-dir`: ONNX model output (default: output/)
- `--threshold-accuracy`: Min accuracy to upload (default: 0.55)
- `--threshold-improvement`: Min improvement % (default: 0.01)
- `--log-to-wandb`: Enable Weights & Biases logging
- `--log-experiments`: Log to dashboard experiments API
- `--upload`: Upload model to dashboard

**Output:**
- `output/model.onnx` - Trained model in ONNX format
- `checkpoints/checkpoint_*.pt` - PyTorch checkpoint
- Experiment logged to dashboard and W&B

**Environment Variables:**
- `DASHBOARD_API_URL` - Dashboard API endpoint
- `EXPERIMENT_API_KEY` - API key for experiments
- `UPLOAD_SERVICE_TOKEN` - Token for model upload
- `WANDB_API_KEY` - (Optional) W&B API key

### `test_train_and_upload.py`
Unit tests for training pipeline.

**Usage:**
```bash
# Install test dependencies
pip install pytest pytest-mock

# Run all tests
python -m pytest test_train_and_upload.py -v

# Run specific test
python -m pytest test_train_and_upload.py::test_load_and_preprocess_data -v

# Show coverage
pip install pytest-cov
python -m pytest test_train_and_upload.py --cov=train_and_upload
```

**Tests:**
- Data loading and preprocessing
- Model training (LSTM, XGBoost)
- Model evaluation
- ONNX export
- API upload (mocked)
- Experiment logging (mocked)
- Full pipeline integration

## Dependencies

See `requirements.txt` for complete list. Key packages:
- **pandas** - Data manipulation
- **numpy** - Numerical computing
- **torch** - Deep learning (LSTM)
- **xgboost** - Gradient boosting
- **scikit-learn** - ML utilities
- **yfinance** - Market data fetching
- **onnx** - Model export
- **wandb** - Experiment tracking (optional)
- **requests** - HTTP client

## Configuration

### Environment Variables

Create `.env` file in `scripts/retrain/`:

```bash
# API Configuration
DASHBOARD_API_URL=http://localhost:3000
EXPERIMENT_API_KEY=your_api_key_here
UPLOAD_SERVICE_TOKEN=your_upload_token_here

# Weights & Biases (optional)
WANDB_API_KEY=your_wandb_key_here
WANDB_PROJECT=traycer-e2e

# Training defaults
MODEL_TYPE=LSTM
SYMBOLS=AAPL,BTC-USD
TARGET_ACCURACY=0.55
```

### Model Configuration

Edit `train_and_upload.py` to customize:

```python
# Line 16-19
BATCH_SIZE = 32
EPOCHS = 10
LEARNING_RATE = 0.001
```

## Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ GitHub Actions Trigger (Daily 3 AM UTC or Manual)           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │  Step 1: Fetch Market Data      │
        │  fetch_data.py                  │
        │  Output: data/latest.csv        │
        └────────────┬───────────────────┘
                     │
                     ▼
        ┌────────────────────────────────┐
        │  Step 2: Train Model            │
        │  train_and_upload.py            │
        │  - Load data                    │
        │  - Initialize model             │
        │  - Train epochs                 │
        │  - Evaluate metrics             │
        │  - Save checkpoint              │
        └────────────┬───────────────────┘
                     │
                     ▼
        ┌────────────────────────────────┐
        │  Step 3: Check Threshold        │
        │  Accuracy >= 0.55? → YES/NO     │
        │  Improvement >= 1%? → YES/NO    │
        └────────────┬───────────────────┘
                     │
         ┌───────────┴──────────┐
         │                      │
    ✓ PASS              ✗ FAIL
         │                      │
         ▼                      ▼
    ┌─────────────────┐    ┌──────────────┐
    │ Export ONNX     │    │ Log failure  │
    │ Upload model    │    │ End          │
    │ Log experiment  │    └──────────────┘
    │ Notify success  │
    └─────────────────┘
```

## Monitoring

### Local Testing
```bash
# Manual run
python train_and_upload.py --data-path data/latest.csv

# With W&B logging
python train_and_upload.py \
  --data-path data/latest.csv \
  --log-to-wandb
```

### GitHub Actions
1. Go to Actions tab in GitHub
2. Click "Daily Model Retrain"
3. View latest run status
4. Click run to see detailed logs
5. Download artifacts:
   - `trained-model-*` - ONNX model
   - `checkpoint-*` - PyTorch checkpoints

### Weights & Biases
1. Go to [wandb.ai](https://wandb.ai)
2. Project: `traycer-e2e`
3. See training metrics, loss curves, model comparisons
4. Share results via link

### Dashboard API
Check uploaded models in dashboard:
- Models page shows latest trained models
- Performance metrics and comparison
- Export/download links

## Troubleshooting

### Common Issues

**"ImportError: No module named 'torch'"**
```bash
pip install -r requirements.txt
```

**"Connection refused to http://localhost:3000"**
- Ensure dashboard is running: `npm run dev`
- Or use remote URL: `export DASHBOARD_API_URL=https://your-dashboard.com`

**"Model accuracy below threshold (55%)"**
- Increase EPOCHS in train_and_upload.py
- Try different --model-type
- Use longer --lookback-days
- Check data quality

**"ONNX export failed"**
- Ensure onnx/skl2onnx installed: `pip install onnx skl2onnx`
- Try simpler model (XGBoost instead of LSTM)

### Debug Logs

Check detailed logs:
```bash
# Local
python train_and_upload.py --data-path data/latest.csv 2>&1 | tee train.log

# GitHub Actions
- Click run → Click step → View logs
```

## Best Practices

1. **Test locally first**
   ```bash
   python fetch_data.py --output test_data.csv --lookback-days 30
   python train_and_upload.py --data-path test_data.csv --threshold-accuracy 0.5
   ```

2. **Use version control**
   ```bash
   git add scripts/retrain/
   git commit -m "Update training config"
   git push
   ```

3. **Monitor metrics**
   - Check W&B project regularly
   - Compare new models to baseline
   - Track accuracy/loss trends

4. **Secure credentials**
   - Use GitHub Secrets (never hardcode)
   - Rotate API keys monthly
   - Restrict token permissions

5. **Handle failures gracefully**
   - Catch exceptions in train_and_upload.py
   - Log errors to W&B
   - Notify team on critical failures

## Performance

Typical run times:
- **Fetch data**: ~30-60 seconds
- **Train LSTM**: 5-15 minutes (CPU)
- **Train XGBoost**: 1-3 minutes
- **Upload/Log**: ~30 seconds
- **Total**: 10-30 minutes (CPU), 5-10 minutes (GPU)

To optimize:
- Use GPU runner for faster training
- Reduce lookback-days
- Use simpler model
- Cache pip dependencies

## Support

For issues:
1. See [GitHub Actions Setup](../docs/github_actions_setup.md)
2. See [Local Training Guide](../docs/local_training.md)
3. Check test coverage: `pytest test_train_and_upload.py -v`
4. Review troubleshooting section above
