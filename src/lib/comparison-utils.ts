import { PerformanceMetric, Trade } from '@/types/database';

export interface ComparisonMetrics {
  relativePerformance: number;
  correlation: number;
  winRateDiff: number;
  sharpeRatioDiff: number;
  riskRewardRatioDiff: number;
}

export interface ModelComparisonResult {
  modelAId: string;
  modelBId: string;
  metrics: ComparisonMetrics;
}

/**
 * Comparison result for a single model
 */
export interface ModelComparisonData {
  modelId: string;
  modelName: string;
  metrics: PerformanceMetric[];
  trades: Trade[];
  aggregatedMetrics: AggregatedMetrics;
}

/**
 * Aggregated metrics across all periods
 */
export interface AggregatedMetrics {
  totalTrades: number;
  winRate: number;
  totalPnL: number;
  totalPnLPercentage: number;
  averagePnL: number;
  maxDrawdown: number;
  maxDrawdownPercentage: number;
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  avgHoldingPeriodHours: number | null;
}

/**
 * Relative performance comparison between models
 */
export interface RelativePerformance {
  modelId: string;
  modelName: string;
  relativePnL: number; // Percentage relative to best performer
  relativeWinRate: number;
  relativeSharpe: number | null;
  relativeDrawdown: number;
  rank: number;
}

/**
 * Correlation analysis between two models
 */
export interface CorrelationAnalysis {
  model1Id: string;
  model2Id: string;
  model1Name: string;
  model2Name: string;
  pnlCorrelation: number;
  tradeCorrelation: number;
  signalAgreement: number; // Percentage of times both models agreed on direction
}

/**
 * Time series data point for charts
 */
export interface TimeSeriesDataPoint {
  timestamp: Date;
  value: number;
  modelId: string;
  modelName: string;
}

/**
 * Calculates the correlation coefficient between two arrays of numbers (Pearson correlation)
 */
export function calculateCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n !== y.length || n === 0) return 0;

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) return 0;
  return numerator / denominator;
}

/**
 * Calculate aggregated metrics from performance metrics array
 */
export function calculateAggregatedMetrics(
  metrics: PerformanceMetric[]
): AggregatedMetrics {
  if (metrics.length === 0) {
    return {
      totalTrades: 0,
      winRate: 0,
      totalPnL: 0,
      totalPnLPercentage: 0,
      averagePnL: 0,
      maxDrawdown: 0,
      maxDrawdownPercentage: 0,
      sharpeRatio: null,
      sortinoRatio: null,
      profitFactor: null,
      expectancy: null,
      avgHoldingPeriodHours: null,
    };
  }

  const totalTrades = metrics.reduce((sum, m) => sum + m.total_trades, 0);
  const totalWinningTrades = metrics.reduce((sum, m) => sum + m.winning_trades, 0);
  const totalPnL = metrics.reduce((sum, m) => sum + Number(m.total_pnl), 0);
  const totalPnLPercentage = metrics.reduce((sum, m) => sum + Number(m.total_pnl_percentage), 0);

  // Calculate weighted averages for ratio metrics
  const sharpeValues = metrics
    .filter((m) => m.sharpe_ratio !== null)
    .map((m) => Number(m.sharpe_ratio));
  const sortinoValues = metrics
    .filter((m) => m.sortino_ratio !== null)
    .map((m) => Number(m.sortino_ratio));
  const profitFactorValues = metrics
    .filter((m) => m.profit_factor !== null)
    .map((m) => Number(m.profit_factor));
  const expectancyValues = metrics
    .filter((m) => m.expectancy !== null)
    .map((m) => Number(m.expectancy));
  const holdingPeriodValues = metrics
    .filter((m) => m.avg_holding_period_hours !== null)
    .map((m) => Number(m.avg_holding_period_hours));

  return {
    totalTrades,
    winRate: totalTrades > 0 ? totalWinningTrades / totalTrades : 0,
    totalPnL,
    totalPnLPercentage,
    averagePnL: totalTrades > 0 ? totalPnL / totalTrades : 0,
    maxDrawdown: Math.min(...metrics.map((m) => Number(m.max_drawdown))),
    maxDrawdownPercentage: Math.min(...metrics.map((m) => Number(m.max_drawdown_percentage))),
    sharpeRatio:
      sharpeValues.length > 0
        ? sharpeValues.reduce((a, b) => a + b, 0) / sharpeValues.length
        : null,
    sortinoRatio:
      sortinoValues.length > 0
        ? sortinoValues.reduce((a, b) => a + b, 0) / sortinoValues.length
        : null,
    profitFactor:
      profitFactorValues.length > 0
        ? profitFactorValues.reduce((a, b) => a + b, 0) / profitFactorValues.length
        : null,
    expectancy:
      expectancyValues.length > 0
        ? expectancyValues.reduce((a, b) => a + b, 0) / expectancyValues.length
        : null,
    avgHoldingPeriodHours:
      holdingPeriodValues.length > 0
        ? holdingPeriodValues.reduce((a, b) => a + b, 0) / holdingPeriodValues.length
        : null,
  };
}

