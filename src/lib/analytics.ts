import { sql } from './db';
import type { Trade, PerformanceMetric, TradeFilters } from '@/types/database';
import { unstable_cache } from 'next/cache';

// ============================================================================
// Types for Analytics
// ============================================================================

export interface PnLDataPoint {
  date: string;
  pnl: number;
  cumulative_pnl: number;
  trade_count: number;
}

export interface DrawdownDataPoint {
  date: string;
  equity: number;
  drawdown: number;
  drawdown_percentage: number;
  peak_equity: number;
}

export interface PerformanceStats {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pnl: number;
  average_pnl: number;
  average_win: number;
  average_loss: number;
  largest_win: number;
  largest_loss: number;
  sharpe_ratio: number | null;
  sortino_ratio: number | null;
  profit_factor: number | null;
  expectancy: number | null;
  avg_holding_period_hours: number | null;
  max_consecutive_wins: number;
  max_consecutive_losses: number;
}

export interface TradeSignal {
  id: string;
  model_id: string;
  symbol: string;
  direction: 'long' | 'short';
  entry_time: Date;
  exit_time: Date | null;
  entry_price: number;
  exit_price: number | null;
  quantity: number;
  pnl: number | null;
  pnl_percentage: number | null;
  signal_confidence: number | null;
  status: 'open' | 'closed' | 'cancelled';
}

export interface DateRangeFilter {
  start_date?: string;
  end_date?: string;
  model_id?: string;
  symbol?: string;
}

// ============================================================================
// P&L Calculations
// ============================================================================

/**
 * Calculate daily P&L time-series data
 */
export async function calculatePnLTimeSeries(
  filters: DateRangeFilter
): Promise<PnLDataPoint[]> {
  const conditions: string[] = ["status = 'closed'"];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.model_id) {
    conditions.push(`model_id = $${paramIndex++}`);
    values.push(filters.model_id);
  }
  if (filters.symbol) {
    conditions.push(`symbol = $${paramIndex++}`);
    values.push(filters.symbol);
  }
  if (filters.start_date) {
    conditions.push(`exit_time >= $${paramIndex++}`);
    values.push(filters.start_date);
  }
  if (filters.end_date) {
    conditions.push(`exit_time <= $${paramIndex++}`);
    values.push(filters.end_date);
  }

  const whereClause = conditions.join(' AND ');

  const result = await sql.query(
    `SELECT 
      DATE(exit_time) as date,
      SUM(COALESCE(pnl, 0)) as daily_pnl,
      COUNT(*) as trade_count
    FROM trades
    WHERE ${whereClause}
    GROUP BY DATE(exit_time)
    ORDER BY date ASC`,
    values
  );

  // Calculate cumulative P&L
  let cumulativePnl = 0;
  return result.rows.map((row: { date: string; daily_pnl: string; trade_count: string }) => {
    cumulativePnl += parseFloat(row.daily_pnl) || 0;
    return {
      date: row.date,
      pnl: parseFloat(row.daily_pnl) || 0,
      cumulative_pnl: cumulativePnl,
      trade_count: parseInt(row.trade_count, 10),
    };
  });
}

/**
 * Get cached P&L time-series data
 */
export const getCachedPnLTimeSeries = unstable_cache(
  async (filters: DateRangeFilter) => calculatePnLTimeSeries(filters),
  ['pnl-timeseries'],
  { revalidate: 300, tags: ['pnl', 'metrics'] } // 5 minute cache
);

// ============================================================================
// Performance Metrics Calculations
// ============================================================================

/**
 * Calculate comprehensive performance statistics
 */
