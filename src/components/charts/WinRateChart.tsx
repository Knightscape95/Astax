'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';

// Dynamic import for ApexCharts (SSR disabled)
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

export interface WinRateChartProps {
  winRate: number;
  accuracy?: number;
  totalTrades?: number;
  winningTrades?: number;
  losingTrades?: number;
  title?: string;
  height?: number;
  isLoading?: boolean;
}

export function WinRateChart({
  winRate,
  accuracy,
  totalTrades,
  winningTrades,
  losingTrades,
  title = 'Win Rate & Accuracy',
  height = 300,
  isLoading = false,
}: WinRateChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Clamp values between 0 and 100
  const clampedWinRate = Math.min(Math.max(winRate, 0), 100);
  const clampedAccuracy = accuracy !== undefined ? Math.min(Math.max(accuracy, 0), 100) : undefined;

  const series = clampedAccuracy !== undefined 
    ? [clampedWinRate, clampedAccuracy]
    : [clampedWinRate];

  const labels = clampedAccuracy !== undefined 
    ? ['Win Rate', 'Accuracy']
    : ['Win Rate'];

  const options: ApexOptions = {
    chart: {
      type: 'radialBar',
      background: 'transparent',
      animations: {
        enabled: true,
        speed: 800,
        dynamicAnimation: {
          enabled: true,
          speed: 500,
        },
      },
    },
    plotOptions: {
      radialBar: {
        offsetY: 0,
        startAngle: -135,
        endAngle: 135,
        hollow: {
          margin: 5,
          size: clampedAccuracy !== undefined ? '40%' : '60%',
          background: 'transparent',
        },
        track: {
          background: '#374151',
          strokeWidth: '100%',
          margin: 8,
        },
        dataLabels: {
          name: {
            show: true,
            fontSize: '14px',
            fontWeight: 600,
            color: '#9CA3AF',
            offsetY: clampedAccuracy !== undefined ? -20 : -10,
          },
          value: {
            show: true,
            fontSize: '28px',
            fontWeight: 700,
            color: '#FFFFFF',
            offsetY: clampedAccuracy !== undefined ? 0 : 10,
            formatter: (val: number) => `${val.toFixed(1)}%`,
          },
          total: clampedAccuracy !== undefined ? {
            show: true,
            label: 'Win Rate',
            fontSize: '14px',
            fontWeight: 600,
            color: '#9CA3AF',
            formatter: () => `${clampedWinRate.toFixed(1)}%`,
          } : undefined,
        },
      },
    },
    colors: clampedAccuracy !== undefined 
      ? ['#10B981', '#3B82F6']
      : [getColorByValue(clampedWinRate)],
    labels,
    stroke: {
      lineCap: 'round',
    },
    legend: {
      show: clampedAccuracy !== undefined,
      position: 'bottom',
      labels: {
        colors: '#9CA3AF',
      },
    },
  };

  function getColorByValue(value: number): string {
    if (value >= 60) return '#10B981'; // Green
    if (value >= 50) return '#F59E0B'; // Yellow
    return '#EF4444'; // Red
  }

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
      ) : (
        <>
          <Chart
            options={options}
            series={series}
            type="radialBar"
            height={height}
          />
          {(totalTrades !== undefined || winningTrades !== undefined || losingTrades !== undefined) && (
            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-700">
              {totalTrades !== undefined && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">{totalTrades}</p>
                  <p className="text-xs text-gray-400">Total Trades</p>
                </div>
              )}
              {winningTrades !== undefined && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-400">{winningTrades}</p>
                  <p className="text-xs text-gray-400">Winning</p>
                </div>
              )}
              {losingTrades !== undefined && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-400">{losingTrades}</p>
                  <p className="text-xs text-gray-400">Losing</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default WinRateChart;