/**
 * Calculates comparison metrics between two models based on their performance metrics
 */
export function compareModels(
  metricsA: PerformanceMetric[], 
  metricsB: PerformanceMetric[]
): ComparisonMetrics {
  // Sort by date to align periods if possible, though here we assume aggregated metrics might be singular or time-series
  // For this utility, we'll assume we are comparing the latest/aggregated metrics or a series of them.
  // If arrays are passed, we calculate correlation on the PnL series.
  
  const pnlA = metricsA.map(m => Number(m.total_pnl));
  const pnlB = metricsB.map(m => Number(m.total_pnl));

  // Determine common length for correlation
  const length = Math.min(pnlA.length, pnlB.length);
  const correlation = calculateCorrelation(pnlA.slice(0, length), pnlB.slice(0, length));

  // Calculate averages for comparison
  const avgWinRateA = metricsA.reduce((sum, m) => sum + Number(m.win_rate), 0) / (metricsA.length || 1);
  const avgWinRateB = metricsB.reduce((sum, m) => sum + Number(m.win_rate), 0) / (metricsB.length || 1);

  const avgSharpeA = metricsA.reduce((sum, m) => sum + (Number(m.sharpe_ratio) || 0), 0) / (metricsA.length || 1);
  const avgSharpeB = metricsB.reduce((sum, m) => sum + (Number(m.sharpe_ratio) || 0), 0) / (metricsB.length || 1);

  const avgTotalPnlA = metricsA.reduce((sum, m) => sum + Number(m.total_pnl), 0) / (metricsA.length || 1);
  const avgTotalPnlB = metricsB.reduce((sum, m) => sum + Number(m.total_pnl), 0) / (metricsB.length || 1);
  
  // Calculate relative performance (percentage difference in Total PnL)
  const relativePerformance = avgTotalPnlA !== 0 
    ? ((avgTotalPnlB - avgTotalPnlA) / Math.abs(avgTotalPnlA)) * 100 
    : 0;

  return {
    relativePerformance,
    correlation,
    winRateDiff: avgWinRateB - avgWinRateA,
    sharpeRatioDiff: avgSharpeB - avgSharpeA,
    riskRewardRatioDiff: 0 // Placeholder as it requires more complex calculation from raw trades usually
  };
}

/**
 * Calculate relative performance of models compared to each other
 */
