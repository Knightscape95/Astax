/**
 * Indian Market Data API Routes
 * 
 * Stock quotes, indices, historical data, and market info
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import {
  getStockQuote,
  getMultipleQuotes,
  searchStocks,
  getPopularStocks,
  getMarketIndex,
  getAllIndices,
  getHistoricalData,
  getTradingSession,
  getSectors,
  getSectorPerformance,
  getBondData,
  getMutualFundNAV,
} from '@/lib/indian-market-service';
import type { Exchange } from '@/types/indian-market';

// ============================================================================
// GET - Fetch market data
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'quote';

    switch (action) {
      case 'quote': {
        const symbol = searchParams.get('symbol');
        const exchange = (searchParams.get('exchange') || 'NSE') as Exchange;

        if (!symbol) {
          return NextResponse.json({ error: 'symbol required' }, { status: 400 });
        }

        const quote = await getStockQuote(symbol, exchange);
        return NextResponse.json({ quote });
      }

      case 'quotes': {
        const symbolsParam = searchParams.get('symbols');
        const exchange = (searchParams.get('exchange') || 'NSE') as Exchange;

        if (!symbolsParam) {
          return NextResponse.json({ error: 'symbols required (comma-separated)' }, { status: 400 });
        }

        const symbols = symbolsParam.split(',').map(s => s.trim());
        const quotes = await getMultipleQuotes(symbols, exchange);
        return NextResponse.json({ quotes });
      }

      case 'search': {
        const query = searchParams.get('q');
        if (!query) {
          return NextResponse.json({ error: 'query (q) required' }, { status: 400 });
        }

        const results = await searchStocks(query);
        return NextResponse.json({ results });
      }

      case 'popular': {
        const stocks = getPopularStocks();
        const quotes = await getMultipleQuotes(
          stocks.map(s => s.symbol!).slice(0, 20),
          'NSE'
        );
        
        return NextResponse.json({
          stocks: stocks.map(stock => {
            const quote = quotes.find(q => q.symbol === stock.symbol);
            return {
              ...stock,
              last_price: quote?.last_price,
              change: quote?.close ? quote.last_price - quote.close : 0,
              change_percent: quote?.close 
                ? ((quote.last_price - quote.close) / quote.close) * 100 
                : 0,
            };
          }),
        });
      }

      case 'index': {
        const indexSymbol = searchParams.get('symbol');
        if (!indexSymbol) {
          return NextResponse.json({ error: 'index symbol required' }, { status: 400 });
        }

        const index = await getMarketIndex(indexSymbol);
        return NextResponse.json({ index });
      }

      case 'indices': {
        const indices = await getAllIndices();
        return NextResponse.json({ indices });
      }

      case 'historical': {
        const symbol = searchParams.get('symbol');
        const exchange = (searchParams.get('exchange') || 'NSE') as Exchange;
        const days = parseInt(searchParams.get('days') || '30', 10);

        if (!symbol) {
          return NextResponse.json({ error: 'symbol required' }, { status: 400 });
        }

        const data = await getHistoricalData(symbol, exchange, days);
        return NextResponse.json({ historical: data });
      }

      case 'session': {
        const exchange = (searchParams.get('exchange') || 'NSE') as Exchange;
        const session = getTradingSession(exchange);
        return NextResponse.json({ session });
      }

      case 'sectors': {
        const sectors = getSectors();
        const performance = await getSectorPerformance();
        return NextResponse.json({ sectors, performance });
      }

      case 'bonds': {
        const bondType = searchParams.get('type');
        const bonds = await getBondData(bondType || undefined);
        return NextResponse.json({ bonds });
      }

      case 'mf_nav': {
        const symbol = searchParams.get('symbol');
        if (!symbol) {
          return NextResponse.json({ error: 'symbol required' }, { status: 400 });
        }

        const nav = await getMutualFundNAV(symbol);
        return NextResponse.json({ nav });
      }

      default:
        return NextResponse.json(
          { 
            error: 'Invalid action',
            available: [
              'quote', 'quotes', 'search', 'popular', 'index', 'indices',
              'historical', 'session', 'sectors', 'bonds', 'mf_nav'
            ]
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error fetching market data:', error);
    return NextResponse.json({ error: 'Failed to fetch market data' }, { status: 500 });
  }
}
