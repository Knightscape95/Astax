'use client';

/**
 * ExperimentComparison Component
 * 
 * Allows comparing multiple experiments side-by-side:
 * - Side-by-side metrics table
 * - Overlaid training curves
 * - Hyperparameter diff
 */

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';
import type { Experiment, ExperimentMetric } from '@/types/database';

// Dynamic import for ApexCharts (SSR disabled)
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

// ============================================================================
// Types
// ============================================================================

interface ExperimentComparison {
  experiment: Experiment;
  metrics: ExperimentMetric[];
}

interface ExperimentComparisonProps {
  experimentIds: string[];
  onClose?: () => void;
}

// ============================================================================
// Colors for different experiments
// ============================================================================

const EXPERIMENT_COLORS = [
  '#10B981', // emerald
  '#3B82F6', // blue
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // purple
  '#EC4899', // pink
];

// ============================================================================
// Component
// ============================================================================

export default function ExperimentComparisonView({ 
  experimentIds, 
  onClose 
}: ExperimentComparisonProps) {
  const [comparisons, setComparisons] = useState<ExperimentComparison[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'metrics' | 'curves' | 'hyperparams'>('metrics');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch experiments and their metrics
  const fetchComparisons = useCallback(async () => {
    if (experimentIds.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const results = await Promise.all(
        experimentIds.map(async (id) => {
          const [expRes, metricsRes] = await Promise.all([
            fetch(`/api/experiments/${id}`),
            fetch(`/api/experiments/${id}/metrics`),
          ]);

          if (!expRes.ok) throw new Error(`Failed to fetch experiment ${id}`);

          const expData = await expRes.json();
          const metricsData = metricsRes.ok ? await metricsRes.json() : { data: [] };

          return {
            experiment: expData.experiment || expData,
            metrics: metricsData.data || [],
          };
        })
      );

      setComparisons(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load experiments');
    } finally {
      setIsLoading(false);
    }
  }, [experimentIds]);

  useEffect(() => {
    fetchComparisons();
  }, [fetchComparisons]);

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

  // Format duration
  const formatDuration = (seconds: number | null): string => {
    if (seconds === null) return '-';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  // Get best value indicator
  const getBestIndicator = (values: (number | null)[], higherIsBetter = true): number => {
    const validValues = values.map((v, i) => ({ value: v, index: i })).filter(v => v.value !== null);
    if (validValues.length === 0) return -1;
    
    const sorted = [...validValues].sort((a, b) => {
      if (higherIsBetter) return (b.value as number) - (a.value as number);
      return (a.value as number) - (b.value as number);
    });
    
    return sorted[0].index;
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-8">
        <div className="flex items-center justify-center">
          <svg className="animate-spin h-8 w-8 text-emerald-400 mr-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-gray-400">Loading experiments for comparison...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-8">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={fetchComparisons}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (comparisons.length === 0) {
    return (
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-8">
        <div className="text-center text-gray-400">
          <p>No experiments selected for comparison</p>
        </div>
      </div>
    );
  }

  // Prepare data for overlaid training curves
  const lossSeries = comparisons.map((comp, index) => ({
    name: `${comp.experiment.name} - Train Loss`,
    data: [...comp.metrics]
      .sort((a, b) => a.epoch - b.epoch)
      .map(m => ({ x: m.epoch, y: m.train_loss })),
    color: EXPERIMENT_COLORS[index % EXPERIMENT_COLORS.length],
  }));

  const valLossSeries = comparisons
    .filter(comp => comp.metrics.some(m => m.val_loss !== null))
    .map((comp, index) => ({
      name: `${comp.experiment.name} - Val Loss`,
      data: [...comp.metrics]
        .sort((a, b) => a.epoch - b.epoch)
        .map(m => ({ x: m.epoch, y: m.val_loss })),
      color: EXPERIMENT_COLORS[index % EXPERIMENT_COLORS.length],
      dashArray: 5,
    }));

  // Chart options
  const chartOptions: ApexOptions = {
    chart: {
      type: 'line',
      toolbar: { show: true },
      background: 'transparent',
    },
    stroke: {
      width: 2,
      curve: 'smooth',
      dashArray: [...lossSeries.map(() => 0), ...valLossSeries.map(() => 5)],
    },
    colors: [
      ...lossSeries.map(s => s.color),
      ...valLossSeries.map(s => s.color),
    ],
    xaxis: {
      title: { text: 'Epoch', style: { color: '#9CA3AF' } },
      labels: { style: { colors: '#9CA3AF' } },
      axisBorder: { color: '#374151' },
    },
    yaxis: {
      title: { text: 'Loss', style: { color: '#9CA3AF' } },
      labels: {
        style: { colors: '#9CA3AF' },
        formatter: (val) => val?.toFixed(4) ?? '-',
      },
    },
    grid: { borderColor: '#374151', strokeDashArray: 4 },
    legend: {
      position: 'top',
      labels: { colors: '#9CA3AF' },
    },
    tooltip: { theme: 'dark' },
  };

  // Get all hyperparameters keys across experiments
  const allHyperparamKeys = new Set<string>();
  comparisons.forEach(comp => {
    Object.keys(comp.experiment.hyperparameters || {}).forEach(key => {
      allHyperparamKeys.add(key);
    });
  });

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-white">
          Comparing {comparisons.length} Experiments
        </h2>
        <div className="flex items-center gap-4">
          {/* Experiment color legend */}
          <div className="flex items-center gap-3">
            {comparisons.map((comp, index) => (
              <div key={comp.experiment.id} className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: EXPERIMENT_COLORS[index % EXPERIMENT_COLORS.length] }}
                />
                <span className="text-sm text-gray-300 max-w-32 truncate" title={comp.experiment.name}>
                  {comp.experiment.name}
                </span>
              </div>
            ))}
          </div>
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

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setActiveTab('metrics')}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'metrics'
              ? 'text-emerald-400 border-b-2 border-emerald-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Metrics Comparison
        </button>
        <button
          onClick={() => setActiveTab('curves')}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'curves'
              ? 'text-emerald-400 border-b-2 border-emerald-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Training Curves
        </button>
        <button
          onClick={() => setActiveTab('hyperparams')}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'hyperparams'
              ? 'text-emerald-400 border-b-2 border-emerald-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Hyperparameter Diff
        </button>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {/* Metrics Comparison Table */}
        {activeTab === 'metrics' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Metric</th>
                  {comparisons.map((comp, index) => (
                    <th key={comp.experiment.id} className="px-4 py-3 text-left text-xs font-medium uppercase">
                      <span style={{ color: EXPERIMENT_COLORS[index % EXPERIMENT_COLORS.length] }}>
                        {comp.experiment.name}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {/* Configuration rows */}
                <MetricRow
                  label="Model Type"
                  values={comparisons.map(c => c.experiment.model_type)}
                  isConfig
                />
                <MetricRow
                  label="Target Asset"
                  values={comparisons.map(c => c.experiment.target_asset)}
                  isConfig
                />
                <MetricRow
                  label="Status"
                  values={comparisons.map(c => c.experiment.status)}
                  isConfig
                />
                
                {/* Separator */}
                <tr>
                  <td colSpan={comparisons.length + 1} className="py-2">
                    <div className="border-t border-gray-600" />
                  </td>
                </tr>

                {/* Evaluation metrics */}
                <MetricRow
                  label="Test Accuracy"
                  values={comparisons.map(c => formatPercent(c.experiment.test_accuracy))}
                  rawValues={comparisons.map(c => c.experiment.test_accuracy)}
                  bestIndex={getBestIndicator(comparisons.map(c => c.experiment.test_accuracy), true)}
                />
                <MetricRow
                  label="Test Precision"
                  values={comparisons.map(c => formatPercent(c.experiment.test_precision))}
                  rawValues={comparisons.map(c => c.experiment.test_precision)}
                  bestIndex={getBestIndicator(comparisons.map(c => c.experiment.test_precision), true)}
                />
                <MetricRow
                  label="Test Recall"
                  values={comparisons.map(c => formatPercent(c.experiment.test_recall))}
                  rawValues={comparisons.map(c => c.experiment.test_recall)}
                  bestIndex={getBestIndicator(comparisons.map(c => c.experiment.test_recall), true)}
                />
                <MetricRow
                  label="Test F1"
                  values={comparisons.map(c => formatPercent(c.experiment.test_f1))}
                  rawValues={comparisons.map(c => c.experiment.test_f1)}
                  bestIndex={getBestIndicator(comparisons.map(c => c.experiment.test_f1), true)}
                />
                <MetricRow
                  label="Sharpe Ratio"
                  values={comparisons.map(c => formatNumber(c.experiment.sharpe_ratio, 2))}
                  rawValues={comparisons.map(c => c.experiment.sharpe_ratio)}
                  bestIndex={getBestIndicator(comparisons.map(c => c.experiment.sharpe_ratio), true)}
                />
                <MetricRow
                  label="Max Drawdown"
                  values={comparisons.map(c => formatPercent(c.experiment.max_drawdown))}
                  rawValues={comparisons.map(c => c.experiment.max_drawdown)}
                  bestIndex={getBestIndicator(comparisons.map(c => c.experiment.max_drawdown), false)}
                />

                {/* Separator */}
                <tr>
                  <td colSpan={comparisons.length + 1} className="py-2">
                    <div className="border-t border-gray-600" />
                  </td>
                </tr>

                {/* Training metrics */}
                <MetricRow
                  label="Final Train Loss"
                  values={comparisons.map(c => formatNumber(c.experiment.train_loss))}
                  rawValues={comparisons.map(c => c.experiment.train_loss)}
                  bestIndex={getBestIndicator(comparisons.map(c => c.experiment.train_loss), false)}
                />
                <MetricRow
                  label="Final Val Loss"
                  values={comparisons.map(c => formatNumber(c.experiment.val_loss))}
                  rawValues={comparisons.map(c => c.experiment.val_loss)}
                  bestIndex={getBestIndicator(comparisons.map(c => c.experiment.val_loss), false)}
                />
                <MetricRow
                  label="Total Epochs"
                  values={comparisons.map(c => c.experiment.total_epochs?.toString() || '-')}
                />
                <MetricRow
                  label="Training Duration"
                  values={comparisons.map(c => formatDuration(c.experiment.training_duration_seconds))}
                />
              </tbody>
            </table>
          </div>
        )}

        {/* Training Curves */}
        {activeTab === 'curves' && mounted && (
          <div>
            {lossSeries.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                No training metrics available for comparison
              </div>
            ) : (
              <Chart
                options={chartOptions}
                series={[...lossSeries, ...valLossSeries]}
                type="line"
                height={400}
              />
            )}
          </div>
        )}

        {/* Hyperparameter Diff */}
        {activeTab === 'hyperparams' && (
          <div className="overflow-x-auto">
            {allHyperparamKeys.size === 0 ? (
              <div className="text-center py-12 text-gray-400">
                No hyperparameters recorded for these experiments
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Hyperparameter
                    </th>
                    {comparisons.map((comp, index) => (
                      <th key={comp.experiment.id} className="px-4 py-3 text-left text-xs font-medium uppercase">
                        <span style={{ color: EXPERIMENT_COLORS[index % EXPERIMENT_COLORS.length] }}>
                          {comp.experiment.name}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {Array.from(allHyperparamKeys).sort().map(key => {
                    const values = comparisons.map(c => {
                      const val = c.experiment.hyperparameters?.[key];
                      if (val === undefined || val === null) return '-';
                      if (typeof val === 'object') return JSON.stringify(val);
                      return String(val);
                    });

                    // Check if values differ
                    const uniqueValues = new Set(values.filter(v => v !== '-'));
                    const isDifferent = uniqueValues.size > 1;

                    return (
                      <tr key={key} className={isDifferent ? 'bg-yellow-900/10' : ''}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-300 text-sm font-mono">{key}</span>
                            {isDifferent && (
                              <span className="px-1.5 py-0.5 text-xs bg-yellow-600/20 text-yellow-400 rounded">
                                differs
                              </span>
                            )}
                          </div>
                        </td>
                        {values.map((value, index) => (
                          <td
                            key={`${key}-${index}`}
                            className="px-4 py-3 text-sm font-mono"
                          >
                            <span className={isDifferent ? 'text-yellow-300' : 'text-gray-400'}>
                              {value}
                            </span>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

interface MetricRowProps {
  label: string;
  values: string[];
  rawValues?: (number | null)[];
  bestIndex?: number;
  isConfig?: boolean;
}

function MetricRow({ label, values, rawValues, bestIndex = -1, isConfig = false }: MetricRowProps) {
  return (
    <tr>
      <td className="px-4 py-3 text-sm text-gray-400">{label}</td>
      {values.map((value, index) => (
        <td
          key={index}
          className={`px-4 py-3 text-sm ${
            isConfig
              ? 'text-gray-300'
              : bestIndex === index
              ? 'text-green-400 font-semibold'
              : 'text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            {value}
            {bestIndex === index && !isConfig && (
              <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            )}
          </div>
        </td>
      ))}
    </tr>
  );
}