export async function calculatePerformanceStats(
  filters: DateRangeFilter
): Promise<PerformanceStats> {
  const conditions: string[] = ["status = 'closed'"];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.model_id) {
    conditions.push(`model_id = $${paramIndex++}`);
    values.push(filters.model_id);
  }
  if (filters.symbol) {
    conditions.push(`symbol = $${paramIndex++}`);
    values.push(filters.symbol);
  }
  if (filters.start_date) {
    conditions.push(`exit_time >= $${paramIndex++}`);
    values.push(filters.start_date);
  }
  if (filters.end_date) {
    conditions.push(`exit_time <= $${paramIndex++}`);
    values.push(filters.end_date);
  }

  const whereClause = conditions.join(' AND ');

  // Get basic statistics
  const statsResult = await sql.query(
    `SELECT 
      COUNT(*) as total_trades,
      COUNT(CASE WHEN pnl > 0 THEN 1 END) as winning_trades,
      COUNT(CASE WHEN pnl <= 0 THEN 1 END) as losing_trades,
      SUM(COALESCE(pnl, 0)) as total_pnl,
      AVG(COALESCE(pnl, 0)) as average_pnl,
      AVG(CASE WHEN pnl > 0 THEN pnl END) as average_win,
      AVG(CASE WHEN pnl <= 0 THEN pnl END) as average_loss,
      MAX(COALESCE(pnl, 0)) as largest_win,
      MIN(COALESCE(pnl, 0)) as largest_loss,
      SUM(CASE WHEN pnl > 0 THEN pnl ELSE 0 END) as gross_profit,
      ABS(SUM(CASE WHEN pnl < 0 THEN pnl ELSE 0 END)) as gross_loss,
      AVG(EXTRACT(EPOCH FROM (exit_time - entry_time)) / 3600) as avg_holding_hours
    FROM trades
    WHERE ${whereClause}`,
    values
  );

  const stats = statsResult.rows[0];
  const totalTrades = parseInt(stats.total_trades, 10) || 0;
  const winningTrades = parseInt(stats.winning_trades, 10) || 0;
  const losingTrades = parseInt(stats.losing_trades, 10) || 0;
  const totalPnl = parseFloat(stats.total_pnl) || 0;
  const averagePnl = parseFloat(stats.average_pnl) || 0;
  const averageWin = parseFloat(stats.average_win) || 0;
  const averageLoss = parseFloat(stats.average_loss) || 0;
  const grossProfit = parseFloat(stats.gross_profit) || 0;
  const grossLoss = parseFloat(stats.gross_loss) || 0;
  const avgHoldingHours = parseFloat(stats.avg_holding_hours);

  // Calculate win rate
  const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;

  // Calculate profit factor
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;

  // Calculate expectancy
  const expectancy = totalTrades > 0 
    ? (winRate * averageWin) + ((1 - winRate) * averageLoss)
    : null;

  // Calculate Sharpe and Sortino ratios
  const { sharpeRatio, sortinoRatio } = await calculateRiskMetrics(filters, whereClause, values);

  // Calculate consecutive wins/losses
  const { maxConsecutiveWins, maxConsecutiveLosses } = await calculateStreaks(
    filters, whereClause, values
  );

  return {
    total_trades: totalTrades,
    winning_trades: winningTrades,
    losing_trades: losingTrades,
    win_rate: winRate,
    total_pnl: totalPnl,
    average_pnl: averagePnl,
    average_win: averageWin,
    average_loss: averageLoss,
    largest_win: parseFloat(stats.largest_win) || 0,
    largest_loss: parseFloat(stats.largest_loss) || 0,
    sharpe_ratio: sharpeRatio,
    sortino_ratio: sortinoRatio,
    profit_factor: profitFactor,
    expectancy: expectancy,
    avg_holding_period_hours: isNaN(avgHoldingHours) ? null : avgHoldingHours,
    max_consecutive_wins: maxConsecutiveWins,
    max_consecutive_losses: maxConsecutiveLosses,
  };
}

/**
 * Calculate Sharpe and Sortino ratios
 */
async function calculateRiskMetrics(
  filters: DateRangeFilter,
  whereClause: string,
  values: unknown[]
): Promise<{ sharpeRatio: number | null; sortinoRatio: number | null }> {
  // Get daily returns for ratio calculations
  const returnsResult = await sql.query(
    `SELECT 
      DATE(exit_time) as date,
      SUM(COALESCE(pnl_percentage, 0)) as daily_return
    FROM trades
    WHERE ${whereClause}
    GROUP BY DATE(exit_time)
    ORDER BY date ASC`,
    values
  );

  const returns = returnsResult.rows.map((r: { daily_return: string }) => 
    parseFloat(r.daily_return) || 0
  );

  if (returns.length < 2) {
    return { sharpeRatio: null, sortinoRatio: null };
  }

  // Calculate mean return
  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

  // Calculate standard deviation
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  // Calculate downside deviation (for Sortino)
  const negativeReturns = returns.filter(r => r < 0);
  const downsideVariance = negativeReturns.length > 0
    ? negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length
    : 0;
  const downsideDev = Math.sqrt(downsideVariance);

  // Annualized ratios (assuming 252 trading days)
  const annualizationFactor = Math.sqrt(252);
  const riskFreeRate = 0.02 / 252; // ~2% annual risk-free rate

  const sharpeRatio = stdDev > 0 
    ? ((meanReturn - riskFreeRate) / stdDev) * annualizationFactor 
    : null;

  const sortinoRatio = downsideDev > 0 
    ? ((meanReturn - riskFreeRate) / downsideDev) * annualizationFactor 
    : null;

  return { sharpeRatio, sortinoRatio };
}

