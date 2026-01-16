'use client';

import { useState, useEffect } from 'react';
import type { 
  PaperPortfolio, 
  PortfolioHolding, 
  StockQuote,
  Exchange 
} from '@/types/indian-market';

// ============================================================================
// Types
// ============================================================================

interface PaperTradingDashboardProps {
  portfolioId?: string;
  onPortfolioSelect?: (portfolioId: string | null) => void;
}

interface TradeFormData {
  symbol: string;
  exchange: Exchange;
  side: 'buy' | 'sell';
  quantity: number;
  orderType: 'market' | 'limit';
  price?: number;
  modelId?: string;
}

// ============================================================================
// Component
// ============================================================================

export default function PaperTradingDashboard({ portfolioId, onPortfolioSelect }: PaperTradingDashboardProps) {
  const [portfolio, setPortfolio] = useState<PaperPortfolio | null>(null);
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [portfolios, setPortfolios] = useState<PaperPortfolio[]>([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | undefined>(portfolioId);
  const [isLoading, setIsLoading] = useState(true);
  const [marketOpen, setMarketOpen] = useState(false);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeForm, setTradeForm] = useState<TradeFormData>({
    symbol: '',
    exchange: 'NSE',
    side: 'buy',
    quantity: 1,
    orderType: 'market',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ symbol: string; name: string }[]>([]);
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [tradeSuccess, setTradeSuccess] = useState<string | null>(null);

  // Fetch portfolios on mount
  useEffect(() => {
    fetchPortfolios();
  }, []);

  // Fetch portfolio data when selection changes
  useEffect(() => {
    if (selectedPortfolioId) {
      fetchPortfolioData(selectedPortfolioId);
    }
  }, [selectedPortfolioId]);

  // Search stocks when query changes
  useEffect(() => {
    if (searchQuery.length >= 2) {
      searchStocks(searchQuery);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  // Fetch quote when symbol changes
  useEffect(() => {
    if (tradeForm.symbol) {
      fetchQuote(tradeForm.symbol, tradeForm.exchange);
    }
  }, [tradeForm.symbol, tradeForm.exchange]);

  const fetchPortfolios = async () => {
    try {
      const res = await fetch('/api/paper-trading');
      const data = await res.json();
      setPortfolios(data.portfolios || []);
      setMarketOpen(data.marketStatus?.isOpen || false);
      
      if (data.portfolios?.length > 0 && !selectedPortfolioId) {
        const firstId = data.portfolios[0].id;
        setSelectedPortfolioId(firstId);
        onPortfolioSelect?.(firstId);
      }
    } catch (error) {
      console.error('Failed to fetch portfolios:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPortfolioData = async (id: string) => {
    try {
      const res = await fetch(`/api/paper-trading?id=${id}`);
      const data = await res.json();
      setPortfolio(data.portfolio);
      setHoldings(data.holdings || []);
    } catch (error) {
      console.error('Failed to fetch portfolio:', error);
    }
  };

  const searchStocks = async (query: string) => {
    try {
      const res = await fetch(`/api/market?action=search&q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (error) {
      console.error('Failed to search stocks:', error);
    }
  };

  const fetchQuote = async (symbol: string, exchange: Exchange) => {
    try {
      const res = await fetch(`/api/market?action=quote&symbol=${symbol}&exchange=${exchange}`);
      const data = await res.json();
      setQuote(data.quote);
    } catch (error) {
      console.error('Failed to fetch quote:', error);
    }
  };

  const createPortfolio = async () => {
    const name = prompt('Enter portfolio name:');
    if (!name) return;

    const capitalStr = prompt('Enter initial capital (INR):', '1000000');
    const capital = parseFloat(capitalStr || '1000000');

    try {
      const res = await fetch('/api/paper-trading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_portfolio',
          name,
          initial_capital: capital,
        }),
      });

      if (res.ok) {
        fetchPortfolios();
      }
    } catch (error) {
      console.error('Failed to create portfolio:', error);
    }
  };

  const executeTrade = async () => {
    if (!selectedPortfolioId || !tradeForm.symbol || !tradeForm.quantity) {
      setTradeError('Please fill all required fields');
      return;
    }

    setTradeError(null);
    setTradeSuccess(null);

    try {
      const res = await fetch('/api/paper-trading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'execute_trade',
          portfolio_id: selectedPortfolioId,
          symbol: tradeForm.symbol,
          exchange: tradeForm.exchange,
          order_type: tradeForm.orderType,
          side: tradeForm.side,
          quantity: tradeForm.quantity,
          price: tradeForm.orderType === 'limit' ? tradeForm.price : quote?.last_price,
          model_id: tradeForm.modelId,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setTradeSuccess(data.message);
        fetchPortfolioData(selectedPortfolioId);
        setShowTradeModal(false);
        setTradeForm({
          symbol: '',
          exchange: 'NSE',
          side: 'buy',
          quantity: 1,
          orderType: 'market',
        });
      } else {
        setTradeError(data.error);
      }
    } catch (error) {
      setTradeError('Failed to execute trade');
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Paper Trading</h1>
          <p className="text-gray-400 text-sm">
            Simulate trades on Indian market without real money
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Market Status */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
            marketOpen 
              ? 'bg-green-500/20 text-green-400' 
              : 'bg-red-500/20 text-red-400'
          }`}>
            <span className={`w-2 h-2 rounded-full ${marketOpen ? 'bg-green-500' : 'bg-red-500'}`}></span>
            {marketOpen ? 'Market Open' : 'Market Closed'}
          </div>
          
          {/* Portfolio Selector */}
          <select
            value={selectedPortfolioId || ''}
            onChange={(e) => {
              setSelectedPortfolioId(e.target.value);
              onPortfolioSelect?.(e.target.value);
            }}
            className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
          >
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          
          <button
            onClick={createPortfolio}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            + New Portfolio
          </button>
        </div>
      </div>

      {/* Success/Error Messages */}
      {tradeSuccess && (
        <div className="bg-green-500/20 border border-green-500/30 text-green-400 px-4 py-3 rounded-lg">
          {tradeSuccess}
        </div>
      )}

      {portfolio && (
        <>
          {/* Portfolio Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <p className="text-gray-400 text-sm">Portfolio Value</p>
              <p className="text-2xl font-bold text-white mt-1">
                {formatCurrency(Number(portfolio.current_value))}
              </p>
              <p className={`text-sm mt-2 ${Number(portfolio.total_pnl) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(Number(portfolio.total_pnl))} ({formatPercent(Number(portfolio.total_pnl_percentage))})
              </p>
            </div>

            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <p className="text-gray-400 text-sm">Invested Value</p>
              <p className="text-2xl font-bold text-white mt-1">
                {formatCurrency(Number(portfolio.invested_value))}
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Started: {formatCurrency(Number(portfolio.initial_capital))}
              </p>
            </div>

            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <p className="text-gray-400 text-sm">Cash Balance</p>
              <p className="text-2xl font-bold text-white mt-1">
                {formatCurrency(Number(portfolio.cash_balance))}
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Available for trading
              </p>
            </div>

            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <p className="text-gray-400 text-sm">Returns (CAGR)</p>
              <p className="text-2xl font-bold text-white mt-1">
                {portfolio.cagr ? `${Number(portfolio.cagr).toFixed(2)}%` : 'N/A'}
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Annualized return
              </p>
            </div>
          </div>

          {/* Trade Button */}
          <div className="flex justify-end">
            <button
              onClick={() => setShowTradeModal(true)}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              New Trade
            </button>
          </div>

          {/* Holdings Table */}
          <div className="bg-gray-800 rounded-xl border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-white">Holdings ({holdings.length})</h2>
            </div>
            
            {holdings.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-gray-400">No holdings yet. Start trading to build your portfolio.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                      <th className="px-6 py-3 font-medium">Symbol</th>
                      <th className="px-6 py-3 font-medium text-right">Qty</th>
                      <th className="px-6 py-3 font-medium text-right">Avg Price</th>
                      <th className="px-6 py-3 font-medium text-right">Current Price</th>
                      <th className="px-6 py-3 font-medium text-right">Invested</th>
                      <th className="px-6 py-3 font-medium text-right">Current Value</th>
                      <th className="px-6 py-3 font-medium text-right">P&L</th>
                      <th className="px-6 py-3 font-medium text-right">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((holding) => (
                      <tr key={holding.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-white">{holding.symbol}</p>
                            <p className="text-xs text-gray-500">{holding.exchange}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-white">
                          {Number(holding.quantity).toFixed(holding.asset_class === 'mutual_fund' ? 4 : 0)}
                        </td>
                        <td className="px-6 py-4 text-right text-white">
                          ₹{Number(holding.average_price).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-right text-white">
                          ₹{Number(holding.current_price).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-right text-white">
                          {formatCurrency(Number(holding.invested_value))}
                        </td>
                        <td className="px-6 py-4 text-right text-white">
                          {formatCurrency(Number(holding.current_value))}
                        </td>
                        <td className={`px-6 py-4 text-right ${
                          Number(holding.pnl) >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          <div>
                            <p>{formatCurrency(Number(holding.pnl))}</p>
                            <p className="text-xs">({formatPercent(Number(holding.pnl_percentage))})</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-gray-400">
                          {Number(holding.weight).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Trade Modal */}
      {showTradeModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Execute Trade</h2>
              <button
                onClick={() => setShowTradeModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {tradeError && (
              <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg mb-4 text-sm">
                {tradeError}
              </div>
            )}

            <div className="space-y-4">
              {/* Symbol Search */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Symbol</label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery || tradeForm.symbol}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setTradeForm({ ...tradeForm, symbol: e.target.value.toUpperCase() });
                    }}
                    placeholder="Search stocks (e.g., RELIANCE)"
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                  {searchResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {searchResults.map((result, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setTradeForm({ ...tradeForm, symbol: result.symbol });
                            setSearchQuery('');
                            setSearchResults([]);
                          }}
                          className="w-full px-4 py-2 text-left hover:bg-gray-600 text-white"
                        >
                          <span className="font-medium">{result.symbol}</span>
                          <span className="text-gray-400 text-sm ml-2">{result.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Exchange */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Exchange</label>
                <select
                  value={tradeForm.exchange}
                  onChange={(e) => setTradeForm({ ...tradeForm, exchange: e.target.value as Exchange })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="NSE">NSE</option>
                  <option value="BSE">BSE</option>
                </select>
              </div>

              {/* Current Price */}
              {quote && (
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Current Price</span>
                    <span className="text-xl font-bold text-white">₹{quote.last_price.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-gray-500 text-sm">Day Range</span>
                    <span className="text-gray-400 text-sm">₹{quote.low.toFixed(2)} - ₹{quote.high.toFixed(2)}</span>
                  </div>
                </div>
              )}

              {/* Side */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Side</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setTradeForm({ ...tradeForm, side: 'buy' })}
                    className={`py-2 rounded-lg font-medium transition-colors ${
                      tradeForm.side === 'buy'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    BUY
                  </button>
                  <button
                    onClick={() => setTradeForm({ ...tradeForm, side: 'sell' })}
                    className={`py-2 rounded-lg font-medium transition-colors ${
                      tradeForm.side === 'sell'
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    SELL
                  </button>
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={tradeForm.quantity}
                  onChange={(e) => setTradeForm({ ...tradeForm, quantity: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Order Type */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Order Type</label>
                <select
                  value={tradeForm.orderType}
                  onChange={(e) => setTradeForm({ ...tradeForm, orderType: e.target.value as 'market' | 'limit' })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="market">Market</option>
                  <option value="limit">Limit</option>
                </select>
              </div>

              {/* Limit Price */}
              {tradeForm.orderType === 'limit' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Limit Price</label>
                  <input
                    type="number"
                    step="0.05"
                    value={tradeForm.price || ''}
                    onChange={(e) => setTradeForm({ ...tradeForm, price: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              {/* Estimated Value */}
              {quote && (
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Estimated Value</span>
                    <span className="text-lg font-semibold text-white">
                      ₹{((tradeForm.orderType === 'limit' ? tradeForm.price : quote.last_price) || 0 * tradeForm.quantity).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              )}

              {/* Submit */}
              <button
                onClick={executeTrade}
                className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                  tradeForm.side === 'buy'
                    ? 'bg-green-600 hover:bg-green-500 text-white'
                    : 'bg-red-600 hover:bg-red-500 text-white'
                }`}
              >
                {tradeForm.side === 'buy' ? 'Place Buy Order' : 'Place Sell Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
