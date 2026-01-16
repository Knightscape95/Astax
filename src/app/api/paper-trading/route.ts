/**
 * Paper Trading API Routes
 * 
 * Handles portfolios, trades, and holdings for Indian market paper trading
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import {
  createPaperPortfolio,
  getPaperPortfolio,
  getUserPortfolios,
  executePaperTrade,
  getPortfolioHoldings,
  getPaperTrades,
  calculatePortfolioMetrics,
  isMarketOpen,
  getNextMarketOpen,
} from '@/lib/paper-trading';
import { getStockQuote } from '@/lib/indian-market-service';
import type { CreatePaperPortfolioInput, CreatePaperTradeInput } from '@/types/indian-market';

// ============================================================================
// GET - List portfolios or get specific portfolio
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get('id');

    if (portfolioId) {
      // Get specific portfolio with holdings
      const portfolio = await getPaperPortfolio(portfolioId);
      if (!portfolio) {
        return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 });
      }

      const holdings = await getPortfolioHoldings(portfolioId);
      const marketStatus = {
        isOpen: isMarketOpen(),
        nextOpen: getNextMarketOpen(),
      };

      return NextResponse.json({
        portfolio,
        holdings,
        marketStatus,
      });
    }

    // List all user portfolios
    const portfolios = await getUserPortfolios(session.user.email);
    
    return NextResponse.json({
      portfolios,
      marketStatus: {
        isOpen: isMarketOpen(),
        nextOpen: getNextMarketOpen(),
      },
    });
  } catch (error) {
    console.error('Error fetching portfolios:', error);
    return NextResponse.json(
      { error: 'Failed to fetch portfolios' },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST - Create portfolio or execute trade
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'create_portfolio': {
        const portfolioInput: CreatePaperPortfolioInput = {
          user_id: session.user.email,
          name: body.name,
          description: body.description,
          initial_capital: body.initial_capital || 1000000, // Default 10 Lakhs
          currency: body.currency || 'INR',
        };

        const portfolio = await createPaperPortfolio(portfolioInput);
        return NextResponse.json({ portfolio }, { status: 201 });
      }

      case 'execute_trade': {
        const { portfolio_id, symbol, exchange, order_type, side, quantity, price, model_id, trade_reason } = body;

        if (!portfolio_id || !symbol || !side || !quantity) {
          return NextResponse.json(
            { error: 'Missing required fields: portfolio_id, symbol, side, quantity' },
            { status: 400 }
          );
        }

        // Get current market price for market orders
        const quote = await getStockQuote(symbol, exchange || 'NSE');
        const currentPrice = quote.last_price;

        const tradeInput: CreatePaperTradeInput = {
          portfolio_id,
          model_id,
          symbol,
          exchange: exchange || 'NSE',
          order_type: order_type || 'market',
          side,
          quantity,
          price: price || currentPrice,
          trade_reason,
        };

        const result = await executePaperTrade(tradeInput, currentPrice);
        
        return NextResponse.json({
          trade: result.trade,
          holding: result.holding,
          executedAt: currentPrice,
          message: `${side.toUpperCase()} order executed for ${quantity} shares of ${symbol} at ₹${result.trade.executed_price}`,
        }, { status: 201 });
      }

      case 'calculate_metrics': {
        const { portfolio_id } = body;
        if (!portfolio_id) {
          return NextResponse.json({ error: 'portfolio_id required' }, { status: 400 });
        }

        const metrics = await calculatePortfolioMetrics(portfolio_id);
        return NextResponse.json({ metrics });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: create_portfolio, execute_trade, calculate_metrics' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error in paper trading:', error);
    const message = error instanceof Error ? error.message : 'Operation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============================================================================
// DELETE - Remove portfolio
// ============================================================================

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get('id');

    if (!portfolioId) {
      return NextResponse.json({ error: 'Portfolio ID required' }, { status: 400 });
    }

    // Verify ownership before deletion
    const portfolio = await getPaperPortfolio(portfolioId);
    if (!portfolio || portfolio.user_id !== session.user.email) {
      return NextResponse.json({ error: 'Portfolio not found or unauthorized' }, { status: 404 });
    }

    // Delete portfolio (cascades to holdings and trades)
    const { sql } = await import('@/lib/db');
    await sql`DELETE FROM paper_portfolios WHERE id = ${portfolioId}`;

    return NextResponse.json({ message: 'Portfolio deleted successfully' });
  } catch (error) {
    console.error('Error deleting portfolio:', error);
    return NextResponse.json({ error: 'Failed to delete portfolio' }, { status: 500 });
  }
}
