'use client';

/**
 * TrainingMetricsChart Component
 * 
 * Displays epoch-by-epoch training progress with:
 * - Loss curves (train and validation)
 * - Accuracy curves (train and validation)
 * - Learning rate curve
 * - Interactive tooltips and zoom
 */

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';
import type { ExperimentMetric } from '@/types/database';

// Dynamic import for ApexCharts (SSR disabled)
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

// ============================================================================
// Types
// ============================================================================

interface TrainingMetricsChartProps {
  metrics: ExperimentMetric[];
  height?: number;
  title?: string;
}

type ChartType = 'loss' | 'accuracy' | 'learning_rate';

// ============================================================================
// Component
// ============================================================================

export default function TrainingMetricsChart({
  metrics,
  height = 350,
  title = 'Training Progress',
}: TrainingMetricsChartProps) {
  const [mounted, setMounted] = useState(false);
  const [activeChart, setActiveChart] = useState<ChartType>('loss');

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sort metrics by epoch
  const sortedMetrics = [...metrics].sort((a, b) => a.epoch - b.epoch);

  // Prepare data for loss chart
  const lossData = {
    series: [
      {
        name: 'Train Loss',
        data: sortedMetrics.map(m => ({ x: m.epoch, y: m.train_loss })),
      },
      ...(sortedMetrics.some(m => m.val_loss !== null)
        ? [
            {
              name: 'Validation Loss',
              data: sortedMetrics.map(m => ({ x: m.epoch, y: m.val_loss ?? null })),
            },
          ]
        : []),
    ],
  };

  // Prepare data for accuracy chart
  const accuracyData = {
    series: [
      ...(sortedMetrics.some(m => m.train_accuracy !== null)
        ? [
            {
              name: 'Train Accuracy',
              data: sortedMetrics.map(m => ({
                x: m.epoch,
                y: m.train_accuracy !== null ? m.train_accuracy * 100 : null,
              })),
            },
          ]
        : []),
      ...(sortedMetrics.some(m => m.val_accuracy !== null)
        ? [
            {
              name: 'Validation Accuracy',
              data: sortedMetrics.map(m => ({
                x: m.epoch,
                y: m.val_accuracy !== null ? m.val_accuracy * 100 : null,
              })),
            },
          ]
        : []),
    ],
  };

  // Prepare data for learning rate chart
  const learningRateData = {
    series: sortedMetrics.some(m => m.learning_rate !== null)
      ? [
          {
            name: 'Learning Rate',
            data: sortedMetrics.map(m => ({ x: m.epoch, y: m.learning_rate ?? null })),
          },
        ]
      : [],
  };

  // Common chart options
  const baseOptions: ApexOptions = {
    chart: {
      type: 'line',
      toolbar: {
        show: true,
        tools: {
          download: true,
          selection: true,
          zoom: true,
          zoomin: true,
          zoomout: true,
          pan: true,
          reset: true,
        },
      },
      background: 'transparent',
      animations: {
        enabled: true,
        speed: 500,
      },
    },
    stroke: {
      width: 2,
      curve: 'smooth',
    },
    markers: {
      size: 3,
      strokeWidth: 0,
      hover: {
        size: 5,
      },
    },
    xaxis: {
      title: {
        text: 'Epoch',
        style: { color: '#9CA3AF' },
      },
      labels: {
        style: { colors: '#9CA3AF' },
      },
      axisBorder: { color: '#374151' },
      axisTicks: { color: '#374151' },
    },
    grid: {
      borderColor: '#374151',
      strokeDashArray: 4,
    },
    legend: {
      position: 'top',
      horizontalAlign: 'right',
      labels: { colors: '#9CA3AF' },
    },
    tooltip: {
      theme: 'dark',
      x: {
        formatter: (val) => `Epoch ${val}`,
      },
    },
  };

  // Loss chart options
  const lossOptions: ApexOptions = {
    ...baseOptions,
    chart: {
      ...baseOptions.chart,
      id: 'loss-chart',
    },
    colors: ['#EF4444', '#F59E0B'],
    yaxis: {
      title: {
        text: 'Loss',
        style: { color: '#9CA3AF' },
      },
      labels: {
        style: { colors: '#9CA3AF' },
        formatter: (val) => val?.toFixed(4) ?? '-',
      },
    },
  };

  // Accuracy chart options
  const accuracyOptions: ApexOptions = {
    ...baseOptions,
    chart: {
      ...baseOptions.chart,
      id: 'accuracy-chart',
    },
    colors: ['#10B981', '#3B82F6'],
    yaxis: {
      title: {
        text: 'Accuracy (%)',
        style: { color: '#9CA3AF' },
      },
      labels: {
        style: { colors: '#9CA3AF' },
        formatter: (val) => (val !== null ? `${val.toFixed(1)}%` : '-'),
      },
      min: 0,
      max: 100,
    },
  };

  // Learning rate chart options
  const learningRateOptions: ApexOptions = {
    ...baseOptions,
    chart: {
      ...baseOptions.chart,
      id: 'lr-chart',
    },
    colors: ['#8B5CF6'],
    yaxis: {
      title: {
        text: 'Learning Rate',
        style: { color: '#9CA3AF' },
      },
      labels: {
        style: { colors: '#9CA3AF' },
        formatter: (val) => val?.toExponential(2) ?? '-',
      },
      logarithmic: true,
    },
  };

  // Get current chart data and options
  const getChartConfig = () => {
    switch (activeChart) {
      case 'loss':
        return { data: lossData, options: lossOptions };
      case 'accuracy':
        return { data: accuracyData, options: accuracyOptions };
      case 'learning_rate':
        return { data: learningRateData, options: learningRateOptions };
    }
  };

  const chartConfig = getChartConfig();
  const hasData = chartConfig.data.series.length > 0 && chartConfig.data.series.some(s => s.data.length > 0);

  // Tabs configuration
  const tabs = [
    { id: 'loss' as ChartType, label: 'Loss', disabled: false },
    {
      id: 'accuracy' as ChartType,
      label: 'Accuracy',
      disabled: accuracyData.series.length === 0,
    },
    {
      id: 'learning_rate' as ChartType,
      label: 'Learning Rate',
      disabled: learningRateData.series.length === 0,
    },
  ];

  if (!mounted) {
    return (
      <div className="bg-gray-700/30 rounded-lg p-4" style={{ height }}>
        <div className="flex items-center justify-center h-full">
          <svg className="animate-spin h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-700/30 rounded-lg overflow-hidden">
      {/* Chart Type Tabs */}
      <div className="flex border-b border-gray-600">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => !tab.disabled && setActiveChart(tab.id)}
            disabled={tab.disabled}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              activeChart === tab.id
                ? 'text-emerald-400 border-b-2 border-emerald-400 bg-gray-700/50'
                : tab.disabled
                ? 'text-gray-600 cursor-not-allowed'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="p-4">
        {!hasData ? (
          <div className="flex items-center justify-center" style={{ height: height - 60 }}>
            <p className="text-gray-400">No data available for this chart</p>
          </div>
        ) : (
          <Chart
            options={chartConfig.options}
            series={chartConfig.data.series}
            type="line"
            height={height - 60}
          />
        )}
      </div>

      {/* Summary Stats */}
      {hasData && activeChart === 'loss' && sortedMetrics.length > 0 && (
        <div className="px-4 pb-4">
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Min Train Loss:</span>
              <span className="text-white font-medium">
                {Math.min(...sortedMetrics.map(m => m.train_loss)).toFixed(4)}
              </span>
            </div>
            {sortedMetrics.some(m => m.val_loss !== null) && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Min Val Loss:</span>
                <span className="text-white font-medium">
                  {Math.min(...sortedMetrics.filter(m => m.val_loss !== null).map(m => m.val_loss as number)).toFixed(4)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {hasData && activeChart === 'accuracy' && sortedMetrics.length > 0 && (
        <div className="px-4 pb-4">
          <div className="flex gap-4 text-sm">
            {sortedMetrics.some(m => m.train_accuracy !== null) && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Best Train Acc:</span>
                <span className="text-white font-medium">
                  {(Math.max(...sortedMetrics.filter(m => m.train_accuracy !== null).map(m => m.train_accuracy as number)) * 100).toFixed(2)}%
                </span>
              </div>
            )}
            {sortedMetrics.some(m => m.val_accuracy !== null) && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Best Val Acc:</span>
                <span className="text-white font-medium">
                  {(Math.max(...sortedMetrics.filter(m => m.val_accuracy !== null).map(m => m.val_accuracy as number)) * 100).toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
