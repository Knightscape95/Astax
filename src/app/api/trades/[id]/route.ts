import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import {
  getTradeById,
  updateTrade,
  deleteTrade,
  closeTrade,
} from '@/lib/db-utils';
import type { UpdateTradeInput } from '@/types/database';

interface RouteParams {
  params: { id: string };
}

/**
 * GET /api/trades/[id] - Get a specific trade
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const trade = await getTradeById(params.id);

    if (!trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    return NextResponse.json(trade);
  } catch (error) {
    console.error('Error fetching trade:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trade' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/trades/[id] - Update a trade
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    // Check if this is a close operation
    if (body.action === 'close') {
      if (!body.exit_price) {
        return NextResponse.json(
          { error: 'exit_price is required to close a trade' },
          { status: 400 }
        );
      }

      const trade = await closeTrade(
        params.id,
        parseFloat(body.exit_price),
        body.exit_time ? new Date(body.exit_time) : undefined
      );

      if (!trade) {
        return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
      }

      return NextResponse.json(trade);
    }

    // Regular update
    const input: UpdateTradeInput = {};
    
    if (body.exit_price !== undefined) {
      input.exit_price = parseFloat(body.exit_price);
    }
    if (body.exit_time !== undefined) {
      input.exit_time = new Date(body.exit_time);
    }
    if (body.status !== undefined) {
      input.status = body.status;
    }
    if (body.pnl !== undefined) {
      input.pnl = parseFloat(body.pnl);
    }
    if (body.pnl_percentage !== undefined) {
      input.pnl_percentage = parseFloat(body.pnl_percentage);
    }
    if (body.fees !== undefined) {
      input.fees = parseFloat(body.fees);
    }
    if (body.slippage !== undefined) {
      input.slippage = parseFloat(body.slippage);
    }
    if (body.notes !== undefined) {
      input.notes = body.notes;
    }

    const trade = await updateTrade(params.id, input);

    if (!trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    return NextResponse.json(trade);
  } catch (error) {
    console.error('Error updating trade:', error);
    return NextResponse.json(
      { error: 'Failed to update trade' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/trades/[id] - Delete a trade
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const deleted = await deleteTrade(params.id);

    if (!deleted) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting trade:', error);
    return NextResponse.json(
      { error: 'Failed to delete trade' },
      { status: 500 }
    );
  }
}
