import { NextRequest, NextResponse } from 'next/server';
import { 
  getCachedPnLTimeSeries, 
  calculatePnLTimeSeries,
  validateDateRange,
  type DateRangeFilter 
} from '@/lib/analytics';

/**
 * GET /api/metrics/pnl
 * 
 * Retrieves P&L time-series data with date range filtering.
 * 
 * Query Parameters:
 * - start_date: ISO date string for range start (optional)
 * - end_date: ISO date string for range end (optional)
 * - model_id: Filter by model UUID (optional)
 * - symbol: Filter by trading symbol (optional)
 * - cache: Set to 'false' to bypass cache (optional)
 * 
 * Response:
 * - 200: Success with P&L data array
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
    const useCache = searchParams.get('cache') !== 'false';

    // Validate date range
    const dateValidation = validateDateRange(startDate, endDate);
    if (!dateValidation.valid) {
      return NextResponse.json(
        { error: dateValidation.error },
        { status: 400 }
      );
    }

    const filters: DateRangeFilter = {
      start_date: startDate,
      end_date: endDate,
      model_id: modelId,
      symbol: symbol,
    };

    // Use cached or fresh data based on parameter
    const pnlData = useCache 
      ? await getCachedPnLTimeSeries(filters)
      : await calculatePnLTimeSeries(filters);

    // Calculate summary statistics
    const summary = calculatePnLSummary(pnlData);

    return NextResponse.json({
      success: true,
      data: pnlData,
      summary,
      filters: {
        start_date: startDate || null,
        end_date: endDate || null,
        model_id: modelId || null,
        symbol: symbol || null,
      },
      meta: {
        count: pnlData.length,
        cached: useCache,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching P&L data:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch P&L data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Calculate summary statistics from P&L data
 */
function calculatePnLSummary(pnlData: Array<{ pnl: number; cumulative_pnl: number; trade_count: number }>) {
  if (pnlData.length === 0) {
    return {
      total_pnl: 0,
      average_daily_pnl: 0,
      best_day: 0,
      worst_day: 0,
      profitable_days: 0,
      losing_days: 0,
      total_trades: 0,
    };
  }

  const pnls = pnlData.map(d => d.pnl);
  const totalPnl = pnlData[pnlData.length - 1].cumulative_pnl;
  const averageDailyPnl = pnls.reduce((a, b) => a + b, 0) / pnls.length;
  const bestDay = Math.max(...pnls);
  const worstDay = Math.min(...pnls);
  const profitableDays = pnls.filter(p => p > 0).length;
  const losingDays = pnls.filter(p => p < 0).length;
  const totalTrades = pnlData.reduce((sum, d) => sum + d.trade_count, 0);

  return {
    total_pnl: totalPnl,
    average_daily_pnl: averageDailyPnl,
    best_day: bestDay,
    worst_day: worstDay,
    profitable_days: profitableDays,
    losing_days: losingDays,
    total_trades: totalTrades,
  };
}