/**
 * Calculate consecutive win/loss streaks
 */
async function calculateStreaks(
  filters: DateRangeFilter,
  whereClause: string,
  values: unknown[]
): Promise<{ maxConsecutiveWins: number; maxConsecutiveLosses: number }> {
  const tradesResult = await sql.query(
    `SELECT pnl FROM trades 
     WHERE ${whereClause} 
     ORDER BY exit_time ASC`,
    values
  );

  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let currentWins = 0;
  let currentLosses = 0;

  for (const trade of tradesResult.rows) {
    const pnl = parseFloat(trade.pnl) || 0;
    if (pnl > 0) {
      currentWins++;
      currentLosses = 0;
      maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWins);
    } else {
      currentLosses++;
      currentWins = 0;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLosses);
    }
  }

  return { maxConsecutiveWins, maxConsecutiveLosses };
}

/**
 * Get cached performance statistics
 */
export const getCachedPerformanceStats = unstable_cache(
  async (filters: DateRangeFilter) => calculatePerformanceStats(filters),
  ['performance-stats'],
  { revalidate: 300, tags: ['performance', 'metrics'] }
);

// ============================================================================
// Drawdown Calculations
// ============================================================================

/**
 * Calculate drawdown time-series
 */
export async function calculateDrawdownSeries(
  filters: DateRangeFilter,
  initialCapital: number = 100000
): Promise<DrawdownDataPoint[]> {
  const conditions: string[] = ["status = 'closed'"];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.model_id) {
    conditions.push(`model_id = $${paramIndex++}`);
    values.push(filters.model_id);
  }
  if (filters.symbol) {
    conditions.push(`symbol = $${paramIndex++}`);
    values.push(filters.symbol);
  }
  if (filters.start_date) {
    conditions.push(`exit_time >= $${paramIndex++}`);
    values.push(filters.start_date);
  }
  if (filters.end_date) {
    conditions.push(`exit_time <= $${paramIndex++}`);
    values.push(filters.end_date);
  }

  const whereClause = conditions.join(' AND ');

  const result = await sql.query(
    `SELECT 
      DATE(exit_time) as date,
      SUM(COALESCE(pnl, 0)) as daily_pnl
    FROM trades
    WHERE ${whereClause}
    GROUP BY DATE(exit_time)
    ORDER BY date ASC`,
    values
  );

  let equity = initialCapital;
  let peakEquity = initialCapital;
  const drawdownData: DrawdownDataPoint[] = [];

  for (const row of result.rows) {
    equity += parseFloat(row.daily_pnl) || 0;
    peakEquity = Math.max(peakEquity, equity);
    const drawdown = peakEquity - equity;
    const drawdownPercentage = peakEquity > 0 ? (drawdown / peakEquity) * 100 : 0;

    drawdownData.push({
      date: row.date,
      equity,
      drawdown,
      drawdown_percentage: drawdownPercentage,
      peak_equity: peakEquity,
    });
  }

  return drawdownData;
}

/**
 * Calculate maximum drawdown statistics
 */
export async function calculateMaxDrawdown(
  filters: DateRangeFilter,
  initialCapital: number = 100000
): Promise<{
  max_drawdown: number;
  max_drawdown_percentage: number;
  max_drawdown_date: string | null;
  recovery_date: string | null;
  current_drawdown: number;
  current_drawdown_percentage: number;
}> {
  const drawdownSeries = await calculateDrawdownSeries(filters, initialCapital);

  if (drawdownSeries.length === 0) {
    return {
      max_drawdown: 0,
      max_drawdown_percentage: 0,
      max_drawdown_date: null,
      recovery_date: null,
      current_drawdown: 0,
      current_drawdown_percentage: 0,
    };
  }

  let maxDrawdown = 0;
  let maxDrawdownPercentage = 0;
  let maxDrawdownDate: string | null = null;
  let recoveryDate: string | null = null;
  let inDrawdown = false;

  for (const point of drawdownSeries) {
    if (point.drawdown > maxDrawdown) {
      maxDrawdown = point.drawdown;
      maxDrawdownPercentage = point.drawdown_percentage;
      maxDrawdownDate = point.date;
      inDrawdown = true;
      recoveryDate = null;
    } else if (inDrawdown && point.drawdown === 0) {
      recoveryDate = point.date;
      inDrawdown = false;
    }
  }

  const lastPoint = drawdownSeries[drawdownSeries.length - 1];

  return {
    max_drawdown: maxDrawdown,
    max_drawdown_percentage: maxDrawdownPercentage,
    max_drawdown_date: maxDrawdownDate,
    recovery_date: recoveryDate,
    current_drawdown: lastPoint.drawdown,
    current_drawdown_percentage: lastPoint.drawdown_percentage,
  };
}

