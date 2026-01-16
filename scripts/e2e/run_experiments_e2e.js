/*
 * Lightweight E2E script for Experiments API
 * Usage: EXPERIMENT_API_KEY=xxx node scripts/e2e/run_experiments_e2e.js
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.EXPERIMENT_API_KEY;

if (!API_KEY) {
  console.error('EXPERIMENT_API_KEY environment variable is required');
  process.exit(1);
}

const fetch = global.fetch || require('node-fetch');

async function main() {
  console.log('Starting Experiments E2E test...');

  // 1) Create experiment
  const createResp = await fetch(`${BASE}/api/experiments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify({
      name: `e2e-test-${Date.now()}`,
      model_type: 'LSTM',
      target_asset: 'AAPL',
      data_source: 'yahoo',
      date_range_start: '2020-01-01',
      date_range_end: '2021-01-01',
      train_test_split: 0.8,
      hyperparameters: { lr: 0.001 },
      features: ['Close'],
      wandb_run_id: `e2e-${Date.now()}`,
    }),
  });

  const createJson = await createResp.json();
  if (!createResp.ok) {
    console.error('Failed to create experiment:', createJson);
    process.exit(2);
  }

  const experimentId = createJson.experiment_id || createJson.experiment?.id;
  console.log('Created experiment:', experimentId);

  // 2) Post metrics (batch)
  const metricsPayload = {
    metrics: [
      { epoch: 1, train_loss: 0.5, val_loss: 0.55, train_accuracy: 0.4, val_accuracy: 0.38, learning_rate: 0.001 },
      { epoch: 2, train_loss: 0.45, val_loss: 0.5, train_accuracy: 0.5, val_accuracy: 0.45, learning_rate: 0.001 },
    ],
  };

  const metricsResp = await fetch(`${BASE}/api/experiments/${experimentId}/metrics`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify(metricsPayload),
  });

  const metricsJson = await metricsResp.json();
  if (!metricsResp.ok) {
    console.error('Failed to post metrics:', metricsJson);
    process.exit(3);
  }

  console.log('Posted metrics:', metricsJson.inserted || metricsJson);

  // 3) Fetch experiments list
  const listResp = await fetch(`${BASE}/api/experiments?limit=10`, {
    headers: { 'X-API-Key': API_KEY }
  });

  const listJson = await listResp.json();
  if (!listResp.ok) {
    console.error('Failed to list experiments:', listJson);
    process.exit(4);
  }

  const found = (listJson.data || []).find(e => e.id === experimentId || e.experiment_id === experimentId);
  if (!found) {
    console.error('Experiment not found in list');
    process.exit(5);
  }

  console.log('Experiment found in list: OK');

  // 4) Mark experiment as cancelled for cleanup
  const cancelResp = await fetch(`${BASE}/api/experiments/${experimentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
    body: JSON.stringify({ status: 'cancelled', completed_at: new Date().toISOString() }),
  });

  if (!cancelResp.ok) {
    const err = await cancelResp.json();
    console.warn('Failed to cancel experiment during cleanup:', err);
  } else {
    console.log('Cancelled experiment for cleanup');
  }

  console.log('E2E experiments test completed successfully');
}

main().catch(err => {
  console.error('Uncaught error in E2E script:', err);
  process.exit(99);
});