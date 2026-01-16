import { NextRequest, NextResponse } from 'next/server';
import { 
  getCachedDrawdownSeries,
  calculateDrawdownSeries,
  calculateMaxDrawdown,
  validateDateRange,
  type DateRangeFilter 
} from '@/lib/analytics';

/**
 * GET /api/metrics/drawdown
 * 
 * Retrieves drawdown calculations and time-series data.
 * 
 * Query Parameters:
 * - start_date: ISO date string for range start (optional)
 * - end_date: ISO date string for range end (optional)
 * - model_id: Filter by model UUID (optional)
 * - symbol: Filter by trading symbol (optional)
 * - initial_capital: Starting capital for calculations (default: 100000)
 * - series: Set to 'true' to include full time-series (optional)
 * - cache: Set to 'false' to bypass cache (optional)
 * 
 * Response:
 * - 200: Success with drawdown metrics
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
    const initialCapital = parseFloat(searchParams.get('initial_capital') || '100000');
    const includeSeries = searchParams.get('series') === 'true';
    const useCache = searchParams.get('cache') !== 'false';

    // Validate date range
    const dateValidation = validateDateRange(startDate, endDate);
    if (!dateValidation.valid) {
      return NextResponse.json(
        { error: dateValidation.error },
        { status: 400 }
      );
    }

    // Validate initial capital
    if (isNaN(initialCapital) || initialCapital <= 0) {
      return NextResponse.json(
        { error: 'initial_capital must be a positive number' },
        { status: 400 }
      );
    }

    const filters: DateRangeFilter = {
      start_date: startDate,
      end_date: endDate,
      model_id: modelId,
      symbol: symbol,
    };

    // Get max drawdown statistics
    const maxDrawdownStats = await calculateMaxDrawdown(filters, initialCapital);

    // Get time-series if requested
    let series = null;
    if (includeSeries) {
      series = useCache
        ? await getCachedDrawdownSeries(filters, initialCapital)
        : await calculateDrawdownSeries(filters, initialCapital);
    }

    // Calculate additional drawdown metrics
    const additionalMetrics = calculateAdditionalDrawdownMetrics(
      series || await calculateDrawdownSeries(filters, initialCapital),
      initialCapital
    );

    return NextResponse.json({
      success: true,
      data: {
        max_drawdown: maxDrawdownStats.max_drawdown,
        max_drawdown_percentage: maxDrawdownStats.max_drawdown_percentage,
        max_drawdown_date: maxDrawdownStats.max_drawdown_date,
        recovery_date: maxDrawdownStats.recovery_date,
        current_drawdown: maxDrawdownStats.current_drawdown,
        current_drawdown_percentage: maxDrawdownStats.current_drawdown_percentage,
        ...additionalMetrics,
      },
      series: includeSeries ? series : undefined,
      filters: {
        start_date: startDate || null,
        end_date: endDate || null,
        model_id: modelId || null,
        symbol: symbol || null,
        initial_capital: initialCapital,
      },
      meta: {
        series_included: includeSeries,
        series_length: series?.length || 0,
        cached: useCache,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching drawdown data:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch drawdown data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Calculate additional drawdown metrics from series data
 */
function calculateAdditionalDrawdownMetrics(
  series: Array<{
    date: string;
    equity: number;
    drawdown: number;
    drawdown_percentage: number;
    peak_equity: number;
  }>,
  initialCapital: number
) {
  if (series.length === 0) {
    return {
      average_drawdown: 0,
      average_drawdown_percentage: 0,
      time_in_drawdown_percentage: 0,
      drawdown_duration_days: 0,
      max_drawdown_duration_days: 0,
      recovery_factor: null,
      ulcer_index: 0,
      pain_index: 0,
      final_equity: initialCapital,
      total_return: 0,
      total_return_percentage: 0,
    };
  }

  // Calculate average drawdown
  const drawdowns = series.map(s => s.drawdown);
  const drawdownPercentages = series.map(s => s.drawdown_percentage);
  const averageDrawdown = drawdowns.reduce((a, b) => a + b, 0) / drawdowns.length;
  const averageDrawdownPercentage = drawdownPercentages.reduce((a, b) => a + b, 0) / drawdownPercentages.length;

  // Calculate time in drawdown
  const daysInDrawdown = drawdowns.filter(d => d > 0).length;
  const timeInDrawdownPercentage = (daysInDrawdown / series.length) * 100;

  // Calculate drawdown durations
  let currentDuration = 0;
  let maxDuration = 0;
  let durations: number[] = [];

  for (const point of series) {
    if (point.drawdown > 0) {
      currentDuration++;
    } else {
      if (currentDuration > 0) {
        durations.push(currentDuration);
        maxDuration = Math.max(maxDuration, currentDuration);
        currentDuration = 0;
      }
    }
  }
  // Don't forget the last duration if still in drawdown
  if (currentDuration > 0) {
    durations.push(currentDuration);
    maxDuration = Math.max(maxDuration, currentDuration);
  }

  const avgDrawdownDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  // Calculate final equity and returns
  const lastPoint = series[series.length - 1];
  const finalEquity = lastPoint.equity;
  const totalReturn = finalEquity - initialCapital;
  const totalReturnPercentage = ((finalEquity - initialCapital) / initialCapital) * 100;

  // Calculate Recovery Factor (total return / max drawdown)
  const maxDrawdown = Math.max(...drawdowns);
  const recoveryFactor = maxDrawdown > 0 ? totalReturn / maxDrawdown : null;

  // Calculate Ulcer Index (RMS of drawdowns)
  const squaredDrawdowns = drawdownPercentages.map(d => d * d);
  const ulcerIndex = Math.sqrt(squaredDrawdowns.reduce((a, b) => a + b, 0) / squaredDrawdowns.length);

  // Calculate Pain Index (average drawdown weighted by duration)
  const painIndex = averageDrawdownPercentage;

  return {
    average_drawdown: averageDrawdown,
    average_drawdown_percentage: averageDrawdownPercentage,
    time_in_drawdown_percentage: timeInDrawdownPercentage,
    drawdown_duration_days: avgDrawdownDuration,
    max_drawdown_duration_days: maxDuration,
    recovery_factor: recoveryFactor,
    ulcer_index: ulcerIndex,
    pain_index: painIndex,
    final_equity: finalEquity,
    total_return: totalReturn,
    total_return_percentage: totalReturnPercentage,
  };
}
