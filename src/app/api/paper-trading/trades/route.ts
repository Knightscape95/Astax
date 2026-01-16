/**
 * Paper Trading Trades API
 * 
 * Get trade history for a portfolio
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getPaperTrades, getPaperPortfolio } from '@/lib/paper-trading';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get('portfolio_id');

    if (!portfolioId) {
      return NextResponse.json({ error: 'portfolio_id required' }, { status: 400 });
    }

    // Verify ownership
    const portfolio = await getPaperPortfolio(portfolioId);
    if (!portfolio || portfolio.user_id !== session.user.email) {
      return NextResponse.json({ error: 'Portfolio not found or unauthorized' }, { status: 404 });
    }

    // Parse filters
    const filters: {
      symbol?: string;
      side?: 'buy' | 'sell';
      status?: 'pending' | 'executed' | 'partial' | 'cancelled' | 'rejected';
      modelId?: string;
      startDate?: Date;
      endDate?: Date;
    } = {};

    if (searchParams.get('symbol')) filters.symbol = searchParams.get('symbol')!;
    if (searchParams.get('side')) filters.side = searchParams.get('side') as 'buy' | 'sell';
    if (searchParams.get('status')) filters.status = searchParams.get('status') as typeof filters.status;
    if (searchParams.get('model_id')) filters.modelId = searchParams.get('model_id')!;
    if (searchParams.get('start_date')) filters.startDate = new Date(searchParams.get('start_date')!);
    if (searchParams.get('end_date')) filters.endDate = new Date(searchParams.get('end_date')!);

    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const result = await getPaperTrades(portfolioId, filters, { page, limit });

    return NextResponse.json({
      trades: result.trades,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching trades:', error);
    return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
  }
}
