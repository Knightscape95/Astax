'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { ChartErrorBoundary } from '@/components/ChartErrorBoundary';
import {
  PnLChart,
  WinRateChart,
  SharpeRatioChart,
  DrawdownChart,
  type PnLDataPoint,
  type RiskMetrics,
  type DrawdownDataPoint,
} from '@/components/charts';
import TradeSignals, { type TradeSignal } from '@/components/TradeSignals';
import ModelConfidence, { type ModelConfidenceData } from '@/components/ModelConfidence';
import type {
  IncomingMessage,
  TradeSignalMessage,
  PerformanceUpdateMessage,
  MetricsSnapshotMessage,
  TradeClosedMessage,
} from '@/types/websocket';

// ============================================================================
// Types
// ============================================================================

interface DashboardMetrics {
  totalPnl: number;
  totalTrades: number;
  openTrades: number;
  winRate: number;
  winningTrades: number;
  losingTrades: number;
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  maxDrawdown: number;
  maxDrawdownPercentage: number;
  dailyPnl: number;
  weeklyPnl: number;
}

interface TimeframeOption {
  label: string;
  value: '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';
}

// ============================================================================
// Constants
// ============================================================================

const TIMEFRAMES: TimeframeOption[] = [
  { label: '1D', value: '1D' },
  { label: '1W', value: '1W' },
  { label: '1M', value: '1M' },
  { label: '3M', value: '3M' },
  { label: '1Y', value: '1Y' },
  { label: 'All', value: 'ALL' },
];

const DEFAULT_METRICS: DashboardMetrics = {
  totalPnl: 0,
  totalTrades: 0,
  openTrades: 0,
  winRate: 0,
  winningTrades: 0,
  losingTrades: 0,
  sharpeRatio: null,
  sortinoRatio: null,
  profitFactor: null,
  expectancy: null,
  maxDrawdown: 0,
  maxDrawdownPercentage: 0,
  dailyPnl: 0,
  weeklyPnl: 0,
};

// ============================================================================
// Dashboard Component
// ============================================================================