/**
 * Get cached drawdown series
 */
export const getCachedDrawdownSeries = unstable_cache(
  async (filters: DateRangeFilter, initialCapital: number) => 
    calculateDrawdownSeries(filters, initialCapital),
  ['drawdown-series'],
  { revalidate: 300, tags: ['drawdown', 'metrics'] }
);

// ============================================================================
// Trade History and Signals
// ============================================================================

/**
 * Get trade history with pagination
 */
export async function getTradeHistory(
  filters: DateRangeFilter,
  page: number = 1,
  limit: number = 50,
  sortBy: string = 'entry_time',
  sortOrder: 'asc' | 'desc' = 'desc'
): Promise<{ trades: TradeSignal[]; total: number; totalPages: number }> {
  const conditions: string[] = ['1=1'];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.model_id) {
    conditions.push(`model_id = $${paramIndex++}`);
    values.push(filters.model_id);
  }
  if (filters.symbol) {
    conditions.push(`symbol = $${paramIndex++}`);
    values.push(filters.symbol);
  }
  if (filters.start_date) {
    conditions.push(`entry_time >= $${paramIndex++}`);
    values.push(filters.start_date);
  }
  if (filters.end_date) {
    conditions.push(`entry_time <= $${paramIndex++}`);
    values.push(filters.end_date);
  }

  const whereClause = conditions.join(' AND ');
  const offset = (page - 1) * limit;

  // Get total count
  const countResult = await sql.query(
    `SELECT COUNT(*) as count FROM trades WHERE ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);
  const totalPages = Math.ceil(total / limit);

  // Validate sort column to prevent SQL injection
  const allowedSortColumns = ['entry_time', 'exit_time', 'pnl', 'pnl_percentage', 'symbol', 'status'];
  const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'entry_time';
  const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

  // Get trades
  const tradesResult = await sql.query(
    `SELECT 
      id, model_id, symbol, direction, entry_time, exit_time,
      entry_price, exit_price, quantity, pnl, pnl_percentage,
      signal_confidence, status
    FROM trades
    WHERE ${whereClause}
    ORDER BY ${safeSortBy} ${safeSortOrder}
    LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...values, limit, offset]
  );

  const trades: TradeSignal[] = tradesResult.rows.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    model_id: row.model_id as string,
    symbol: row.symbol as string,
    direction: row.direction as 'long' | 'short',
    entry_time: new Date(row.entry_time as string),
    exit_time: row.exit_time ? new Date(row.exit_time as string) : null,
    entry_price: parseFloat(row.entry_price as string),
    exit_price: row.exit_price ? parseFloat(row.exit_price as string) : null,
    quantity: parseFloat(row.quantity as string),
    pnl: row.pnl ? parseFloat(row.pnl as string) : null,
    pnl_percentage: row.pnl_percentage ? parseFloat(row.pnl_percentage as string) : null,
    signal_confidence: row.signal_confidence ? parseFloat(row.signal_confidence as string) : null,
    status: row.status as 'open' | 'closed' | 'cancelled',
  }));

  return { trades, total, totalPages };
}

/**
 * Get recent trade signals
 */
export async function getRecentSignals(
  modelId?: string,
  limit: number = 10
): Promise<TradeSignal[]> {
  const conditions: string[] = ['1=1'];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (modelId) {
    conditions.push(`model_id = $${paramIndex++}`);
    values.push(modelId);
  }

  const whereClause = conditions.join(' AND ');

  const result = await sql.query(
    `SELECT 
      id, model_id, symbol, direction, entry_time, exit_time,
      entry_price, exit_price, quantity, pnl, pnl_percentage,
      signal_confidence, status
    FROM trades
    WHERE ${whereClause}
    ORDER BY entry_time DESC
    LIMIT $${paramIndex}`,
    [...values, limit]
  );

  return result.rows.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    model_id: row.model_id as string,
    symbol: row.symbol as string,
    direction: row.direction as 'long' | 'short',
    entry_time: new Date(row.entry_time as string),
    exit_time: row.exit_time ? new Date(row.exit_time as string) : null,
    entry_price: parseFloat(row.entry_price as string),
    exit_price: row.exit_price ? parseFloat(row.exit_price as string) : null,
    quantity: parseFloat(row.quantity as string),
    pnl: row.pnl ? parseFloat(row.pnl as string) : null,
    pnl_percentage: row.pnl_percentage ? parseFloat(row.pnl_percentage as string) : null,
    signal_confidence: row.signal_confidence ? parseFloat(row.signal_confidence as string) : null,
    status: row.status as 'open' | 'closed' | 'cancelled',
  }));
}

