import { sql, transaction, getClient } from '../db';
import { 
  calculatePerformanceStats, 
  calculateMaxDrawdown, 
  calculatePnLTimeSeries,
  type DateRangeFilter 
} from '../analytics';
import type { CreatePerformanceMetricInput } from '@/types/database';

// ============================================================================
// Types for Background Jobs
// ============================================================================

export interface MetricsJobConfig {
  /** How often to run the job in milliseconds */
  intervalMs: number;
  /** Whether to run immediately on start */
  runOnStart: boolean;
  /** Batch size for processing models */
  batchSize: number;
  /** Period types to calculate (e.g., 'daily', 'weekly', 'monthly') */
  periods: PeriodType[];
}

export type PeriodType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'all_time';

export interface JobResult {
  success: boolean;
  modelsProcessed: number;
  metricsCreated: number;
  errors: string[];
  duration: number;
  startedAt: Date;
  completedAt: Date;
}

// ============================================================================
// Period Date Helpers
// ============================================================================

/**
 * Get date range for a given period type
 */
function getPeriodDateRange(period: PeriodType, referenceDate: Date = new Date()): {
  start: Date;
  end: Date;
} {
  const end = new Date(referenceDate);
  end.setHours(23, 59, 59, 999);
  
  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);

  switch (period) {
    case 'daily':
      // Same day
      break;
    case 'weekly':
      // Last 7 days
      start.setDate(start.getDate() - 7);
      break;
    case 'monthly':
      // Last 30 days
      start.setDate(start.getDate() - 30);
      break;
    case 'quarterly':
      // Last 90 days
      start.setDate(start.getDate() - 90);
      break;
    case 'yearly':
      // Last 365 days
      start.setDate(start.getDate() - 365);
      break;
    case 'all_time':
      // From beginning of time
      start.setFullYear(2000, 0, 1);
      break;
  }

  return { start, end };
}

/**
 * Format date for SQL
 */
function formatDate(date: Date): string {
  return date.toISOString();
}

// ============================================================================
// Metrics Update Functions
// ============================================================================

/**
 * Update performance metrics for a single model
 */
