import { NextRequest, NextResponse } from 'next/server';
import { 
  getCachedPerformanceStats, 
  calculatePerformanceStats,
  getCachedStatsBySymbol,
  getCachedStatsByModel,
  getStatsBySymbol,
  getStatsByModel,
  validateDateRange,
  type DateRangeFilter 
} from '@/lib/analytics';

/**
 * GET /api/metrics/performance
 * 
 * Retrieves performance metrics including win rate, Sharpe ratio, and accuracy.
 * 
 * Query Parameters:
 * - start_date: ISO date string for range start (optional)
 * - end_date: ISO date string for range end (optional)
 * - model_id: Filter by model UUID (optional)
 * - symbol: Filter by trading symbol (optional)
 * - group_by: 'symbol' | 'model' for grouped statistics (optional)
 * - cache: Set to 'false' to bypass cache (optional)
 * 
 * Response:
 * - 200: Success with performance metrics
 * - 400: Invalid parameters
 * - 500: Server error
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    const startDate = searchParams.get('start_date') || undefined;
    const endDate = searchParams.get('end_date') || undefined;
    const modelId = searchParams.get('model_id') || undefined;
    const symbol = searchParams.get('symbol') || undefined;
    const groupBy = searchParams.get('group_by') as 'symbol' | 'model' | null;
    const useCache = searchParams.get('cache') !== 'false';

    // Validate date range
    const dateValidation = validateDateRange(startDate, endDate);
    if (!dateValidation.valid) {
      return NextResponse.json(
        { error: dateValidation.error },
        { status: 400 }
      );
    }

    // Validate group_by parameter
    if (groupBy && !['symbol', 'model'].includes(groupBy)) {
      return NextResponse.json(
        { error: 'Invalid group_by parameter. Must be "symbol" or "model"' },
        { status: 400 }
      );
    }

    const filters: DateRangeFilter = {
      start_date: startDate,
      end_date: endDate,
      model_id: modelId,
      symbol: symbol,
    };

    // Handle grouped statistics
    if (groupBy === 'symbol') {
      const groupedStats = useCache
        ? await getCachedStatsBySymbol(filters)
        : await getStatsBySymbol(filters);

      return NextResponse.json({
        success: true,
        data: groupedStats,
        group_by: 'symbol',
        filters: {
          start_date: startDate || null,
          end_date: endDate || null,
          model_id: modelId || null,
        },
        meta: {
          groups: Object.keys(groupedStats).length,
          cached: useCache,
          generated_at: new Date().toISOString(),
        },
      });
    }

    if (groupBy === 'model') {
      const groupedStats = useCache
        ? await getCachedStatsByModel(filters)
        : await getStatsByModel(filters);

      return NextResponse.json({
        success: true,
        data: groupedStats,
        group_by: 'model',
        filters: {
          start_date: startDate || null,
          end_date: endDate || null,
          symbol: symbol || null,
        },
        meta: {
          groups: Object.keys(groupedStats).length,
          cached: useCache,
          generated_at: new Date().toISOString(),
        },
      });
    }

    // Get overall performance statistics
    const stats = useCache
      ? await getCachedPerformanceStats(filters)
      : await calculatePerformanceStats(filters);

    // Calculate additional derived metrics
    const derivedMetrics = calculateDerivedMetrics(stats);

    return NextResponse.json({
      success: true,
      data: {
        ...stats,
        ...derivedMetrics,
      },
      filters: {
        start_date: startDate || null,
        end_date: endDate || null,
        model_id: modelId || null,
        symbol: symbol || null,
      },
      meta: {
        cached: useCache,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching performance metrics:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch performance metrics',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Calculate additional derived metrics
 */
function calculateDerivedMetrics(stats: {
  winning_trades: number;
  losing_trades: number;
  total_trades: number;
  average_win: number;
  average_loss: number;
  win_rate: number;
  sharpe_ratio: number | null;
  total_pnl: number;
}) {
  const { winning_trades, losing_trades, total_trades, average_win, average_loss } = stats;

  // Risk/Reward Ratio
  const riskRewardRatio = average_loss !== 0 
    ? Math.abs(average_win / average_loss) 
    : null;

  // Kelly Criterion (optimal bet size)
  const kellyCriterion = stats.win_rate > 0 && riskRewardRatio
    ? stats.win_rate - ((1 - stats.win_rate) / riskRewardRatio)
    : null;

  // Accuracy metrics
  const accuracy = total_trades > 0 ? winning_trades / total_trades : 0;
  
  // Precision (positive predictive value for profitable trades)
  const precision = (winning_trades + losing_trades) > 0
    ? winning_trades / (winning_trades + losing_trades)
    : 0;

  // Performance grade based on multiple factors
  const performanceGrade = calculatePerformanceGrade(stats);

  return {
    risk_reward_ratio: riskRewardRatio,
    kelly_criterion: kellyCriterion,
    accuracy: accuracy,
    precision: precision,
    performance_grade: performanceGrade,
  };
}

/**
 * Calculate a letter grade for performance
 */
function calculatePerformanceGrade(stats: {
  win_rate: number;
  sharpe_ratio: number | null;
  total_pnl: number;
  total_trades: number;
}): string {
  let score = 0;
  let factors = 0;

  // Win rate contribution (0-30 points)
  if (stats.win_rate >= 0.6) score += 30;
  else if (stats.win_rate >= 0.5) score += 20;
  else if (stats.win_rate >= 0.4) score += 10;
  factors++;

  // Sharpe ratio contribution (0-30 points)
  if (stats.sharpe_ratio !== null) {
    if (stats.sharpe_ratio >= 2) score += 30;
    else if (stats.sharpe_ratio >= 1) score += 20;
    else if (stats.sharpe_ratio >= 0.5) score += 10;
    factors++;
  }

  // Profitability contribution (0-20 points)
  if (stats.total_pnl > 0) score += 20;
  else if (stats.total_pnl >= 0) score += 10;
  factors++;

  // Trade count contribution (0-20 points) - rewards statistical significance
  if (stats.total_trades >= 100) score += 20;
  else if (stats.total_trades >= 50) score += 15;
  else if (stats.total_trades >= 20) score += 10;
  else if (stats.total_trades >= 10) score += 5;
  factors++;

  // Normalize score
  const maxScore = factors * 25; // Each factor can contribute up to 25 points on average
  const normalizedScore = factors > 0 ? (score / maxScore) * 100 : 0;

  // Assign grade
  if (normalizedScore >= 90) return 'A+';
  if (normalizedScore >= 80) return 'A';
  if (normalizedScore >= 70) return 'B+';
  if (normalizedScore >= 60) return 'B';
  if (normalizedScore >= 50) return 'C+';
  if (normalizedScore >= 40) return 'C';
  if (normalizedScore >= 30) return 'D';
  return 'F';
}
