'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';

// Dynamic import for ApexCharts (SSR disabled)
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

export interface DrawdownDataPoint {
  timestamp: number;
  drawdown: number;
  drawdownPercentage: number;
  portfolioValue: number;
  peakValue: number;
}

export interface DrawdownChartProps {
  data: DrawdownDataPoint[];
  title?: string;
  height?: number;
  showPercentage?: boolean;
  maxDrawdownHighlight?: boolean;
  isLoading?: boolean;
}

export function DrawdownChart({
  data,
  title = 'Drawdown Analysis',
  height = 300,
  showPercentage = true,
  maxDrawdownHighlight = true,
  isLoading = false,
}: DrawdownChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Find max drawdown point
  const maxDrawdownIndex = data.reduce(
    (maxIdx, point, idx, arr) =>
      showPercentage
        ? point.drawdownPercentage < arr[maxIdx].drawdownPercentage
          ? idx
          : maxIdx
        : point.drawdown < arr[maxIdx].drawdown
        ? idx
        : maxIdx,
    0
  );

  const maxDrawdownPoint = data[maxDrawdownIndex];

  const series = [
    {
      name: showPercentage ? 'Drawdown %' : 'Drawdown $',
      data: data.map((d) => ({
        x: d.timestamp,
        y: showPercentage ? d.drawdownPercentage : d.drawdown,
      })),
    },
  ];

  const annotations: ApexOptions['annotations'] =
    maxDrawdownHighlight && maxDrawdownPoint
      ? {
          points: [
            {
              x: maxDrawdownPoint.timestamp,
              y: showPercentage
                ? maxDrawdownPoint.drawdownPercentage
                : maxDrawdownPoint.drawdown,
              marker: {
                size: 8,
                fillColor: '#EF4444',
                strokeColor: '#FFFFFF',
                strokeWidth: 2,
              },
              label: {
                text: `Max DD: ${
                  showPercentage
                    ? `${maxDrawdownPoint.drawdownPercentage.toFixed(2)}%`
                    : `$${maxDrawdownPoint.drawdown.toLocaleString()}`
                }`,
                borderColor: '#EF4444',
                borderWidth: 1,
                borderRadius: 4,
                style: {
                  color: '#FFFFFF',
                  background: '#EF4444',
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: {
                    left: 8,
                    right: 8,
                    top: 4,
                    bottom: 4,
                  },
                },
                offsetY: -15,
              },
            },
          ],
        }
      : undefined;

  const options: ApexOptions = {
    chart: {
      type: 'area',
      background: 'transparent',
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
      animations: {
        enabled: true,
        speed: 500,
        dynamicAnimation: {
          enabled: true,
          speed: 350,
        },
      },
    },
    colors: ['#EF4444'],
    fill: {
      type: 'gradient',
      gradient: {
        shade: 'dark',
        type: 'vertical',
        shadeIntensity: 0.5,
        gradientToColors: ['#991B1B'],
        inverseColors: false,
        opacityFrom: 0.7,
        opacityTo: 0.2,
        stops: [0, 100],
      },
    },
    stroke: {
      curve: 'smooth',
      width: 2,
    },
    dataLabels: {
      enabled: false,
    },
    xaxis: {
      type: 'datetime',
      labels: {
        style: {
          colors: '#9CA3AF',
        },
        datetimeFormatter: {
          year: 'yyyy',
          month: "MMM 'yy",
          day: 'dd MMM',
          hour: 'HH:mm',
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
      max: 0,
      labels: {
        style: {
          colors: '#9CA3AF',
        },
        formatter: (value: number) =>
          showPercentage ? `${value.toFixed(1)}%` : `$${value.toLocaleString()}`,
      },
      title: {
        text: showPercentage ? 'Drawdown (%)' : 'Drawdown ($)',
        style: {
          color: '#9CA3AF',
        },
      },
    },
    tooltip: {
      theme: 'dark',
      x: {
        format: 'dd MMM yyyy HH:mm',
      },
      y: {
        formatter: (value: number) =>
          showPercentage ? `${value.toFixed(2)}%` : `$${value.toLocaleString()}`,
      },
    },
    grid: {
      borderColor: '#374151',
      strokeDashArray: 4,
      xaxis: {
        lines: {
          show: false,
        },
      },
    },
    annotations,
    theme: {
      mode: 'dark',
    },
  };

  // Calculate statistics
  const currentDrawdown = data.length > 0 ? data[data.length - 1] : null;
  const avgDrawdown =
    data.length > 0
      ? data.reduce(
          (sum, d) => sum + (showPercentage ? d.drawdownPercentage : d.drawdown),
          0
        ) / data.length
      : 0;

  if (!mounted) {
    return (
      <div
        className="bg-gray-800 rounded-xl p-6 animate-pulse"
        style={{ height: height + 100 }}
      >
        <div className="h-6 bg-gray-700 rounded w-48 mb-4" />
        <div className="h-full bg-gray-700 rounded" />
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-xl p-6 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <div className="flex gap-2">
          <button
            onClick={() => {}} // Would toggle showPercentage if controlled externally
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              showPercentage
                ? 'bg-blue-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            %
          </button>
          <button
            onClick={() => {}}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              !showPercentage
                ? 'bg-blue-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            $
          </button>
        </div>
      </div>
      {isLoading ? (
        <div
          className="flex items-center justify-center"
          style={{ height }}
        >
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        </div>
      ) : !mounted || data.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center text-gray-400"
          style={{ height }}
        >
          <svg className="w-16 h-16 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
          </svg>
          <p className="text-sm">No drawdown data available</p>
          <p className="text-xs text-gray-500 mt-1">Data will appear after trades are executed</p>
        </div>
      ) : (
        <>
          <Chart
            options={options}
            series={series}
            type="area"
            height={height}
          />
          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-700">
            <div className="text-center">
              <p className="text-xl font-bold text-red-400">
                {showPercentage
                  ? `${maxDrawdownPoint?.drawdownPercentage.toFixed(2)}%`
                  : `$${maxDrawdownPoint?.drawdown.toLocaleString()}`}
              </p>
              <p className="text-xs text-gray-400">Max Drawdown</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-yellow-400">
                {showPercentage
                  ? `${currentDrawdown?.drawdownPercentage.toFixed(2)}%`
                  : `$${currentDrawdown?.drawdown.toLocaleString()}`}
              </p>
              <p className="text-xs text-gray-400">Current Drawdown</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-orange-400">
                {showPercentage
                  ? `${avgDrawdown.toFixed(2)}%`
                  : `$${avgDrawdown.toLocaleString()}`}
              </p>
              <p className="text-xs text-gray-400">Avg Drawdown</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default DrawdownChart;
