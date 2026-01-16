'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  ModelComparisonData,
  RelativePerformance,
  CorrelationAnalysis,
  calculateRelativePerformance,
  calculateCorrelationMatrix,
  generateCumulativePnLSeries,
  generateDrawdownSeries,
  generateWinRateSeries,
  formatPercentage,
  getPerformanceColor,
  getRankColor,
} from '@/lib/comparison-utils';

// Dynamically import ApexCharts to avoid SSR issues
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface ModelComparisonProps {
  selectedModelIds: string[];
}

export default function ModelComparison({ selectedModelIds }: ModelComparisonProps) {
  const [comparisons, setComparisons] = useState<ModelComparisonData[]>([]);
  const [relativePerf, setRelativePerf] = useState<RelativePerformance[]>([]);
  const [correlations, setCorrelations] = useState<CorrelationAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'charts' | 'correlation'>('overview');

  useEffect(() => {
    if (selectedModelIds.length > 0) {
      fetchComparisonData();
    } else {
      setComparisons([]);
      setRelativePerf([]);
      setCorrelations([]);
    }
  }, [selectedModelIds]);

  const fetchComparisonData = async () => {
    try {
      setLoading(true);
      setError(null);

      const queryParams = new URLSearchParams();
      selectedModelIds.forEach((id) => queryParams.append('modelIds', id));

      const response = await fetch(`/api/metrics/compare?${queryParams.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch comparison data');
      }

      const data = await response.json();
      setComparisons(data.comparisons || []);

      // Calculate derived metrics
      if (data.comparisons && data.comparisons.length > 0) {
        const relative = calculateRelativePerformance(data.comparisons);
        setRelativePerf(relative);

        if (data.comparisons.length > 1) {
          const corr = calculateCorrelationMatrix(data.comparisons);
          setCorrelations(corr);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comparison data');
    } finally {
      setLoading(false);
    }
  };

  if (selectedModelIds.length === 0) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-12 text-center mt-8">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
          Select Models to Compare
        </h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Choose at least 2 models from the selector above to see comparison metrics
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4 mt-8">
        <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
        <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mt-8">
        <p className="text-red-800 dark:text-red-200">{error}</p>
        <button
          onClick={fetchComparisonData}
          className="mt-2 text-sm text-red-600 dark:text-red-400 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-8">
      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'overview', label: 'Overview', icon: '📊' },
            { id: 'charts', label: 'Charts', icon: '📈' },
            { id: 'correlation', label: 'Correlation', icon: '🔗' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab comparisons={comparisons} relativePerf={relativePerf} />
      )}
      {activeTab === 'charts' && (
        <ChartsTab comparisons={comparisons} />
      )}
      {activeTab === 'correlation' && (
        <CorrelationTab correlations={correlations} />
      )}
    </div>
  );
}

// Overview Tab Component
function OverviewTab({
  comparisons,
  relativePerf,
}: {
  comparisons: ModelComparisonData[];
  relativePerf: RelativePerformance[];
}) {
  return (
    <div className="space-y-6">
      {/* Rankings */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Model Rankings
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Rank
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Model
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Relative PnL
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Win Rate
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Sharpe Ratio
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {relativePerf.map((perf) => (
                <tr key={perf.modelId}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRankColor(perf.rank)}`}>
                      #{perf.rank}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {perf.modelName}
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${getPerformanceColor(perf.relativePnL - 100)}`}>
                    {perf.relativePnL.toFixed(1)}%
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${getPerformanceColor(perf.relativeWinRate - 100)}`}>
                    {perf.relativeWinRate.toFixed(1)}%
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900 dark:text-white">
                    {perf.relativeSharpe ? `${perf.relativeSharpe.toFixed(1)}%` : 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {comparisons.map((comparison) => (
          <div
            key={comparison.modelId}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
          >
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {comparison.modelName}
            </h4>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500 dark:text-gray-400">Total Trades</dt>
                <dd className="text-sm font-medium text-gray-900 dark:text-white">
                  {comparison.aggregatedMetrics.totalTrades}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500 dark:text-gray-400">Win Rate</dt>
                <dd className="text-sm font-medium text-gray-900 dark:text-white">
                  {(comparison.aggregatedMetrics.winRate * 100).toFixed(2)}%
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500 dark:text-gray-400">Total PnL</dt>
                <dd className={`text-sm font-medium ${getPerformanceColor(comparison.aggregatedMetrics.totalPnLPercentage)}`}>
                  {formatPercentage(comparison.aggregatedMetrics.totalPnLPercentage)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500 dark:text-gray-400">Max Drawdown</dt>
                <dd className={`text-sm font-medium ${getPerformanceColor(comparison.aggregatedMetrics.maxDrawdownPercentage)}`}>
                  {formatPercentage(comparison.aggregatedMetrics.maxDrawdownPercentage)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500 dark:text-gray-400">Sharpe Ratio</dt>
                <dd className="text-sm font-medium text-gray-900 dark:text-white">
                  {comparison.aggregatedMetrics.sharpeRatio?.toFixed(2) ?? 'N/A'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500 dark:text-gray-400">Profit Factor</dt>
                <dd className="text-sm font-medium text-gray-900 dark:text-white">
                  {comparison.aggregatedMetrics.profitFactor?.toFixed(2) ?? 'N/A'}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

// Charts Tab Component
function ChartsTab({ comparisons }: { comparisons: ModelComparisonData[] }) {
  const pnlSeries = generateCumulativePnLSeries(comparisons);
  const drawdownSeries = generateDrawdownSeries(comparisons);
  const winRateSeries = generateWinRateSeries(comparisons);

  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

  // Prepare data for ApexCharts
  const pnlChartData = pnlSeries.map((series, index) => ({
    name: series[0]?.modelName || `Model ${index + 1}`,
    data: series.map((point) => ({
      x: point.timestamp.getTime(),
      y: point.value,
    })),
  }));

  const drawdownChartData = drawdownSeries.map((series, index) => ({
    name: series[0]?.modelName || `Model ${index + 1}`,
    data: series.map((point) => ({
      x: point.timestamp.getTime(),
      y: point.value,
    })),
  }));

  const winRateChartData = winRateSeries.map((series, index) => ({
    name: series[0]?.modelName || `Model ${index + 1}`,
    data: series.map((point) => ({
      x: point.timestamp.getTime(),
      y: point.value,
    })),
  }));

  const commonOptions = {
    chart: {
      type: 'line' as const,
      toolbar: { show: true },
      zoom: { enabled: true },
      background: 'transparent',
    },
    colors: colors.slice(0, comparisons.length),
    stroke: { width: 2, curve: 'smooth' as const },
    xaxis: {
      type: 'datetime' as const,
      labels: {
        style: { colors: '#9CA3AF' },
      },
    },
    yaxis: {
      labels: {
        style: { colors: '#9CA3AF' },
      },
    },
    legend: {
      labels: { colors: '#9CA3AF' },
    },
    grid: {
      borderColor: '#374151',
    },
    tooltip: {
      theme: 'dark',
    },
  };

  return (
    <div className="space-y-8">
      {/* Cumulative PnL */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Cumulative PnL Comparison
        </h3>
        <Chart
          options={{
            ...commonOptions,
            yaxis: {
              ...commonOptions.yaxis,
              labels: {
                ...commonOptions.yaxis.labels,
                formatter: (val: number) => `${val.toFixed(2)}%`,
              },
            },
          }}
          series={pnlChartData}
          type="line"
          height={350}
        />
      </div>

      {/* Drawdown */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Maximum Drawdown Comparison
        </h3>
        <Chart
          options={{
            ...commonOptions,
            yaxis: {
              ...commonOptions.yaxis,
              labels: {
                ...commonOptions.yaxis.labels,
                formatter: (val: number) => `${val.toFixed(2)}%`,
              },
            },
          }}
          series={drawdownChartData}
          type="line"
          height={350}
        />
      </div>

      {/* Win Rate */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Win Rate Comparison
        </h3>
        <Chart
          options={{
            ...commonOptions,
            yaxis: {
              ...commonOptions.yaxis,
              min: 0,
              max: 100,
              labels: {
                ...commonOptions.yaxis.labels,
                formatter: (val: number) => `${val.toFixed(1)}%`,
              },
            },
          }}
          series={winRateChartData}
          type="line"
          height={350}
        />
      </div>
    </div>
  );
}

// Correlation Tab Component
function CorrelationTab({ correlations }: { correlations: CorrelationAnalysis[] }) {
  if (correlations.length === 0) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-12 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          Select at least 2 models to view correlation analysis
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Model Correlation Analysis
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Correlation values range from -1 to 1, where 1 indicates perfect positive correlation
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Model Pair
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  PnL Correlation
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Trade Correlation
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Signal Agreement
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {correlations.map((corr, index) => (
                <tr key={index}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    <div className="flex flex-col">
                      <span className="font-medium">{corr.model1Name}</span>
                      <span className="text-gray-500 dark:text-gray-400">vs</span>
                      <span className="font-medium">{corr.model2Name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        Math.abs(corr.pnlCorrelation) > 0.7
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                          : Math.abs(corr.pnlCorrelation) > 0.4
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                          : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      }`}
                    >
                      {corr.pnlCorrelation.toFixed(3)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900 dark:text-white">
                    {corr.tradeCorrelation.toFixed(3)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900 dark:text-white">
                    {corr.signalAgreement.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Interpretation Guide */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
          Interpretation Guide
        </h4>
        <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
          <li>• <strong>High PnL Correlation (&gt;0.7):</strong> Models may be redundant or too similar</li>
          <li>• <strong>Low PnL Correlation (&lt;0.3):</strong> Models are diversified, good for ensemble</li>
          <li>• <strong>High Signal Agreement:</strong> Models generate similar trading signals</li>
          <li>• <strong>Trade Correlation:</strong> Measures overlap in trading activity timing</li>
        </ul>
      </div>
    </div>
  );
}