/**
 * Get cached recent signals
 */
export const getCachedRecentSignals = unstable_cache(
  async (modelId?: string, limit?: number) => getRecentSignals(modelId, limit),
  ['recent-signals'],
  { revalidate: 60, tags: ['signals', 'trades'] } // 1 minute cache
);

// ============================================================================
// Aggregation Helpers
// ============================================================================

/**
 * Get summary statistics by symbol
 */
export async function getStatsBySymbol(
  filters: DateRangeFilter
): Promise<Record<string, PerformanceStats>> {
  const conditions: string[] = ["status = 'closed'"];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.model_id) {
    conditions.push(`model_id = $${paramIndex++}`);
    values.push(filters.model_id);
  }
  if (filters.start_date) {
    conditions.push(`exit_time >= $${paramIndex++}`);
    values.push(filters.start_date);
  }
  if (filters.end_date) {
    conditions.push(`exit_time <= $${paramIndex++}`);
    values.push(filters.end_date);
  }

  const whereClause = conditions.join(' AND ');

  // Get all unique symbols
  const symbolsResult = await sql.query(
    `SELECT DISTINCT symbol FROM trades WHERE ${whereClause}`,
    values
  );

  const statsBySymbol: Record<string, PerformanceStats> = {};

  for (const row of symbolsResult.rows) {
    const symbol = row.symbol as string;
    statsBySymbol[symbol] = await calculatePerformanceStats({
      ...filters,
      symbol,
    });
  }

  return statsBySymbol;
}

/**
 * Get summary statistics by model
 */
export async function getStatsByModel(
  filters: DateRangeFilter
): Promise<Record<string, PerformanceStats>> {
  const conditions: string[] = ["status = 'closed'"];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.symbol) {
    conditions.push(`symbol = $${paramIndex++}`);
    values.push(filters.symbol);
  }
  if (filters.start_date) {
    conditions.push(`exit_time >= $${paramIndex++}`);
    values.push(filters.start_date);
  }
  if (filters.end_date) {
    conditions.push(`exit_time <= $${paramIndex++}`);
    values.push(filters.end_date);
  }

  const whereClause = conditions.join(' AND ');

  // Get all unique model_ids
  const modelsResult = await sql.query(
    `SELECT DISTINCT model_id FROM trades WHERE ${whereClause}`,
    values
  );

  const statsByModel: Record<string, PerformanceStats> = {};

  for (const row of modelsResult.rows) {
    const modelId = row.model_id as string;
    statsByModel[modelId] = await calculatePerformanceStats({
      ...filters,
      model_id: modelId,
    });
  }

  return statsByModel;
}

/**
 * Get cached stats by symbol
 */
export const getCachedStatsBySymbol = unstable_cache(
  async (filters: DateRangeFilter) => getStatsBySymbol(filters),
  ['stats-by-symbol'],
  { revalidate: 600, tags: ['performance', 'metrics'] } // 10 minute cache
);

/**
 * Get cached stats by model
 */
export const getCachedStatsByModel = unstable_cache(
  async (filters: DateRangeFilter) => getStatsByModel(filters),
  ['stats-by-model'],
  { revalidate: 600, tags: ['performance', 'metrics'] }
);

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Invalidate metrics cache
 */
export async function invalidateMetricsCache(): Promise<void> {
  // This function can be called after trades are updated
  // to invalidate the cache. In Next.js, you would use revalidateTag
  // from next/cache in a server action or API route
  console.log('Metrics cache invalidation requested');
}

/**
 * Format date for SQL queries
 */
export function formatDateForQuery(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString();
}

/**
 * Validate date range
 */
export function validateDateRange(
  startDate?: string,
  endDate?: string
): { valid: boolean; error?: string } {
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime())) {
      return { valid: false, error: 'Invalid start_date format' };
    }
    if (isNaN(end.getTime())) {
      return { valid: false, error: 'Invalid end_date format' };
    }
    if (start > end) {
      return { valid: false, error: 'start_date must be before end_date' };
    }
  }
  
  return { valid: true };
}
