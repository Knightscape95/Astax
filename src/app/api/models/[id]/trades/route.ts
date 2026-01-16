import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getTradesByModel, calculatePerformanceMetrics, createPerformanceMetric } from '@/lib/db-utils';

interface RouteParams {
  params: { id: string };
}

/**
 * GET /api/models/[id]/trades - Get all trades for a model
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as 'open' | 'closed' | 'cancelled' | null;

    const trades = await getTradesByModel(params.id, status || undefined);

    return NextResponse.json({ trades });
  } catch (error) {
    console.error('Error fetching model trades:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trades' },
      { status: 500 }
    );
  }
}
