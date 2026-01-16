# GitHub Actions Setup Guide

This guide explains how to set up the daily automated model retraining workflow using GitHub Actions.

## Overview

The automated retraining workflow (`daily-retrain.yml`) runs daily at **3:00 AM UTC** and can also be triggered manually. It:
- Fetches latest market data from Yahoo Finance
- Trains the selected model on new data
- Evaluates performance against threshold
- Uploads successful models to the dashboard
- Logs training metrics and experiments
- Archives artifacts for analysis

## Prerequisites

- GitHub repository with Actions enabled
- Weights & Biases (W&B) account for logging (optional but recommended)
- Dashboard API running and accessible from GitHub Actions
- Python 3.11+ (provided by ubuntu-latest runner)

## Configuration Steps

### 1. Generate API Keys

#### Experiment API Key
Create a long-lived API key for experiments logging:
- In dashboard `.env`, add: `EXPERIMENT_API_KEYS=your_secure_key_here`
- Store this securely

#### Upload Service Token
For uploading trained models:
- Generate: `openssl rand -hex 32`
- Add to `.env`: `UPLOAD_SERVICE_TOKEN=your_upload_token`
- Store securely

#### Weights & Biases API Key (Optional)
- Go to [wandb.ai](https://wandb.ai)
- Account Settings → API keys
- Copy your API key

### 2. Add GitHub Secrets

1. Go to your GitHub repository
2. Settings → Secrets and variables → Actions
3. Create the following **Repository Secrets**:

| Secret Name | Value | Required |
|---|---|---|
| `EXPERIMENT_API_KEY` | Your experiment API key | ✅ Yes |
| `UPLOAD_SERVICE_TOKEN` | Your upload service token | ✅ Yes |
| `WANDB_API_KEY` | Your W&B API key | ❌ Optional |
| `DASHBOARD_API_URL` | Your dashboard URL (e.g., `https://dashboard.example.com`) | ✅ Yes |

**Steps to add each secret:**
1. Click "New repository secret"
2. Enter Name (from table above)
3. Paste Value
4. Click "Add secret"

### 3. Verify Workflow File

The workflow file is already configured at `.github/workflows/daily-retrain.yml`.

Key sections:

```yaml
# Trigger: Daily at 3 AM UTC
on:
  schedule:
    - cron: '0 3 * * *'
  
  # Also allow manual trigger
  workflow_dispatch:
    inputs:
      model_type:
        description: 'Model type to train'
        default: 'LSTM'

# Environment variables (uses secrets)
env:
  WANDB_API_KEY: ${{ secrets.WANDB_API_KEY }}
  EXPERIMENT_API_KEY: ${{ secrets.EXPERIMENT_API_KEY }}
  UPLOAD_SERVICE_TOKEN: ${{ secrets.UPLOAD_SERVICE_TOKEN }}
  DASHBOARD_API_URL: ${{ secrets.DASHBOARD_API_URL }}
```

### 4. Configure Workflow Inputs (Optional)

Edit `.github/workflows/daily-retrain.yml` to customize:

```yaml
model_type:           # Default model to train (LSTM, XGBoost, etc.)
symbols:              # Stock symbols to train on (comma-separated)
target_accuracy:      # Minimum accuracy threshold (default: 0.55)
target_improvement:   # Minimum improvement % (default: 0.01)
log_to_wandb:         # Enable W&B logging (default: false)
```

## Triggering Workflows

### Automatic (Daily Schedule)
- Runs automatically every day at **3:00 AM UTC**
- No action needed

### Manual Trigger (Workflow Dispatch)

1. Go to GitHub repo → Actions tab
2. Select "Daily Model Retrain" workflow
3. Click "Run workflow"
4. Select branch (main)
5. Optionally configure inputs:
   - Model type (LSTM, XGBoost, etc.)
   - Stock symbols (e.g., AAPL,BTC-USD,ETH-USD)
   - Accuracy threshold
6. Click "Run workflow"

## Monitoring Workflow Status

### View Workflow Runs

1. Go to Actions tab in GitHub
2. Click "Daily Model Retrain" in left sidebar
3. See list of all runs with status:
   - ✅ Completed (green checkmark)
   - ❌ Failed (red X)
   - ⏳ In Progress (yellow circle)

### Inspect Run Details

1. Click on any run to see details
2. View steps:
   - `Setup Python`
   - `Install dependencies`
   - `Fetch market data`
   - `Train model`
   - `Upload artifacts`
3. Click any step to see full logs

### Troubleshooting via Logs

If a run fails:

1. Click the failed run
2. Click the failed step (usually "Train model")
3. Review error messages
4. Common issues:
   - **API authentication failed**: Check EXPERIMENT_API_KEY secret
   - **Model not saved**: Check UPLOAD_SERVICE_TOKEN
   - **Network timeout**: Increase timeout (120 mins default)
   - **Out of memory**: Consider GPU runner (see advanced setup)

## Advanced Configuration

### GPU-Accelerated Training (Self-Hosted Runner)

For faster training with GPU:

1. **Set up self-hosted runner:**
   ```bash
   # On your GPU machine:
   mkdir ~/github-runner
   cd ~/github-runner
   curl -o actions-runner-linux-x64-2.311.0.tar.gz \
     https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz
   tar xzf ./actions-runner-linux-x64-2.311.0.tar.gz
   ./config.sh --url https://github.com/your-repo --token <TOKEN>
   sudo ./run.sh
   ```

2. **Update workflow:**
   ```yaml
   runs-on: [self-hosted, gpu]  # Instead of ubuntu-latest
   ```

### Conditional Model Upload

The workflow uploads models only if:
- Training completes without errors
- Model accuracy ≥ `target_accuracy` threshold (default 55%)
- Model improvement ≥ threshold (optional)

Customize in workflow:
```yaml
- run: python scripts/retrain/train_and_upload.py \
    --threshold-accuracy 0.60 \
    --upload
```

### Slack Notifications

Add Slack notifications on failure:

```yaml
- name: Notify Slack on failure
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK }}
    payload: |
      {
        "text": "❌ Model retraining failed",
        "blocks": [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "Workflow run: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
            }
          }
        ]
      }
```

### Email Notifications

GitHub Actions automatically sends emails on workflow failure to repository admins. Configure in:
- Settings → Notifications → Email notifications for failures

## Local Testing

### Run Workflow Locally with `act`

```bash
# Install act: https://github.com/nektos/act
brew install act

# Run workflow locally
act -s EXPERIMENT_API_KEY=test_key \
    -s UPLOAD_SERVICE_TOKEN=test_token \
    -s WANDB_API_KEY=test_wandb \
    -s DASHBOARD_API_URL=http://localhost:3000
```

### Manual Python Execution

```bash
# Install dependencies
pip install -r scripts/retrain/requirements.txt

# Fetch data
python scripts/retrain/fetch_data.py \
  --output data/latest.csv \
  --symbols AAPL,BTC-USD

# Train model
python scripts/retrain/train_and_upload.py \
  --data-path data/latest.csv \
  --model-type LSTM \
  --threshold-accuracy 0.55 \
  --log-to-wandb \
  --upload
```

## Performance & Costs

### GitHub Actions Free Tier
- **2000 minutes/month** for private repos (50 months of daily runs!)
- **Unlimited** for public repos
- Each daily run ~15-30 minutes depending on data/model complexity

### Optimization Tips
- Use `cache` action to skip pip installs:
  ```yaml
  - uses: actions/cache@v3
    with:
      path: ~/.cache/pip
      key: ${{ runner.os }}-pip
  ```
- Reduce lookback days for faster training:
  ```yaml
  - run: python scripts/retrain/fetch_data.py \
      --lookback-days 180
  ```
- Use lightweight models (Random Forest, XGBoost) instead of deep learning

## Security Best Practices

### Secret Management
- ✅ Use GitHub Secrets (encrypted, only visible in logs if explicitly printed)
- ✅ Rotate API keys monthly
- ✅ Use separate service accounts for CI/CD
- ✅ Never commit `.env` files with secrets

### Network Security
- ✅ Use HTTPS for dashboard URL
- ✅ Restrict API key permissions (read-only where possible)
- ✅ Monitor API usage for unusual activity
- ❌ Don't use personal tokens in CI/CD

### Code Security
- ✅ Review workflow YAML before merge
- ✅ Use pinned action versions (e.g., `actions/setup-python@v4` not `@main`)
- ✅ Limit workflow permissions:
  ```yaml
  permissions:
    contents: read
    actions: write
  ```

## Troubleshooting

### Issue: "Secret EXPERIMENT_API_KEY not found"

**Solution:**
1. Go to Settings → Secrets and variables → Actions
2. Verify secret exists and name is exact match
3. Recreate if needed

### Issue: "403 Unauthorized when uploading model"

**Solution:**
1. Check UPLOAD_SERVICE_TOKEN is correct
2. Verify token isn't expired (regenerate if needed)
3. Check dashboard API endpoint is accessible from GitHub runners (may need firewall rule)

### Issue: "CUDA out of memory"

**Solution:**
- Use self-hosted GPU runner (see Advanced Configuration)
- Or reduce batch size in `train_and_upload.py`:
  ```python
  BATCH_SIZE = 16  # Instead of 32
  ```

### Issue: "Workflow timeout (120 min exceeded)"

**Solution:**
1. Use smaller dataset (reduce `--lookback-days`)
2. Use faster model (Random Forest instead of LSTM)
3. Use self-hosted GPU runner
4. Increase timeout in workflow (line 18):
   ```yaml
   timeout-minutes: 180
   ```

### Issue: "Data not fetched / yfinance error"

**Solution:**
1. Check internet connectivity (GitHub runners have full outbound access)
2. Verify stock symbols are valid (e.g., "AAPL", "BTC-USD")
3. Check yfinance isn't rate-limited:
   ```bash
   python -c "import yfinance; df = yfinance.download('AAPL', period='1y')"
   ```

## Next Steps

1. ✅ Add secrets to GitHub (Section 2)
2. ✅ Push workflow file to `.github/workflows/`
3. ✅ Create test run manually (Actions tab → Run workflow)
4. ✅ Monitor logs and verify success
5. ✅ Set up Slack notifications (optional, Advanced section)
6. ✅ Configure GPU runner if needed (optional, Advanced section)

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- [Secrets Encryption](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Python Setup Action](https://github.com/actions/setup-python)
- [Caching Dependencies](https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows)

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review workflow logs in GitHub Actions UI
3. Test script locally with `act` or Python directly
4. Check GitHub Actions status page: https://www.githubstatus.com/