export default function DashboardPage() {
  // State
  const [selectedTimeframe, setSelectedTimeframe] = useState<TimeframeOption['value']>('1M');
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>();
  const [metrics, setMetrics] = useState<DashboardMetrics>(DEFAULT_METRICS);
  const [pnlData, setPnlData] = useState<PnLDataPoint[]>([]);
  const [drawdownData, setDrawdownData] = useState<DrawdownDataPoint[]>([]);
  const [tradeSignals, setTradeSignals] = useState<TradeSignal[]>([]);
  const [modelConfidence, setModelConfidence] = useState<ModelConfidenceData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());

  // WebSocket message handler
  const handleMessage = useCallback((message: IncomingMessage) => {
    setLastUpdate(Date.now());

    switch (message.type) {
      case 'metrics_snapshot': {
        const snapshot = message as MetricsSnapshotMessage;
        setMetrics((prev) => ({
          ...prev,
          totalPnl: snapshot.payload.metrics.totalPnl,
          totalTrades: snapshot.payload.metrics.totalTrades,
          openTrades: snapshot.payload.metrics.openTrades,
          winRate: snapshot.payload.metrics.winRate,
          sharpeRatio: snapshot.payload.metrics.sharpeRatio,
          maxDrawdown: snapshot.payload.metrics.maxDrawdown,
          dailyPnl: snapshot.payload.metrics.dailyPnl,
          weeklyPnl: snapshot.payload.metrics.weeklyPnl,
        }));
        break;
      }

      case 'performance_update': {
        const update = message as PerformanceUpdateMessage;
        if (update.payload.metric) {
          setMetrics((prev) => ({
            ...prev,
            winRate: update.payload.metric.win_rate ?? prev.winRate,
            winningTrades: update.payload.metric.winning_trades ?? prev.winningTrades,
            losingTrades: update.payload.metric.losing_trades ?? prev.losingTrades,
            totalTrades: update.payload.metric.total_trades ?? prev.totalTrades,
            sharpeRatio: update.payload.metric.sharpe_ratio ?? prev.sharpeRatio,
            sortinoRatio: update.payload.metric.sortino_ratio ?? prev.sortinoRatio,
            profitFactor: update.payload.metric.profit_factor ?? prev.profitFactor,
            expectancy: update.payload.metric.expectancy ?? prev.expectancy,
            maxDrawdownPercentage:
              update.payload.metric.max_drawdown_percentage ?? prev.maxDrawdownPercentage,
          }));
        }
        break;
      }

      case 'trade_signal': {
        const signal = message as TradeSignalMessage;
        const newSignal: TradeSignal = {
          id: signal.payload.signalId,
          modelId: signal.payload.modelId,
          modelName: signal.payload.modelId, // Would need model name mapping
          symbol: signal.payload.symbol,
          direction: signal.payload.direction,
          confidence: signal.payload.confidence,
          entryPrice: signal.payload.entryPrice,
          stopLoss: signal.payload.stopLoss,
          takeProfit: signal.payload.takeProfit,
          reasoning: signal.payload.reasoning,
          timestamp: signal.timestamp,
          status: 'pending',
          expiresAt: signal.payload.expiresAt,
        };
        setTradeSignals((prev) => [newSignal, ...prev].slice(0, 100));
        break;
      }

      case 'trade_closed': {
        const closed = message as TradeClosedMessage;
        // Update PnL data
        setPnlData((prev) => {
          const today = new Date().setHours(0, 0, 0, 0);
          const existing = prev.find((p) => p.timestamp === today);
          if (existing) {
            return prev.map((p) =>
              p.timestamp === today
                ? {
                    ...p,
                    pnl: p.pnl + closed.payload.pnl,
                    cumulativePnl: p.cumulativePnl + closed.payload.pnl,
                  }
                : p
            );
          }
          const lastCumulative = prev.length > 0 ? prev[prev.length - 1].cumulativePnl : 0;
          return [
            ...prev,
            {
              timestamp: today,
              pnl: closed.payload.pnl,
              cumulativePnl: lastCumulative + closed.payload.pnl,
            },
          ];
        });

        // Update metrics
        setMetrics((prev) => ({
          ...prev,
          totalPnl: prev.totalPnl + closed.payload.pnl,
          totalTrades: prev.totalTrades + 1,
          openTrades: Math.max(0, prev.openTrades - 1),
          winningTrades: closed.payload.pnl > 0 ? prev.winningTrades + 1 : prev.winningTrades,
          losingTrades: closed.payload.pnl < 0 ? prev.losingTrades + 1 : prev.losingTrades,
        }));
        break;
      }
    }
  }, []);

  // Initialize WebSocket connection
  const { state, isConnected, subscribe } = useWebSocket({
    onMessage: handleMessage,
    onOpen: () => {
      // Subscribe to all relevant channels
      subscribe(['models', 'trades', 'performance', 'alerts']);
    },
    autoConnect: true,
  });

  // Fetch initial data
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setIsLoading(true);
        
        // Fetch P&L data
        const pnlResponse = await fetch('/api/metrics/pnl?series=true');
        if (pnlResponse.ok) {
          const pnlResult = await pnlResponse.json();
          if (pnlResult.success && pnlResult.data) {
            const pnlPoints: PnLDataPoint[] = pnlResult.data.map((point: any) => ({
              timestamp: new Date(point.date).getTime(),
              pnl: point.pnl || 0,
              cumulativePnl: point.cumulative_pnl || 0,
            }));
            setPnlData(pnlPoints);
          }
        }

        // Fetch drawdown data
        const drawdownResponse = await fetch('/api/metrics/drawdown?series=true');
        if (drawdownResponse.ok) {
          const drawdownResult = await drawdownResponse.json();
          if (drawdownResult.success && drawdownResult.series) {
            const drawdownPoints: DrawdownDataPoint[] = drawdownResult.series.map((point: any) => ({
              timestamp: new Date(point.date).getTime(),
              drawdown: point.drawdown || 0,
              drawdownPercentage: point.drawdown_percentage || 0,
              portfolioValue: point.portfolio_value || 0,
              peakValue: point.peak_value || 0,
            }));
            setDrawdownData(drawdownPoints);
          }
        }

        // Fetch performance metrics
        const performanceResponse = await fetch('/api/metrics/performance');
        if (performanceResponse.ok) {
          const performanceResult = await performanceResponse.json();
          if (performanceResult.success && performanceResult.data) {
            const stats = performanceResult.data;
            setMetrics({
              totalPnl: stats.total_pnl || 0,
              totalTrades: stats.total_trades || 0,
              openTrades: stats.open_trades || 0,
              winRate: stats.win_rate || 0,
              winningTrades: stats.winning_trades || 0,
              losingTrades: stats.losing_trades || 0,
              sharpeRatio: stats.sharpe_ratio,
              sortinoRatio: stats.sortino_ratio,
              profitFactor: stats.profit_factor,
              expectancy: stats.expectancy,
              maxDrawdown: stats.max_drawdown || 0,
              maxDrawdownPercentage: stats.max_drawdown_percentage || 0,
              dailyPnl: stats.daily_pnl || 0,
              weeklyPnl: stats.weekly_pnl || 0,
            });
          }
        }

        // Fetch recent trades for signals
        const tradesResponse = await fetch('/api/trades?limit=10&status=open');
        if (tradesResponse.ok) {
          const tradesResult = await tradesResponse.json();
          if (tradesResult.success && tradesResult.trades) {
            const signals: TradeSignal[] = tradesResult.trades.map((trade: any) => ({
              id: trade.id,
              modelId: trade.model_id,
              modelName: trade.model_name || 'Unknown Model',
              symbol: trade.symbol,
              direction: trade.direction,
              confidence: trade.signal_confidence || 0,
              entryPrice: trade.entry_price,
              stopLoss: trade.stop_loss,
              takeProfit: trade.take_profit,
              reasoning: trade.notes,
              timestamp: new Date(trade.entry_time).getTime(),
              status: trade.status === 'open' ? 'pending' : 'executed',
            }));
            setTradeSignals(signals);
          }
        }

        // Fetch model list for confidence data
        const modelsResponse = await fetch('/api/models');
        if (modelsResponse.ok) {
          const modelsResult = await modelsResponse.json();
          if (modelsResult.success && modelsResult.models) {
            const confidenceData: ModelConfidenceData[] = modelsResult.models
              .filter((model: any) => model.status === 'active')
              .map((model: any) => ({
                modelId: model.id,
                modelName: model.name,
                currentConfidence: 0, // Would need to calculate from recent predictions
                avgConfidence: 0,
                confidenceHistory: [],
                predictions: { total: 0, correct: 0, accuracy: 0 },
                status: model.status,
              }));
            setModelConfidence(confidenceData);
          }
        }
      } catch (error) {
        console.error('Failed to fetch initial data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  // Derived risk metrics for chart
  const riskMetrics: RiskMetrics = useMemo(
    () => ({
      sharpeRatio: metrics.sharpeRatio,
      sortinoRatio: metrics.sortinoRatio,
      profitFactor: metrics.profitFactor,
      expectancy: metrics.expectancy,
      maxDrawdownPercentage: metrics.maxDrawdownPercentage,
    }),
    [metrics]
  );

  // Format currency
  const formatCurrency = (value: number) => {
    const absValue = Math.abs(value);
    const formatted = absValue >= 1000
      ? `$${(absValue / 1000).toFixed(1)}K`
      : `$${absValue.toFixed(2)}`;
    return value < 0 ? `-${formatted}` : formatted;
  };

  // Format percentage
  const formatPercentage = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  return (
    <div>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Performance Dashboard</h1>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
              }`}
            />
            <span className="text-xs text-gray-400">
              {isConnected ? 'Live data connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        {/* Timeframe Selector */}
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setSelectedTimeframe(tf.value)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                selectedTimeframe === tf.value
                  ? 'bg-emerald-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div>
          {/* Quick Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
            <StatCard
              label="Total P&L"
              value={formatCurrency(metrics.totalPnl)}
              change={formatPercentage((metrics.totalPnl / 100000) * 100)}
              isPositive={metrics.totalPnl >= 0}
            />
            <StatCard
              label="Daily P&L"
              value={formatCurrency(metrics.dailyPnl)}
              isPositive={metrics.dailyPnl >= 0}
            />
            <StatCard
              label="Win Rate"
              value={`${metrics.winRate.toFixed(1)}%`}
              isPositive={metrics.winRate >= 50}
            />
            <StatCard
              label="Total Trades"
              value={metrics.totalTrades.toString()}
              subtitle={`${metrics.openTrades} open`}
            />
            <StatCard
              label="Sharpe Ratio"
              value={metrics.sharpeRatio?.toFixed(2) ?? 'N/A'}
              isPositive={(metrics.sharpeRatio ?? 0) >= 1}
            />
            <StatCard
              label="Max Drawdown"
              value={`${metrics.maxDrawdownPercentage.toFixed(2)}%`}
              isPositive={metrics.maxDrawdownPercentage > -10}
            />
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <ChartErrorBoundary>
              <PnLChart data={pnlData} isLoading={isLoading} />
            </ChartErrorBoundary>
            <ChartErrorBoundary>
              <DrawdownChart data={drawdownData} isLoading={isLoading} />
            </ChartErrorBoundary>
          </div>

          {/* Second Row: Risk Metrics + Win Rate */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2">
              <ChartErrorBoundary>
                <SharpeRatioChart metrics={riskMetrics} isLoading={isLoading} />
              </ChartErrorBoundary>
            </div>
            <ChartErrorBoundary>
              <WinRateChart
                winRate={metrics.winRate}
                totalTrades={metrics.totalTrades}
                winningTrades={metrics.winningTrades}
                losingTrades={metrics.losingTrades}
                isLoading={isLoading}
              />
            </ChartErrorBoundary>
          </div>

          {/* Third Row: Trade Signals + Model Confidence */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TradeSignals signals={tradeSignals} isLoading={isLoading} />
            <ModelConfidence
              models={modelConfidence}
              selectedModelId={selectedModelId}
              onModelSelect={setSelectedModelId}
              isLoading={isLoading}
            />
          </div>

          {/* Last Update Footer */}
          <div className="mt-6 text-center text-xs text-gray-500">
            Last updated: {new Date(lastUpdate).toLocaleString()}
          </div>
        </div>
      </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface StatCardProps {
  label: string;
  value: string;
  change?: string;
  subtitle?: string;
  isPositive?: boolean;
}

function StatCard({ label, value, change, subtitle, isPositive }: StatCardProps) {
  return (
    <div className="bg-gray-800 rounded-xl p-4 shadow-lg">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p
        className={`text-xl font-bold ${
          isPositive === undefined
            ? 'text-white'
            : isPositive
            ? 'text-green-400'
            : 'text-red-400'
        }`}
      >
        {value}
      </p>
      {change && (
        <p
          className={`text-xs mt-1 ${
            change.startsWith('+') ? 'text-green-400' : 'text-red-400'
          }`}
        >
          {change}
        </p>
      )}
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
}
