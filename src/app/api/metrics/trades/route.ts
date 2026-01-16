import { NextRequest, NextResponse } from 'next/server';
import { 
  getTradeHistory,
  getCachedRecentSignals,
  getRecentSignals,
  validateDateRange,
  type DateRangeFilter 
} from '@/lib/analytics';

/**
 * GET /api/metrics/trades
 * 
 * Retrieves trade history and signals with pagination and filtering.
 * 
 * Query Parameters:
 * - start_date: ISO date string for range start (optional)
 * - end_date: ISO date string for range end (optional)
 * - model_id: Filter by model UUID (optional)
 * - symbol: Filter by trading symbol (optional)
 * - status: Filter by trade status ('open', 'closed', 'cancelled') (optional)
 * - page: Page number for pagination (default: 1)
 * - limit: Items per page (default: 50, max: 100)
 * - sort_by: Sort field ('entry_time', 'exit_time', 'pnl', 'pnl_percentage', 'symbol', 'status') (default: 'entry_time')
 * - sort_order: 'asc' or 'desc' (default: 'desc')
 * - recent: Set to 'true' to get only recent signals (ignores pagination)
 * - cache: Set to 'false' to bypass cache (optional)
 * 
 * Response:
 * - 200: Success with trades array and pagination info
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
    const status = searchParams.get('status') as 'open' | 'closed' | 'cancelled' | null;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const sortBy = searchParams.get('sort_by') || 'entry_time';
    const sortOrder = (searchParams.get('sort_order') || 'desc') as 'asc' | 'desc';
    const recentOnly = searchParams.get('recent') === 'true';
    const useCache = searchParams.get('cache') !== 'false';

    // Validate date range
    const dateValidation = validateDateRange(startDate, endDate);
    if (!dateValidation.valid) {
      return NextResponse.json(
        { error: dateValidation.error },
        { status: 400 }
      );
    }

    // Validate status parameter
    if (status && !['open', 'closed', 'cancelled'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status parameter. Must be "open", "closed", or "cancelled"' },
        { status: 400 }
      );
    }

    // Validate sort parameters
    const allowedSortColumns = ['entry_time', 'exit_time', 'pnl', 'pnl_percentage', 'symbol', 'status'];
    if (!allowedSortColumns.includes(sortBy)) {
      return NextResponse.json(
        { error: `Invalid sort_by parameter. Must be one of: ${allowedSortColumns.join(', ')}` },
        { status: 400 }
      );
    }

    if (!['asc', 'desc'].includes(sortOrder)) {
      return NextResponse.json(
        { error: 'Invalid sort_order parameter. Must be "asc" or "desc"' },
        { status: 400 }
      );
    }

    // Validate pagination
    if (page < 1) {
      return NextResponse.json(
        { error: 'Page number must be at least 1' },
        { status: 400 }
      );
    }

    if (limit < 1) {
      return NextResponse.json(
        { error: 'Limit must be at least 1' },
        { status: 400 }
      );
    }

    const filters: DateRangeFilter = {
      start_date: startDate,
      end_date: endDate,
      model_id: modelId,
      symbol: symbol,
    };

    // Handle recent signals request
    if (recentOnly) {
      const signals = useCache
        ? await getCachedRecentSignals(modelId, limit)
        : await getRecentSignals(modelId, limit);

      return NextResponse.json({
        success: true,
        data: signals,
        filters: {
          model_id: modelId || null,
        },
        meta: {
          count: signals.length,
          cached: useCache,
          generated_at: new Date().toISOString(),
        },
      });
    }

    // Get paginated trade history
    const { trades, total, totalPages } = await getTradeHistory(
      filters,
      page,
      limit,
      sortBy,
      sortOrder
    );

    // Calculate summary statistics for the returned trades
    const summary = calculateTradesSummary(trades);

    return NextResponse.json({
      success: true,
      data: trades,
      summary,
      pagination: {
        page,
        limit,
        total,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1,
      },
      filters: {
        start_date: startDate || null,
        end_date: endDate || null,
        model_id: modelId || null,
        symbol: symbol || null,
        status: status || null,
      },
      sort: {
        by: sortBy,
        order: sortOrder,
      },
      meta: {
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching trades:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch trades',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Calculate summary statistics for trades
 */
function calculateTradesSummary(trades: Array<{
  pnl: number | null;
  pnl_percentage: number | null;
  status: string;
  direction: string;
}>) {
  if (trades.length === 0) {
    return {
      total_count: 0,
      open_count: 0,
      closed_count: 0,
      cancelled_count: 0,
      long_count: 0,
      short_count: 0,
      total_pnl: 0,
      winning_count: 0,
      losing_count: 0,
    };
  }

  const closedTrades = trades.filter(t => t.status === 'closed');
  const pnls = closedTrades.map(t => t.pnl || 0);
  const totalPnl = pnls.reduce((a, b) => a + b, 0);

  return {
    total_count: trades.length,
    open_count: trades.filter(t => t.status === 'open').length,
    closed_count: closedTrades.length,
    cancelled_count: trades.filter(t => t.status === 'cancelled').length,
    long_count: trades.filter(t => t.direction === 'long').length,
    short_count: trades.filter(t => t.direction === 'short').length,
    total_pnl: totalPnl,
    winning_count: pnls.filter(p => p > 0).length,
    losing_count: pnls.filter(p => p < 0).length,
  };
}