export function calculateRelativePerformance(
  comparisons: ModelComparisonData[]
): RelativePerformance[] {
  if (comparisons.length === 0) return [];

  // Find best values for normalization
  const bestPnL = Math.max(...comparisons.map((c) => c.aggregatedMetrics.totalPnLPercentage));
  const bestWinRate = Math.max(...comparisons.map((c) => c.aggregatedMetrics.winRate));
  const sharpeValues = comparisons
    .map((c) => c.aggregatedMetrics.sharpeRatio)
    .filter((s): s is number => s !== null);
  const bestSharpe = sharpeValues.length > 0 ? Math.max(...sharpeValues) : null;
  const bestDrawdown = Math.max(...comparisons.map((c) => c.aggregatedMetrics.maxDrawdownPercentage));

  // Calculate relative performance
  const relativePerf = comparisons.map((comparison) => {
    const metrics = comparison.aggregatedMetrics;

    return {
      modelId: comparison.modelId,
      modelName: comparison.modelName,
      relativePnL: bestPnL !== 0 ? (metrics.totalPnLPercentage / bestPnL) * 100 : 0,
      relativeWinRate: bestWinRate !== 0 ? (metrics.winRate / bestWinRate) * 100 : 0,
      relativeSharpe:
        bestSharpe && metrics.sharpeRatio ? (metrics.sharpeRatio / bestSharpe) * 100 : null,
      relativeDrawdown: bestDrawdown !== 0 ? (metrics.maxDrawdownPercentage / bestDrawdown) * 100 : 0,
      rank: 0,
    };
  });

  // Rank models by PnL
  const sorted = relativePerf.sort((a, b) => b.relativePnL - a.relativePnL);
  sorted.forEach((perf, index) => {
    perf.rank = index + 1;
  });

  return sorted;
}

/**
 * Calculate correlation between two models
 */
export function calculateModelCorrelation(
  model1: ModelComparisonData,
  model2: ModelComparisonData
): CorrelationAnalysis {
  // Align metrics by period
  const aligned = alignMetricsByPeriod(model1.metrics, model2.metrics);
  
  const pnlCorr = aligned.length >= 2
    ? calculateCorrelation(
        aligned.map(a => Number(a.metric1.total_pnl_percentage)),
        aligned.map(a => Number(a.metric2.total_pnl_percentage))
      )
    : 0;

  const tradeCorr = calculateTradeCorrelation(model1.trades, model2.trades);
  const signalAgree = calculateSignalAgreement(model1.trades, model2.trades);

  return {
    model1Id: model1.modelId,
    model2Id: model2.modelId,
    model1Name: model1.modelName,
    model2Name: model2.modelName,
    pnlCorrelation: pnlCorr,
    tradeCorrelation: tradeCorr,
    signalAgreement: signalAgree,
  };
}

/**
 * Calculate correlation matrix for multiple models
 */
export function calculateCorrelationMatrix(
  comparisons: ModelComparisonData[]
): CorrelationAnalysis[] {
  const correlations: CorrelationAnalysis[] = [];

  for (let i = 0; i < comparisons.length; i++) {
    for (let j = i + 1; j < comparisons.length; j++) {
      correlations.push(calculateModelCorrelation(comparisons[i], comparisons[j]));
    }
  }

  return correlations;
}

/**
 * Align metrics by period for comparison
 */
function alignMetricsByPeriod(
  metrics1: PerformanceMetric[],
  metrics2: PerformanceMetric[]
): Array<{ metric1: PerformanceMetric; metric2: PerformanceMetric }> {
  const aligned: Array<{ metric1: PerformanceMetric; metric2: PerformanceMetric }> = [];

  for (const m1 of metrics1) {
    const m2 = metrics2.find(
      (m) =>
        m.period_start.getTime() === m1.period_start.getTime() &&
        m.period_end.getTime() === m1.period_end.getTime()
    );
    if (m2) {
      aligned.push({ metric1: m1, metric2: m2 });
    }
  }

  return aligned;
}

/**
 * Calculate trade correlation (overlap in trading activity)
 */
function calculateTradeCorrelation(trades1: Trade[], trades2: Trade[]): number {
  if (trades1.length === 0 || trades2.length === 0) return 0;

  const bucketSize = 3600000; // 1 hour
  const allTrades = [...trades1, ...trades2];
  const minTime = Math.min(...allTrades.map((t) => t.entry_time.getTime()));
  const maxTime = Math.max(...allTrades.map((t) => t.entry_time.getTime()));

  const numBuckets = Math.ceil((maxTime - minTime) / bucketSize);
  const activity1 = new Array(numBuckets).fill(0);
  const activity2 = new Array(numBuckets).fill(0);

  trades1.forEach((trade) => {
    const bucket = Math.floor((trade.entry_time.getTime() - minTime) / bucketSize);
    if (bucket >= 0 && bucket < numBuckets) activity1[bucket]++;
  });

  trades2.forEach((trade) => {
    const bucket = Math.floor((trade.entry_time.getTime() - minTime) / bucketSize);
    if (bucket >= 0 && bucket < numBuckets) activity2[bucket]++;
  });

  return calculateCorrelation(activity1, activity2);
}

