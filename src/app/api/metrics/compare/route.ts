import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { Model, PerformanceMetric, Trade } from '@/types/database';
import { ModelComparisonData, calculateAggregatedMetrics } from '@/lib/comparison-utils';

/**
 * GET /api/metrics/compare
 * Compare multiple models side-by-side
 * 
 * Query params:
 * - modelIds: Comma-separated list of model IDs or multiple modelIds params
 * - period: Optional time period (7d, 30d, 90d, 1y, all)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // Get model IDs from query params (supports both comma-separated and multiple params)
    const modelIdsParam = searchParams.getAll('modelIds');
    const modelIds = modelIdsParam.length > 0
      ? modelIdsParam.flatMap(param => param.split(','))
      : [];

    if (modelIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one model ID is required' },
        { status: 400 }
      );
    }

    if (modelIds.length > 10) {
      return NextResponse.json(
        { error: 'Maximum of 10 models can be compared at once' },
        { status: 400 }
      );
    }

    // Get period filter
    const period = searchParams.get('period') || 'all';
    const startDate = getPeriodStartDate(period);

    // Fetch data for all models in parallel
    const comparisons = await Promise.all(
      modelIds.map(async (modelId) => {
        try {
          return await fetchModelComparisonData(modelId, startDate);
        } catch (error) {
          console.error(`Error fetching data for model ${modelId}:`, error);
          return null;
        }
      })
    );

    // Filter out any failed fetches
    const validComparisons = comparisons.filter(
      (c): c is ModelComparisonData => c !== null
    );

    if (validComparisons.length === 0) {
      return NextResponse.json(
        { error: 'No valid model data found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      comparisons: validComparisons,
      period,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in /api/metrics/compare:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Fetch all comparison data for a single model
 */
async function fetchModelComparisonData(
  modelId: string,
  startDate: Date | null
): Promise<ModelComparisonData> {
  // Fetch model info
  const modelResult = await sql`
    SELECT *
    FROM models
    WHERE id = ${modelId}
    LIMIT 1
  `;

  if (modelResult.rowCount === 0) {
    throw new Error(`Model ${modelId} not found`);
  }

  const model = modelResult.rows[0] as Model;

  // Fetch performance metrics
  const metricsQuery = startDate
    ? sql`
        SELECT *
        FROM performance_metrics
        WHERE model_id = ${modelId}
          AND period_end >= ${startDate.toISOString()}
        ORDER BY period_start ASC
      `
    : sql`
        SELECT *
        FROM performance_metrics
        WHERE model_id = ${modelId}
        ORDER BY period_start ASC
      `;

  const metricsResult = await metricsQuery;
  const metrics = metricsResult.rows.map(row => ({
    ...row,
    period_start: new Date(row.period_start),
    period_end: new Date(row.period_end),
    created_at: new Date(row.created_at),
  })) as PerformanceMetric[];

  // Fetch trades
  const tradesQuery = startDate
    ? sql`
        SELECT *
        FROM trades
        WHERE model_id = ${modelId}
          AND entry_time >= ${startDate.toISOString()}
        ORDER BY entry_time ASC
      `
    : sql`
        SELECT *
        FROM trades
        WHERE model_id = ${modelId}
        ORDER BY entry_time ASC
      `;

  const tradesResult = await tradesQuery;
  const trades = tradesResult.rows.map(row => ({
    ...row,
    entry_time: new Date(row.entry_time),
    exit_time: row.exit_time ? new Date(row.exit_time) : null,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  })) as Trade[];

  // Calculate aggregated metrics
  const aggregatedMetrics = calculateAggregatedMetrics(metrics);

  return {
    modelId: model.id,
    modelName: model.name,
    metrics,
    trades,
    aggregatedMetrics,
  };
}

/**
 * Get start date based on period filter
 */
function getPeriodStartDate(period: string): Date | null {
  const now = new Date();
  
  switch (period) {
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case '1y':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    case 'all':
    default:
      return null;
  }
}
