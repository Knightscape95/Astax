# Local Training Quick Start

Run the daily retraining pipeline locally for testing and development.

## Prerequisites

- Python 3.11+
- Git
- Dashboard API running locally (or accessible URL)

## Setup

### 1. Install Dependencies

```bash
cd scripts/retrain
pip install -r requirements.txt
```

### 2. Set Environment Variables

```bash
# Option A: Export in terminal
export EXPERIMENT_API_KEY="your_api_key"
export UPLOAD_SERVICE_TOKEN="your_upload_token"
export DASHBOARD_API_URL="http://localhost:3000"
export WANDB_API_KEY="your_wandb_key"  # Optional

# Option B: Create .env file
cat > .env << EOF
EXPERIMENT_API_KEY=your_api_key
UPLOAD_SERVICE_TOKEN=your_upload_token
DASHBOARD_API_URL=http://localhost:3000
WANDB_API_KEY=your_wandb_key
EOF

# Then load it:
source .env
```

### 3. Fetch Market Data

```bash
python fetch_data.py \
  --output data/latest.csv \
  --symbols "AAPL,BTC-USD,ETH-USD" \
  --lookback-days 365
```

Output: `data/latest.csv` with OHLCV data

### 4. Train Model

```bash
python train_and_upload.py \
  --data-path data/latest.csv \
  --model-type LSTM \
  --symbol AAPL \
  --threshold-accuracy 0.55 \
  --log-to-wandb \
  --log-experiments \
  --upload
```

**Options:**
- `--model-type`: LSTM, XGBoost, RandomForest, Transformer, DNN, RL
- `--threshold-accuracy`: Min accuracy to upload (default 0.55)
- `--log-to-wandb`: Enable Weights & Biases logging
- `--log-experiments`: Log to dashboard experiments API
- `--upload`: Upload model to dashboard if passes threshold

**Output:**
- `output/model.onnx` - Trained model in ONNX format
- `checkpoints/checkpoint_*.pt` - Model checkpoint for resuming

## Full Pipeline (Data → Train → Upload)

```bash
# 1. Fetch fresh data
python fetch_data.py \
  --output data/$(date +%Y%m%d).csv \
  --symbols "AAPL" \
  --lookback-days 365

# 2. Train new model
python train_and_upload.py \
  --data-path data/$(date +%Y%m%d).csv \
  --model-type LSTM \
  --symbol AAPL \
  --log-experiments \
  --upload

# If successful, check dashboard UI for new model!
```

## Testing

### Run Unit Tests

```bash
# Install test dependencies
pip install pytest pytest-mock

# Run tests
python -m pytest test_train_and_upload.py -v

# Run specific test
python -m pytest test_train_and_upload.py::test_load_and_preprocess_data -v
```

### Run E2E Script

```bash
cd ../../
node scripts/e2e/run_experiments_e2e.js
```

## Troubleshooting

### ImportError: No module named 'torch'

```bash
# Install missing package
pip install torch

# Or install all requirements
pip install -r requirements.txt
```

### Connection refused to localhost:3000

```bash
# Make sure dashboard is running:
npm run dev

# Or use remote dashboard:
export DASHBOARD_API_URL="https://your-dashboard.com"
```

### Model accuracy below threshold

- Increase epochs in `train_and_upload.py`
- Use different `--model-type`
- Use longer `--lookback-days` for data
- Reduce `--threshold-accuracy` to test

### ONNX export fails

```bash
# Ensure onnx tools are installed
pip install onnx onnxruntime skl2onnx

# Try simpler model
python train_and_upload.py \
  --model-type XGBoost \
  --data-path data/latest.csv
```

## Debugging

### Enable verbose logging

```bash
# Add to script or set env var
export DEBUG=1

python train_and_upload.py \
  --data-path data/latest.csv \
  --model-type LSTM
```

### Inspect checkpoint

```python
import torch

checkpoint = torch.load('checkpoints/checkpoint_lstm_2024-01-15T10:30:00.pt')
print(checkpoint.keys())
print(checkpoint['epoch'])
```

### Monitor W&B run

After training with `--log-to-wandb`:
1. Go to [wandb.ai](https://wandb.ai)
2. Project: `traycer-e2e`
3. See real-time metrics, loss curves, and comparison between runs

## Next: Automated Scheduling

For daily automated runs, see [GitHub Actions Setup](./github_actions_setup.md)
