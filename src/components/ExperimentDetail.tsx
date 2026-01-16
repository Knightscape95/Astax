'use client';

/**
 * ExperimentDetail Component
 * 
 * Displays detailed information about a single experiment:
 * - Full configuration and hyperparameters
 * - Training and evaluation metrics summary cards
 * - Link to W&B run for detailed logs
 * - Deploy as Model button
 * - Epoch-by-epoch training chart
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { Experiment, ExperimentMetric } from '@/types/database';
import TrainingMetricsChart from '@/components/TrainingMetricsChart';

// ============================================================================
// Types
// ============================================================================

interface ExperimentDetailProps {
  experiment: Experiment;
  onClose?: () => void;
  onDeploy?: (experiment: Experiment) => void;
}

// ============================================================================
// Status Colors
// ============================================================================

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  running: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  completed: { bg: 'bg-green-500/20', text: 'text-green-400' },
  failed: { bg: 'bg-red-500/20', text: 'text-red-400' },
  cancelled: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
};

// ============================================================================
// Component
// ============================================================================

export default function ExperimentDetail({ 
  experiment, 
  onClose,
  onDeploy,
}: ExperimentDetailProps) {
  const [metrics, setMetrics] = useState<ExperimentMetric[]>([]);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);

  // Fetch experiment metrics
  const fetchMetrics = useCallback(async () => {
    setIsLoadingMetrics(true);
    setMetricsError(null);

    try {
      const response = await fetch(`/api/experiments/${experiment.id}/metrics`);
      if (!response.ok) {
        throw new Error('Failed to fetch metrics');
      }
      const data = await response.json();
      setMetrics(data.data || []);
    } catch (err) {
      setMetricsError(err instanceof Error ? err.message : 'Failed to load metrics');
    } finally {
      setIsLoadingMetrics(false);
    }
  }, [experiment.id]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // Format date
  const formatDate = (date: Date | string | null): string => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Format duration
  const formatDuration = (seconds: number | null): string => {
    if (seconds === null) return '-';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  // Format percentage
  const formatPercent = (value: number | null): string => {
    if (value === null) return '-';
    return `${(value * 100).toFixed(2)}%`;
  };

  // Format number
  const formatNumber = (value: number | null, decimals = 4): string => {
    if (value === null) return '-';
    return value.toFixed(decimals);
  };

  // Handle deploy as model
  const handleDeploy = async () => {
    if (!onDeploy) return;
    setIsDeploying(true);
    try {
      await onDeploy(experiment);
    } finally {
      setIsDeploying(false);
    }
  };

  // Get status color
  const statusColor = STATUS_COLORS[experiment.status] || STATUS_COLORS.cancelled;

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between p-6 border-b border-gray-700">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-xl font-bold text-white">{experiment.name}</h2>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColor.bg} ${statusColor.text}`}>
              {experiment.status.charAt(0).toUpperCase() + experiment.status.slice(1)}
            </span>
          </div>
          <p className="text-gray-400 text-sm">
            Started {formatDate(experiment.started_at)}
            {experiment.completed_at && ` • Completed ${formatDate(experiment.completed_at)}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* W&B Link */}
          {experiment.wandb_run_id && (
            <a
              href={`https://wandb.ai/run/${experiment.wandb_run_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
              </svg>
              View in W&B
            </a>
          )}

          {/* Deploy button */}
          {experiment.status === 'completed' && experiment.model_id === null && (
            <button
              onClick={handleDeploy}
              disabled={isDeploying}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isDeploying ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Deploying...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Deploy as Model
                </>
              )}
            </button>
          )}

          {/* Deployed badge */}
          {experiment.model_id && (
            <span className="flex items-center gap-2 px-4 py-2 bg-green-600/20 text-green-400 rounded-lg text-sm font-medium">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Deployed
            </span>
          )}

          {/* Close button */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Evaluation Metrics Cards */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Evaluation Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <MetricCard
              label="Test Accuracy"
              value={formatPercent(experiment.test_accuracy)}
              color={experiment.test_accuracy !== null && experiment.test_accuracy >= 0.6 ? 'green' : 'gray'}
            />
            <MetricCard
              label="Precision"
              value={formatPercent(experiment.test_precision)}
              color="blue"
            />
            <MetricCard
              label="Recall"
              value={formatPercent(experiment.test_recall)}
              color="blue"
            />
            <MetricCard
              label="F1 Score"
              value={formatPercent(experiment.test_f1)}
              color="purple"
            />
            <MetricCard
              label="Sharpe Ratio"
              value={formatNumber(experiment.sharpe_ratio, 2)}
              color={experiment.sharpe_ratio !== null && experiment.sharpe_ratio > 1 ? 'green' : 'yellow'}
            />
            <MetricCard
              label="Max Drawdown"
              value={formatPercent(experiment.max_drawdown)}
              color={experiment.max_drawdown !== null && experiment.max_drawdown < 0.2 ? 'green' : 'red'}
            />
          </div>
        </div>

        {/* Training Metrics Cards */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Training Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <MetricCard
              label="Train Loss"
              value={formatNumber(experiment.train_loss, 4)}
              color="gray"
            />
            <MetricCard
              label="Train Accuracy"
              value={formatPercent(experiment.train_accuracy)}
              color="gray"
            />
            <MetricCard
              label="Val Loss"
              value={formatNumber(experiment.val_loss, 4)}
              color="gray"
            />
            <MetricCard
              label="Val Accuracy"
              value={formatPercent(experiment.val_accuracy)}
              color="gray"
            />
            <MetricCard
              label="Total Epochs"
              value={experiment.total_epochs?.toString() || '-'}
              color="gray"
            />
            <MetricCard
              label="Duration"
              value={formatDuration(experiment.training_duration_seconds)}
              color="gray"
            />
          </div>
        </div>

        {/* Training Progress Chart */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Training Progress</h3>
          {isLoadingMetrics ? (
            <div className="flex items-center justify-center py-12 bg-gray-700/30 rounded-lg">
              <svg className="animate-spin h-6 w-6 text-emerald-400 mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-gray-400">Loading training metrics...</span>
            </div>
          ) : metricsError ? (
            <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg">
              <p className="text-red-400 text-sm">{metricsError}</p>
            </div>
          ) : metrics.length === 0 ? (
            <div className="py-12 text-center bg-gray-700/30 rounded-lg">
              <p className="text-gray-400">No epoch metrics available</p>
            </div>
          ) : (
            <TrainingMetricsChart metrics={metrics} />
          )}
        </div>

        {/* Configuration */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Experiment Configuration */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Configuration</h3>
            <div className="bg-gray-700/30 rounded-lg p-4 space-y-3">
              <ConfigRow label="Model Type" value={experiment.model_type} />
              <ConfigRow label="Target Asset" value={experiment.target_asset} />
              <ConfigRow label="Data Source" value={experiment.data_source} />
              <ConfigRow
                label="Date Range"
                value={`${formatDate(experiment.date_range_start)} - ${formatDate(experiment.date_range_end)}`}
              />
              <ConfigRow label="Train/Test Split" value={`${(experiment.train_test_split * 100).toFixed(0)}% / ${((1 - experiment.train_test_split) * 100).toFixed(0)}%`} />
              <ConfigRow label="GPU Used" value={experiment.gpu_used ? 'Yes' : 'No'} />
              {experiment.colab_session_id && (
                <ConfigRow label="Colab Session" value={experiment.colab_session_id.slice(0, 12) + '...'} />
              )}
            </div>
          </div>

          {/* Hyperparameters */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Hyperparameters</h3>
            <div className="bg-gray-700/30 rounded-lg p-4 overflow-auto max-h-64">
              {Object.keys(experiment.hyperparameters || {}).length === 0 ? (
                <p className="text-gray-400 text-sm">No hyperparameters recorded</p>
              ) : (
                <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap">
                  {JSON.stringify(experiment.hyperparameters, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>

        {/* Features */}
        {experiment.features && experiment.features.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Features ({experiment.features.length})</h3>
            <div className="flex flex-wrap gap-2">
              {experiment.features.map((feature, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-gray-700 rounded-full text-sm text-gray-300"
                >
                  {feature}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

interface MetricCardProps {
  label: string;
  value: string;
  color?: 'green' | 'red' | 'blue' | 'yellow' | 'purple' | 'gray';
}

function MetricCard({ label, value, color = 'gray' }: MetricCardProps) {
  const colorClasses = {
    green: 'text-green-400',
    red: 'text-red-400',
    blue: 'text-blue-400',
    yellow: 'text-yellow-400',
    purple: 'text-purple-400',
    gray: 'text-gray-300',
  };

  return (
    <div className="bg-gray-700/30 rounded-lg p-4">
      <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xl font-bold ${colorClasses[color]}`}>{value}</p>
    </div>
  );
}

interface ConfigRowProps {
  label: string;
  value: string;
}

function ConfigRow({ label, value }: ConfigRowProps) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-gray-600/50 last:border-0">
      <span className="text-gray-400 text-sm">{label}</span>
      <span className="text-white text-sm font-medium">{value}</span>
    </div>
  );
}
