import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import {
  getPerformanceMetrics,
  getLatestPerformanceMetric,
  calculatePerformanceMetrics,
  createPerformanceMetric,
} from '@/lib/db-utils';

interface RouteParams {
  params: { id: string };
}

/**
 * GET /api/models/[id]/performance - Get performance metrics for a model
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const latest = searchParams.get('latest') === 'true';
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    if (latest) {
      const metric = await getLatestPerformanceMetric(params.id);
      return NextResponse.json({ metric });
    }

    const filters: { model_id: string; start_date?: Date; end_date?: Date } = {
      model_id: params.id,
    };

    if (startDate) {
      filters.start_date = new Date(startDate);
    }
    if (endDate) {
      filters.end_date = new Date(endDate);
    }

    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const result = await getPerformanceMetrics(filters, { page, limit });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching performance metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/models/[id]/performance - Calculate and save performance metrics
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { period_start, period_end } = body;

    if (!period_start || !period_end) {
      return NextResponse.json(
        { error: 'period_start and period_end are required' },
        { status: 400 }
      );
    }

    // Calculate metrics from trades
    const metricsInput = await calculatePerformanceMetrics(
      params.id,
      new Date(period_start),
      new Date(period_end)
    );

    // Save to database
    const metric = await createPerformanceMetric(metricsInput);

    return NextResponse.json(metric, { status: 201 });
  } catch (error) {
    console.error('Error calculating performance metrics:', error);
    return NextResponse.json(
      { error: 'Failed to calculate metrics' },
      { status: 500 }
    );
  }
}
