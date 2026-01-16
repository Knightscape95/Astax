import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import {
  createTrade,
  getTrades,
  closeTrade,
} from '@/lib/db-utils';
import type { CreateTradeInput, TradeFilters } from '@/types/database';

/**
 * GET /api/trades - Get trades with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    
    const filters: TradeFilters = {};
    
    if (searchParams.get('model_id')) {
      filters.model_id = searchParams.get('model_id')!;
    }
    if (searchParams.get('symbol')) {
      filters.symbol = searchParams.get('symbol')!;
    }
    if (searchParams.get('direction')) {
      filters.direction = searchParams.get('direction') as 'long' | 'short';
    }
    if (searchParams.get('status')) {
      filters.status = searchParams.get('status') as 'open' | 'closed' | 'cancelled';
    }
    if (searchParams.get('start_date')) {
      filters.start_date = new Date(searchParams.get('start_date')!);
    }
    if (searchParams.get('end_date')) {
      filters.end_date = new Date(searchParams.get('end_date')!);
    }

    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const sortBy = searchParams.get('sortBy') || 'entry_time';
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';

    const result = await getTrades(filters, { page, limit, sortBy, sortOrder });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching trades:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trades' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/trades - Create a new trade
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    // Validate required fields
    const requiredFields = ['model_id', 'symbol', 'direction', 'entry_price', 'quantity'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    const input: CreateTradeInput = {
      model_id: body.model_id,
      symbol: body.symbol,
      direction: body.direction,
      entry_price: parseFloat(body.entry_price),
      quantity: parseFloat(body.quantity),
      entry_time: body.entry_time ? new Date(body.entry_time) : undefined,
      status: body.status || 'open',
      fees: body.fees ? parseFloat(body.fees) : undefined,
      signal_confidence: body.signal_confidence ? parseFloat(body.signal_confidence) : undefined,
      notes: body.notes,
    };

    const trade = await createTrade(input);

    return NextResponse.json(trade, { status: 201 });
  } catch (error) {
    console.error('Error creating trade:', error);
    return NextResponse.json(
      { error: 'Failed to create trade' },
      { status: 500 }
    );
  }
}
