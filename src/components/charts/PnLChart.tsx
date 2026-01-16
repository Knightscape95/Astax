'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';

// Dynamic import for ApexCharts (SSR disabled)
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

export interface PnLDataPoint {
  timestamp: number;
  pnl: number;
  cumulativePnl: number;
}

export interface PnLChartProps {
  data: PnLDataPoint[];
  title?: string;
  height?: number;
  showCumulative?: boolean;
  isLoading?: boolean;
}

export function PnLChart({
  data,
  title = 'Profit & Loss Over Time',
  height = 350,
  showCumulative = true,
  isLoading = false,
}: PnLChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const series = [
    {
      name: 'Daily P&L',
      type: 'column',
      data: data.map((d) => ({
        x: d.timestamp,
        y: d.pnl,
      })),
    },
    ...(showCumulative
      ? [
          {
            name: 'Cumulative P&L',
            type: 'line',
            data: data.map((d) => ({
              x: d.timestamp,
              y: d.cumulativePnl,
            })),
          },
        ]
      : []),
  ];

  const options: ApexOptions = {
    chart: {
      id: 'pnl-chart',
      type: 'line',
      stacked: false,
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
        dynamicAnimation: {
          enabled: true,
          speed: 350,
        },
      },
    },
    colors: ['#10B981', '#3B82F6'],
    stroke: {
      width: [0, 3],
      curve: 'smooth',
    },
    plotOptions: {
      bar: {
        columnWidth: '60%',
        borderRadius: 4,
        colors: {
          ranges: [
            {
              from: -Infinity,
              to: 0,
              color: '#EF4444',
            },
            {
              from: 0,
              to: Infinity,
              color: '#10B981',
            },
          ],
        },
      },
    },
    fill: {
      opacity: [0.85, 1],
      gradient: {
        inverseColors: false,
        shade: 'light',
        type: 'vertical',
        opacityFrom: 0.85,
        opacityTo: 0.55,
      },
    },
    markers: {
      size: [0, 4],
      strokeWidth: 2,
      hover: {
        size: 6,
      },
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
    yaxis: [
      {
        title: {
          text: 'Daily P&L ($)',
          style: {
            color: '#9CA3AF',
          },
        },
        labels: {
          style: {
            colors: '#9CA3AF',
          },
          formatter: (value: number) => `$${value.toLocaleString()}`,
        },
      },
      ...(showCumulative
        ? [
            {
              opposite: true,
              title: {
                text: 'Cumulative P&L ($)',
                style: {
                  color: '#9CA3AF',
                },
              },
              labels: {
                style: {
                  colors: '#9CA3AF',
                },
                formatter: (value: number) => `$${value.toLocaleString()}`,
              },
            },
          ]
        : []),
    ],
    tooltip: {
      shared: true,
      intersect: false,
      theme: 'dark',
      x: {
        format: 'dd MMM yyyy HH:mm',
      },
      y: {
        formatter: (value: number) => `$${value.toLocaleString()}`,
      },
    },
    legend: {
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
          show: false,
        },
      },
    },
    theme: {
      mode: 'dark',
    },
  };

  if (!mounted) {
    return (
      <div
        className="bg-gray-800 rounded-xl p-6 animate-pulse"
        style={{ height }}
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
      ) : !mounted || data.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center text-gray-400"
          style={{ height }}
        >
          <svg className="w-16 h-16 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-sm">No P&L data available</p>
          <p className="text-xs text-gray-500 mt-1">Start trading to see your performance</p>
        </div>
      ) : (
        <Chart
          options={options}
          series={series}
          type="line"
          height={height}
        />
      )}
    </div>
  );
}

export default PnLChart;
