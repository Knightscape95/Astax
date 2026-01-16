# Getting Started Checklist

Complete these steps to activate daily automated model retraining.

## Phase 1: Configure GitHub Secrets (5 minutes)

- [ ] Go to GitHub Repository → Settings → Secrets and variables → Actions
- [ ] Create secret `EXPERIMENT_API_KEY`
  - [ ] Value: Your experiment API key (ask team or generate from dashboard config)
  - [ ] Click "Add secret"
- [ ] Create secret `UPLOAD_SERVICE_TOKEN`
  - [ ] Value: Your upload token (generate: `openssl rand -hex 32`)
  - [ ] Click "Add secret"
- [ ] Create secret `DASHBOARD_API_URL`
  - [ ] Value: Your dashboard URL (e.g., `https://dashboard.example.com` or `http://localhost:3000`)
  - [ ] Click "Add secret"
- [ ] (Optional) Create secret `WANDB_API_KEY`
  - [ ] Value: Your Weights & Biases API key from [wandb.ai](https://wandb.ai)
  - [ ] Click "Add secret"

**Verification:** Go back to Secrets and verify all 3-4 secrets appear in the list.

## Phase 2: Verify Code is Committed (2 minutes)

- [ ] Push workflow file to GitHub:
  ```bash
  git add .github/workflows/daily-retrain.yml
  git add scripts/retrain/*.py
  git add scripts/retrain/requirements.txt
  git commit -m "feat: Add GitHub Actions automated daily retraining workflow"
  git push origin main
  ```

- [ ] Verify files in GitHub UI:
  - [ ] `.github/workflows/daily-retrain.yml` exists
  - [ ] `scripts/retrain/train_and_upload.py` exists
  - [ ] `scripts/retrain/fetch_data.py` exists
  - [ ] `scripts/retrain/requirements.txt` exists

## Phase 3: Test Manually (5 minutes)

- [ ] Go to GitHub Repository → Actions tab
- [ ] Click "Daily Model Retrain" in left sidebar
- [ ] Click "Run workflow" button (top right)
- [ ] Select branch: `main`
- [ ] (Optional) Customize inputs:
  - Model type: LSTM (or XGBoost, RandomForest, etc.)
  - Leave other fields default
- [ ] Click "Run workflow" button

**Check status:**
- [ ] Yellow circle appears (in progress)
- [ ] Wait 2-5 minutes for run to complete
- [ ] Should turn green checkmark ✅ (success) or red X ❌ (failure)

**View logs:**
- [ ] Click the run row to expand
- [ ] Click each step to view logs:
  - "Setup Python" - should show Python 3.11
  - "Install dependencies" - should show pip packages installing
  - "Fetch market data" - should show data.csv being created
  - "Run training pipeline" - should show training progress
  - "Upload artifacts" - should show model.onnx saved
- [ ] Scroll through logs for any errors

## Phase 4: Verify Integration (5 minutes)

**Check Dashboard:**
- [ ] Go to dashboard Models page
- [ ] Should see new model from today (if upload succeeded)
- [ ] Model name format: `LSTM-AAPL-20240115...`
- [ ] Shows accuracy, test metrics, training duration

**Check Experiments (if --log-experiments was used):**
- [ ] Go to dashboard Experiments page
- [ ] Should see new experiment entry
- [ ] Name format: `auto-train-LSTM-20240115`
- [ ] Shows status, metrics, timestamp

**Check W&B (if --log-to-wandb was used):**
- [ ] Go to [wandb.ai](https://wandb.ai)
- [ ] Project: `traycer-e2e`
- [ ] Should see new run with training metrics
- [ ] Can view loss curves and compare runs

## Phase 5: Test Locally (Optional, 10 minutes)

For development and debugging:

- [ ] Install dependencies:
  ```bash
  cd scripts/retrain
  pip install -r requirements.txt
  ```

- [ ] Fetch test data:
  ```bash
  python fetch_data.py \
    --output data/test.csv \
    --symbols AAPL \
    --lookback-days 90
  ```

- [ ] Run training:
  ```bash
  export DASHBOARD_API_URL="http://localhost:3000"
  export EXPERIMENT_API_KEY="your_api_key"
  
  python train_and_upload.py \
    --data-path data/test.csv \
    --model-type LSTM \
    --threshold-accuracy 0.5
  ```

- [ ] Run tests:
  ```bash
  pip install pytest pytest-mock
  pytest test_train_and_upload.py -v
  ```

## Phase 6: Schedule Configuration (Optional, 2 minutes)

To change the daily run time:

- [ ] Edit `.github/workflows/daily-retrain.yml`
- [ ] Line 5: Change cron expression
  - Current: `0 3 * * *` (3 AM UTC every day)
  - Examples:
    - `0 0 * * *` = Midnight UTC
    - `0 12 * * *` = Noon UTC
    - `0 8 * * 1-5` = 8 AM UTC Mon-Fri
- [ ] Commit and push:
  ```bash
  git add .github/workflows/daily-retrain.yml
  git commit -m "chore: Update workflow schedule to 12 PM UTC"
  git push origin main
  ```

**Cron Reference:** [crontab.guru](https://crontab.guru)

## Phase 7: Documentation (Optional, 10 minutes)

Read comprehensive guides:

- [ ] [GitHub Actions Setup Guide](./docs/github_actions_setup.md)
  - Detailed setup with screenshots
  - Troubleshooting section
  - Advanced config (GPU, notifications)
  - Security best practices

- [ ] [Local Training Guide](./docs/local_training.md)
  - Run scripts locally
  - Debug issues
  - Test before pushing

- [ ] [Scripts README](./scripts/retrain/README.md)
  - Script documentation
  - Usage examples
  - Configuration reference
  - Performance metrics

## Troubleshooting Quick Reference

### ❌ Workflow Failed?

1. Check error message in logs:
   - Click Actions → Daily Model Retrain → Failed run
   - Click "Train model" step
   - Scroll to find red ERROR or exception

2. Common fixes:
   - **"Secrets not found"** → Go to Settings → Secrets, re-add all
   - **"Connection refused"** → Check `DASHBOARD_API_URL` is correct
   - **"Model accuracy 0.3 < threshold 0.55"** → Lower threshold or increase epochs
   - **"ImportError torch"** → Check requirements.txt installed
   - **"Timeout after 120 minutes"** → Use GPU runner or reduce data size

3. Test locally to debug:
   ```bash
   python scripts/retrain/train_and_upload.py --data-path test.csv
   ```

### ✅ All Tests Passed?

Great! The workflow is working:
- [ ] Runs daily at 3 AM UTC automatically
- [ ] Can trigger manually anytime from Actions tab
- [ ] Models appear in dashboard after each run
- [ ] Experiments logged to dashboard
- [ ] Metrics tracked in W&B

## Next: Ongoing Monitoring

Once configured:

**Daily:**
- Check if workflow ran successfully (Actions tab)
- Review model metrics in dashboard

**Weekly:**
- Compare model performance across runs
- Check W&B for training trends
- Monitor accuracy over time

**Monthly:**
- Analyze model drift/degradation
- Consider updating hyperparameters
- Review cost (GitHub Actions usage)
- Rotate API keys

## Support

**Need Help?**
- Check [Troubleshooting Guide](./docs/troubleshooting.md)
- Search workflow logs in Actions tab
- Review [Local Training](./docs/local_training.md) for debugging
- Run unit tests: `pytest scripts/retrain/test_train_and_upload.py -v`

**Want to Customize?**
- Edit `.github/workflows/daily-retrain.yml` for schedule/options
- Edit `scripts/retrain/train_and_upload.py` for training config
- Add new model types to supported list

---

## Progress Tracker

### Setup Status
- Phase 1 (Secrets): ⭕ (This step)
- Phase 2 (Code): ⭕
- Phase 3 (Manual Test): ⭕
- Phase 4 (Integration): ⭕
- Phase 5 (Local Test): ⭕ Optional
- Phase 6 (Schedule): ⭕ Optional
- Phase 7 (Docs): ⭕ Optional

**Estimated Time:** 15-20 minutes for full setup

**Ready for Production:** After Phase 4 ✅