async function updateModelMetrics(
  modelId: string,
  period: PeriodType,
  referenceDate: Date = new Date()
): Promise<{ success: boolean; error?: string }> {
  try {
    const { start, end } = getPeriodDateRange(period, referenceDate);
    
    const filters: DateRangeFilter = {
      model_id: modelId,
      start_date: formatDate(start),
      end_date: formatDate(end),
    };

    // Calculate performance stats
    const stats = await calculatePerformanceStats(filters);
    
    // Skip if no trades in period
    if (stats.total_trades === 0) {
      return { success: true };
    }

    // Calculate drawdown stats
    const drawdownStats = await calculateMaxDrawdown(filters);

    // Prepare the metrics record
    const metrics: CreatePerformanceMetricInput = {
      model_id: modelId,
      period_start: start,
      period_end: end,
      total_trades: stats.total_trades,
      winning_trades: stats.winning_trades,
      losing_trades: stats.losing_trades,
      win_rate: stats.win_rate,
      total_pnl: stats.total_pnl,
      total_pnl_percentage: stats.total_pnl, // Would need capital for accurate %
      average_pnl: stats.average_pnl,
      average_win: stats.average_win,
      average_loss: stats.average_loss,
      max_drawdown: drawdownStats.max_drawdown,
      max_drawdown_percentage: drawdownStats.max_drawdown_percentage,
      sharpe_ratio: stats.sharpe_ratio || undefined,
      sortino_ratio: stats.sortino_ratio || undefined,
      profit_factor: stats.profit_factor || undefined,
      expectancy: stats.expectancy || undefined,
      avg_holding_period_hours: stats.avg_holding_period_hours || undefined,
    };

    // Upsert the metrics (insert or update if exists)
    await sql`
      INSERT INTO performance_metrics (
        model_id, period_start, period_end, total_trades, winning_trades,
        losing_trades, win_rate, total_pnl, total_pnl_percentage, average_pnl,
        average_win, average_loss, max_drawdown, max_drawdown_percentage,
        sharpe_ratio, sortino_ratio, profit_factor, expectancy, avg_holding_period_hours
      ) VALUES (
        ${metrics.model_id},
        ${metrics.period_start.toISOString()},
        ${metrics.period_end.toISOString()},
        ${metrics.total_trades},
        ${metrics.winning_trades},
        ${metrics.losing_trades},
        ${metrics.win_rate},
        ${metrics.total_pnl},
        ${metrics.total_pnl_percentage},
        ${metrics.average_pnl},
        ${metrics.average_win},
        ${metrics.average_loss},
        ${metrics.max_drawdown},
        ${metrics.max_drawdown_percentage},
        ${metrics.sharpe_ratio || null},
        ${metrics.sortino_ratio || null},
        ${metrics.profit_factor || null},
        ${metrics.expectancy || null},
        ${metrics.avg_holding_period_hours || null}
      )
      ON CONFLICT (model_id, period_start, period_end)
      DO UPDATE SET
        total_trades = EXCLUDED.total_trades,
        winning_trades = EXCLUDED.winning_trades,
        losing_trades = EXCLUDED.losing_trades,
        win_rate = EXCLUDED.win_rate,
        total_pnl = EXCLUDED.total_pnl,
        total_pnl_percentage = EXCLUDED.total_pnl_percentage,
        average_pnl = EXCLUDED.average_pnl,
        average_win = EXCLUDED.average_win,
        average_loss = EXCLUDED.average_loss,
        max_drawdown = EXCLUDED.max_drawdown,
        max_drawdown_percentage = EXCLUDED.max_drawdown_percentage,
        sharpe_ratio = EXCLUDED.sharpe_ratio,
        sortino_ratio = EXCLUDED.sortino_ratio,
        profit_factor = EXCLUDED.profit_factor,
        expectancy = EXCLUDED.expectancy,
        avg_holding_period_hours = EXCLUDED.avg_holding_period_hours
    `;

    return { success: true };
  } catch (error) {
    console.error(`Error updating metrics for model ${modelId}:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Get all active model IDs
 */
async function getActiveModelIds(): Promise<string[]> {
  const result = await sql`
    SELECT id FROM models WHERE status = 'active'
  `;
  return result.rows.map((row) => (row as { id: string }).id);
}

/**
 * Get all model IDs with trades
 */
async function getModelsWithTrades(): Promise<string[]> {
  const result = await sql`
    SELECT DISTINCT model_id FROM trades
  `;
  return result.rows.map((row) => (row as { model_id: string }).model_id);
}

// ============================================================================
// Main Job Runner
// ============================================================================

/**
 * Run the metrics update job
 */
export async function runMetricsUpdateJob(
  config: Partial<MetricsJobConfig> = {}
): Promise<JobResult> {
  const startTime = new Date();
  const errors: string[] = [];
  let modelsProcessed = 0;
  let metricsCreated = 0;

  const {
    batchSize = 10,
    periods = ['daily', 'weekly', 'monthly'],
  } = config;

  try {
    console.log('[MetricsJob] Starting metrics update job...');

    // Get all models with trades
    const modelIds = await getModelsWithTrades();
    console.log(`[MetricsJob] Found ${modelIds.length} models with trades`);

    // Process models in batches
    for (let i = 0; i < modelIds.length; i += batchSize) {
      const batch = modelIds.slice(i, i + batchSize);
      
      // Process batch in parallel
      const results = await Promise.all(
        batch.flatMap(modelId =>
          periods.map(async period => {
            const result = await updateModelMetrics(modelId, period);
            if (result.success) {
              metricsCreated++;
            } else if (result.error) {
              errors.push(`Model ${modelId} (${period}): ${result.error}`);
            }
            return result;
          })
        )
      );

      modelsProcessed += batch.length;
      console.log(`[MetricsJob] Processed ${modelsProcessed}/${modelIds.length} models`);
    }

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    console.log(`[MetricsJob] Completed in ${duration}ms`);
    console.log(`[MetricsJob] Models processed: ${modelsProcessed}`);
    console.log(`[MetricsJob] Metrics created/updated: ${metricsCreated}`);
    if (errors.length > 0) {
      console.log(`[MetricsJob] Errors: ${errors.length}`);
    }

    return {
      success: errors.length === 0,
      modelsProcessed,
      metricsCreated,
      errors,
      duration,
      startedAt: startTime,
      completedAt: endTime,
    };
  } catch (error) {
    const endTime = new Date();
    console.error('[MetricsJob] Job failed:', error);
    
    return {
      success: false,
      modelsProcessed,
      metricsCreated,
      errors: [...errors, error instanceof Error ? error.message : 'Unknown error'],
      duration: endTime.getTime() - startTime.getTime(),
      startedAt: startTime,
      completedAt: endTime,
    };
  }
}

// ============================================================================
// Scheduled Job Manager
// ============================================================================

let jobIntervalId: NodeJS.Timeout | null = null;
let isJobRunning = false;

/**
 * Start the scheduled metrics update job
 */
export function startMetricsScheduler(config: MetricsJobConfig): void {
  if (jobIntervalId) {
    console.warn('[MetricsScheduler] Scheduler already running');
    return;
  }

  const { intervalMs, runOnStart, ...jobConfig } = config;

  console.log(`[MetricsScheduler] Starting scheduler with ${intervalMs}ms interval`);

  // Run immediately if configured
  if (runOnStart) {
    runJobWithLock(jobConfig);
  }

  // Schedule periodic runs
  jobIntervalId = setInterval(() => {
    runJobWithLock(jobConfig);
  }, intervalMs);
}

/**
 * Stop the scheduled metrics update job
 */
export function stopMetricsScheduler(): void {
  if (jobIntervalId) {
    clearInterval(jobIntervalId);
    jobIntervalId = null;
    console.log('[MetricsScheduler] Scheduler stopped');
  }
}

/**
 * Check if the scheduler is running
 */
export function isSchedulerRunning(): boolean {
  return jobIntervalId !== null;
}

/**
 * Run job with lock to prevent concurrent executions
 */
async function runJobWithLock(config: Partial<MetricsJobConfig>): Promise<void> {
  if (isJobRunning) {
    console.log('[MetricsScheduler] Job already running, skipping...');
    return;
  }

  isJobRunning = true;
  try {
    await runMetricsUpdateJob(config);
  } finally {
    isJobRunning = false;
  }
}

// ============================================================================
// Manual Trigger Functions
// ============================================================================

/**
 * Manually trigger metrics update for a specific model
 */
export async function updateMetricsForModel(
  modelId: string,
  periods: PeriodType[] = ['daily', 'weekly', 'monthly']
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];

  for (const period of periods) {
    const result = await updateModelMetrics(modelId, period);
    if (!result.success && result.error) {
      errors.push(`${period}: ${result.error}`);
    }
  }

  return {
    success: errors.length === 0,
    errors,
  };
}

/**
 * Manually trigger metrics update for all models
 */
export async function updateAllMetrics(
  periods: PeriodType[] = ['daily', 'weekly', 'monthly']
): Promise<JobResult> {
  return runMetricsUpdateJob({ periods });
}

/**
 * Clean up old metrics (older than specified days)
 */
export async function cleanupOldMetrics(olderThanDays: number = 365): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const result = await sql`
    DELETE FROM performance_metrics 
    WHERE period_end < ${cutoffDate.toISOString()}
    RETURNING id
  `;

  console.log(`[MetricsCleanup] Deleted ${result.rowCount} old metrics records`);
  return result.rowCount || 0;
}

// ============================================================================
// Default Export for Convenience
// ============================================================================

export default {
  runMetricsUpdateJob,
  startMetricsScheduler,
  stopMetricsScheduler,
  isSchedulerRunning,
  updateMetricsForModel,
  updateAllMetrics,
  cleanupOldMetrics,
};
