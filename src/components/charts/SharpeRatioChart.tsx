'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';

// Dynamic import for ApexCharts (SSR disabled)
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

export interface RiskMetrics {
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  maxDrawdownPercentage: number | null;
}

export interface SharpeRatioChartProps {
  metrics: RiskMetrics;
  benchmarks?: Partial<RiskMetrics>;
  title?: string;
  height?: number;
  isLoading?: boolean;
}

interface MetricConfigItem {
  label: string;
  description: string;
  goodThreshold: number;
  excellentThreshold: number;
  format: (v: number) => string;
  inverted?: boolean;
}

const METRIC_CONFIG: Record<keyof RiskMetrics, MetricConfigItem> = {
  sharpeRatio: {
    label: 'Sharpe Ratio',
    description: 'Risk-adjusted return',
    goodThreshold: 1,
    excellentThreshold: 2,
    format: (v: number) => v.toFixed(2),
  },
  sortinoRatio: {
    label: 'Sortino Ratio',
    description: 'Downside risk-adjusted return',
    goodThreshold: 1.5,
    excellentThreshold: 2.5,
    format: (v: number) => v.toFixed(2),
  },
  profitFactor: {
    label: 'Profit Factor',
    description: 'Gross profit / Gross loss',
    goodThreshold: 1.5,
    excellentThreshold: 2,
    format: (v: number) => v.toFixed(2),
  },
  expectancy: {
    label: 'Expectancy',
    description: 'Average expected per trade',
    goodThreshold: 0,
    excellentThreshold: 50,
    format: (v: number) => `$${v.toFixed(2)}`,
  },
  maxDrawdownPercentage: {
    label: 'Max Drawdown',
    description: 'Largest peak-to-trough decline',
    goodThreshold: -10,
    excellentThreshold: -5,
    format: (v: number) => `${v.toFixed(2)}%`,
    inverted: true,
  },
};

export function SharpeRatioChart({
  metrics,
  benchmarks,
  title = 'Risk Metrics',
  height = 350,
  isLoading = false,
}: SharpeRatioChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Filter out null values and prepare data
  const validMetrics = Object.entries(metrics).filter(
    ([_, value]) => value !== null
  ) as [keyof RiskMetrics, number][];

  const categories = validMetrics.map(([key]) => METRIC_CONFIG[key].label);
  
  const series = [
    {
      name: 'Current',
      data: validMetrics.map(([_, value]) => value),
    },
    ...(benchmarks
      ? [
          {
            name: 'Benchmark',
            data: validMetrics.map(([key]) => benchmarks[key] ?? 0),
          },
        ]
      : []),
  ];

  const options: ApexOptions = {
    chart: {
      type: 'bar',
      background: 'transparent',
      toolbar: {
        show: true,
        tools: {
          download: true,
          selection: false,
          zoom: false,
          zoomin: false,
          zoomout: false,
          pan: false,
          reset: false,
        },
      },
      animations: {
        enabled: true,
        speed: 500,
        dynamicAnimation: {
          enabled: true,
          speed: 350,
        },
      },
    },
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 6,
        barHeight: '60%',
        dataLabels: {
          position: 'top',
        },
      },
    },
    colors: ['#3B82F6', '#6B7280'],
    dataLabels: {
      enabled: true,
      formatter: (val: number, opts) => {
        const metricKey = validMetrics[opts.dataPointIndex]?.[0];
        if (metricKey) {
          return METRIC_CONFIG[metricKey].format(val);
        }
        return val.toFixed(2);
      },
      offsetX: 30,
      style: {
        colors: ['#FFFFFF'],
        fontSize: '12px',
        fontWeight: 600,
      },
    },
    xaxis: {
      categories,
      labels: {
        style: {
          colors: '#9CA3AF',
          fontSize: '12px',
        },
      },
      axisBorder: {
        color: '#374151',
      },
      axisTicks: {
        color: '#374151',
      },
    },
    yaxis: {
      labels: {
        style: {
          colors: '#9CA3AF',
          fontSize: '12px',
        },
      },
    },
    tooltip: {
      theme: 'dark',
      y: {
        formatter: (val: number, opts) => {
          const metricKey = validMetrics[opts.dataPointIndex]?.[0];
          if (metricKey) {
            return METRIC_CONFIG[metricKey].format(val);
          }
          return val.toFixed(2);
        },
      },
    },
    legend: {
      show: benchmarks !== undefined,
      position: 'top',
      horizontalAlign: 'right',
      labels: {
        colors: '#9CA3AF',
      },
    },
    grid: {
      borderColor: '#374151',
      strokeDashArray: 4,
      xaxis: {
        lines: {
          show: true,
        },
      },
      yaxis: {
        lines: {
          show: false,
        },
      },
    },
    theme: {
      mode: 'dark',
    },
  };

  function getMetricStatus(key: keyof RiskMetrics, value: number): 'excellent' | 'good' | 'poor' {
    const config = METRIC_CONFIG[key];
    if (config.inverted) {
      if (value >= config.excellentThreshold) return 'excellent';
      if (value >= config.goodThreshold) return 'good';
      return 'poor';
    }
    if (value >= config.excellentThreshold) return 'excellent';
    if (value >= config.goodThreshold) return 'good';
    return 'poor';
  }

  const statusColors = {
    excellent: 'text-green-400',
    good: 'text-yellow-400',
    poor: 'text-red-400',
  };

  if (!mounted) {
    return (
      <div
        className="bg-gray-800 rounded-xl p-6 animate-pulse"
        style={{ height: height + 80 }}
      >
        <div className="h-6 bg-gray-700 rounded w-48 mb-4" />
        <div className="h-full bg-gray-700 rounded" />
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-xl p-6 shadow-lg">
      <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
      {isLoading ? (
        <div
          className="flex items-center justify-center"
          style={{ height }}
        >
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        </div>
      ) : validMetrics.length === 0 ? (
        <div
          className="flex items-center justify-center text-gray-400"
          style={{ height }}
        >
          No metrics available
        </div>
      ) : (
        <>
          <Chart
            options={options}
            series={series}
            type="bar"
            height={height}
          />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-4 pt-4 border-t border-gray-700">
            {validMetrics.map(([key, value]) => {
              const config = METRIC_CONFIG[key];
              const status = getMetricStatus(key, value);
              return (
                <div key={key} className="text-center p-2 bg-gray-700/50 rounded-lg">
                  <p className={`text-lg font-bold ${statusColors[status]}`}>
                    {config.format(value)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{config.label}</p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default SharpeRatioChart;