/**
 * Calculate signal agreement (percentage of times models agreed on direction)
 */
function calculateSignalAgreement(trades1: Trade[], trades2: Trade[]): number {
  if (trades1.length === 0 || trades2.length === 0) return 0;

  const timeWindow = 3600000; // 1 hour
  let agreements = 0;
  let comparisons = 0;

  for (const t1 of trades1) {
    const simultaneousTrades = trades2.filter(
      (t2) =>
        Math.abs(t2.entry_time.getTime() - t1.entry_time.getTime()) <= timeWindow &&
        t2.symbol === t1.symbol
    );

    for (const t2 of simultaneousTrades) {
      comparisons++;
      if (t1.direction === t2.direction) agreements++;
    }
  }

  return comparisons > 0 ? (agreements / comparisons) * 100 : 0;
}

/**
 * Generate cumulative PnL time series for charting
 */
export function generateCumulativePnLSeries(
  comparisons: ModelComparisonData[]
): TimeSeriesDataPoint[][] {
  return comparisons.map((comparison) => {
    let cumulativePnL = 0;
    const series: TimeSeriesDataPoint[] = [];

    const sortedMetrics = [...comparison.metrics].sort(
      (a, b) => a.period_start.getTime() - b.period_start.getTime()
    );

    sortedMetrics.forEach((metric) => {
      cumulativePnL += Number(metric.total_pnl_percentage);
      series.push({
        timestamp: metric.period_end,
        value: cumulativePnL,
        modelId: comparison.modelId,
        modelName: comparison.modelName,
      });
    });

    return series;
  });
}

/**
 * Generate drawdown time series for charting
 */
export function generateDrawdownSeries(
  comparisons: ModelComparisonData[]
): TimeSeriesDataPoint[][] {
  return comparisons.map((comparison) => {
    const series: TimeSeriesDataPoint[] = [];

    const sortedMetrics = [...comparison.metrics].sort(
      (a, b) => a.period_start.getTime() - b.period_start.getTime()
    );

    sortedMetrics.forEach((metric) => {
      series.push({
        timestamp: metric.period_end,
        value: Number(metric.max_drawdown_percentage),
        modelId: comparison.modelId,
        modelName: comparison.modelName,
      });
    });

    return series;
  });
}

/**
 * Generate win rate time series for charting
 */
export function generateWinRateSeries(
  comparisons: ModelComparisonData[]
): TimeSeriesDataPoint[][] {
  return comparisons.map((comparison) => {
    const series: TimeSeriesDataPoint[] = [];

    const sortedMetrics = [...comparison.metrics].sort(
      (a, b) => a.period_start.getTime() - b.period_start.getTime()
    );

    sortedMetrics.forEach((metric) => {
      series.push({
        timestamp: metric.period_end,
        value: Number(metric.win_rate) * 100,
        modelId: comparison.modelId,
        modelName: comparison.modelName,
      });
    });

    return series;
  });
}

/**
 * Format percentage with sign
 */
export function formatPercentage(value: number, decimals: number = 2): string {
  const formatted = Math.abs(value).toFixed(decimals);
  return value >= 0 ? `+${formatted}%` : `-${formatted}%`;
}

/**
 * Format currency value
 */
export function formatCurrency(value: number, decimals: number = 2): string {
  const formatted = Math.abs(value).toFixed(decimals);
  return value >= 0 ? `$${formatted}` : `-$${formatted}`;
}

/**
 * Get color based on performance value
 */
export function getPerformanceColor(value: number): string {
  if (value > 0) return 'text-green-600 dark:text-green-400';
  if (value < 0) return 'text-red-600 dark:text-red-400';
  return 'text-gray-600 dark:text-gray-400';
}

/**
 * Get rank badge color
 */
export function getRankColor(rank: number): string {
  switch (rank) {
    case 1:
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 2:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    case 3:
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
    default:
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
  }
}

