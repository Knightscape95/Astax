/**
 * Indian Market Data Service
 * 
 * Fetches real-time and historical data from NSE/BSE
 * Uses free APIs and fallback mock data for paper trading
 */

import type {
  IndianStock,
  StockQuote,
  MarketIndex,
  Exchange,
  Bond,
  TradingSession,
} from '@/types/indian-market';

// ============================================================================
// Configuration
// ============================================================================

const NSE_API_BASE = 'https://www.nseindia.com/api';
const BSE_API_BASE = 'https://api.bseindia.com/BseIndiaAPI/api';

// Popular Indian indices
const INDICES = {
  NIFTY50: { symbol: 'NIFTY 50', exchange: 'NSE' as Exchange },
  SENSEX: { symbol: 'SENSEX', exchange: 'BSE' as Exchange },
  BANKNIFTY: { symbol: 'NIFTY BANK', exchange: 'NSE' as Exchange },
  NIFTYIT: { symbol: 'NIFTY IT', exchange: 'NSE' as Exchange },
  NIFTYFIN: { symbol: 'NIFTY FIN SERVICE', exchange: 'NSE' as Exchange },
  MIDCAP100: { symbol: 'NIFTY MIDCAP 100', exchange: 'NSE' as Exchange },
};

// Popular stocks for paper trading
const POPULAR_STOCKS: Partial<IndianStock>[] = [
  { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', exchange: 'NSE', sector: 'Energy', industry: 'Oil & Gas', lot_size: 1 },
  { symbol: 'TCS', name: 'Tata Consultancy Services Ltd', exchange: 'NSE', sector: 'Technology', industry: 'IT Services', lot_size: 1 },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', exchange: 'NSE', sector: 'Financial', industry: 'Banking', lot_size: 1 },
  { symbol: 'INFY', name: 'Infosys Ltd', exchange: 'NSE', sector: 'Technology', industry: 'IT Services', lot_size: 1 },
  { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', exchange: 'NSE', sector: 'Financial', industry: 'Banking', lot_size: 1 },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever Ltd', exchange: 'NSE', sector: 'Consumer', industry: 'FMCG', lot_size: 1 },
  { symbol: 'ITC', name: 'ITC Ltd', exchange: 'NSE', sector: 'Consumer', industry: 'FMCG', lot_size: 1 },
  { symbol: 'SBIN', name: 'State Bank of India', exchange: 'NSE', sector: 'Financial', industry: 'Banking', lot_size: 1 },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd', exchange: 'NSE', sector: 'Telecom', industry: 'Telecom Services', lot_size: 1 },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank Ltd', exchange: 'NSE', sector: 'Financial', industry: 'Banking', lot_size: 1 },
  { symbol: 'LT', name: 'Larsen & Toubro Ltd', exchange: 'NSE', sector: 'Industrial', industry: 'Construction', lot_size: 1 },
  { symbol: 'AXISBANK', name: 'Axis Bank Ltd', exchange: 'NSE', sector: 'Financial', industry: 'Banking', lot_size: 1 },
  { symbol: 'ASIANPAINT', name: 'Asian Paints Ltd', exchange: 'NSE', sector: 'Consumer', industry: 'Paints', lot_size: 1 },
  { symbol: 'MARUTI', name: 'Maruti Suzuki India Ltd', exchange: 'NSE', sector: 'Auto', industry: 'Automobile', lot_size: 1 },
  { symbol: 'TITAN', name: 'Titan Company Ltd', exchange: 'NSE', sector: 'Consumer', industry: 'Jewellery', lot_size: 1 },
  { symbol: 'SUNPHARMA', name: 'Sun Pharmaceutical Industries', exchange: 'NSE', sector: 'Healthcare', industry: 'Pharma', lot_size: 1 },
  { symbol: 'TATAMOTORS', name: 'Tata Motors Ltd', exchange: 'NSE', sector: 'Auto', industry: 'Automobile', lot_size: 1 },
  { symbol: 'WIPRO', name: 'Wipro Ltd', exchange: 'NSE', sector: 'Technology', industry: 'IT Services', lot_size: 1 },
  { symbol: 'HCLTECH', name: 'HCL Technologies Ltd', exchange: 'NSE', sector: 'Technology', industry: 'IT Services', lot_size: 1 },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance Ltd', exchange: 'NSE', sector: 'Financial', industry: 'NBFC', lot_size: 1 },
];

// ============================================================================
// Mock Price Generator (for paper trading simulation)
// ============================================================================

// Base prices for simulation (will vary with market conditions)
const BASE_PRICES: Record<string, number> = {
  'RELIANCE': 2850,
  'TCS': 4150,
  'HDFCBANK': 1680,
  'INFY': 1820,
  'ICICIBANK': 1120,
  'HINDUNILVR': 2450,
  'ITC': 465,
  'SBIN': 780,
  'BHARTIARTL': 1420,
  'KOTAKBANK': 1780,
  'LT': 3450,
  'AXISBANK': 1180,
  'ASIANPAINT': 2920,
  'MARUTI': 12500,
  'TITAN': 3650,
  'SUNPHARMA': 1680,
  'TATAMOTORS': 920,
  'WIPRO': 480,
  'HCLTECH': 1720,
  'BAJFINANCE': 6850,
};

// Generate realistic price movement
function generateMockPrice(basePrice: number, volatility: number = 0.02): number {
  const change = (Math.random() - 0.5) * 2 * volatility;
  return Math.round(basePrice * (1 + change) * 100) / 100;
}

function generateMockQuote(symbol: string, exchange: Exchange = 'NSE'): StockQuote {
  const basePrice = BASE_PRICES[symbol] || 1000;
  const lastPrice = generateMockPrice(basePrice);
  const open = generateMockPrice(basePrice, 0.01);
  const high = Math.max(lastPrice, open) * (1 + Math.random() * 0.02);
  const low = Math.min(lastPrice, open) * (1 - Math.random() * 0.02);
  const close = lastPrice;
  
  return {
    symbol,
    exchange,
    last_price: lastPrice,
    bid_price: lastPrice - 0.05,
    ask_price: lastPrice + 0.05,
    bid_qty: Math.floor(Math.random() * 1000) + 100,
    ask_qty: Math.floor(Math.random() * 1000) + 100,
    volume: Math.floor(Math.random() * 10000000) + 100000,
    open: Math.round(open * 100) / 100,
    high: Math.round(high * 100) / 100,
    low: Math.round(low * 100) / 100,
    close: Math.round(close * 100) / 100,
    timestamp: new Date(),
  };
}

// ============================================================================
// NSE/BSE API Functions
// ============================================================================

async function fetchWithRetry(
  url: string, 
  options: RequestInit = {},
  retries: number = 3
): Promise<Response | null> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    ...options.headers,
  };

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { ...options, headers });
      if (response.ok) return response;
    } catch (error) {
      console.warn(`Fetch attempt ${i + 1} failed:`, error);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }
  return null;
}

// ============================================================================
// Stock Data Functions
// ============================================================================

export async function getStockQuote(
  symbol: string, 
  exchange: Exchange = 'NSE'
): Promise<StockQuote> {
  // Try to fetch real data first
  try {
    if (exchange === 'NSE') {
      const response = await fetchWithRetry(
        `${NSE_API_BASE}/quote-equity?symbol=${encodeURIComponent(symbol)}`
      );
      
      if (response) {
        const data = await response.json();
        return {
          symbol,
          exchange,
          last_price: data.priceInfo?.lastPrice || 0,
          bid_price: data.priceInfo?.intraDayHighLow?.min || 0,
          ask_price: data.priceInfo?.intraDayHighLow?.max || 0,
          bid_qty: 0,
          ask_qty: 0,
          volume: data.securityWiseDP?.quantityTraded || 0,
          open: data.priceInfo?.open || 0,
          high: data.priceInfo?.intraDayHighLow?.max || 0,
          low: data.priceInfo?.intraDayHighLow?.min || 0,
          close: data.priceInfo?.close || 0,
          timestamp: new Date(),
        };
      }
    }
  } catch (error) {
    console.warn('Failed to fetch real stock data, using mock:', error);
  }

  // Fallback to mock data for paper trading
  return generateMockQuote(symbol, exchange);
}

export async function getMultipleQuotes(
  symbols: string[],
  exchange: Exchange = 'NSE'
): Promise<StockQuote[]> {
  const quotes = await Promise.all(
    symbols.map(symbol => getStockQuote(symbol, exchange))
  );
  return quotes;
}

export async function searchStocks(query: string): Promise<Partial<IndianStock>[]> {
  const searchLower = query.toLowerCase();
  
  // Search in popular stocks first
  const results = POPULAR_STOCKS.filter(
    stock => 
      stock.symbol?.toLowerCase().includes(searchLower) ||
      stock.name?.toLowerCase().includes(searchLower)
  );

  // Try to fetch from NSE API
  try {
    const response = await fetchWithRetry(
      `${NSE_API_BASE}/search/autocomplete?q=${encodeURIComponent(query)}`
    );
    
    if (response) {
      const data = await response.json();
      const apiResults = data.symbols?.map((item: Record<string, string>) => ({
        symbol: item.symbol,
        name: item.symbol_info,
        exchange: 'NSE' as Exchange,
      })) || [];
      
      return [...results, ...apiResults].slice(0, 20);
    }
  } catch (error) {
    console.warn('Failed to search stocks from API:', error);
  }

  return results;
}

export function getPopularStocks(): Partial<IndianStock>[] {
  return POPULAR_STOCKS.map(stock => ({
    ...stock,
    last_price: BASE_PRICES[stock.symbol!] || 1000,
  }));
}

// ============================================================================
// Market Index Functions
// ============================================================================

export async function getMarketIndex(indexSymbol: string): Promise<MarketIndex> {
  // Mock index data for paper trading
  const baseValues: Record<string, number> = {
    'NIFTY 50': 24500,
    'SENSEX': 80500,
    'NIFTY BANK': 52000,
    'NIFTY IT': 38500,
    'NIFTY FIN SERVICE': 23000,
    'NIFTY MIDCAP 100': 55000,
  };

  const baseValue = baseValues[indexSymbol] || 20000;
  const currentValue = generateMockPrice(baseValue, 0.01);
  const previousClose = baseValue;
  const change = currentValue - previousClose;
  const changePercent = (change / previousClose) * 100;

  return {
    symbol: indexSymbol,
    name: indexSymbol,
    exchange: indexSymbol === 'SENSEX' ? 'BSE' : 'NSE',
    last_value: currentValue,
    change: Math.round(change * 100) / 100,
    change_percent: Math.round(changePercent * 100) / 100,
    open: generateMockPrice(baseValue, 0.005),
    high: currentValue * 1.005,
    low: currentValue * 0.995,
    previous_close: previousClose,
    timestamp: new Date(),
  };
}

export async function getAllIndices(): Promise<MarketIndex[]> {
  const indices = await Promise.all(
    Object.values(INDICES).map(idx => getMarketIndex(idx.symbol))
  );
  return indices;
}

// ============================================================================
// Historical Data Functions
// ============================================================================

export async function getHistoricalData(
  symbol: string,
  exchange: Exchange = 'NSE',
  days: number = 30
): Promise<{ date: Date; open: number; high: number; low: number; close: number; volume: number }[]> {
  const basePrice = BASE_PRICES[symbol] || 1000;
  const data: { date: Date; open: number; high: number; low: number; close: number; volume: number }[] = [];
  
  let currentPrice = basePrice;
  const now = new Date();

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    // Skip weekends
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    
    const dailyReturn = (Math.random() - 0.48) * 0.04; // Slight upward bias
    const open = currentPrice;
    const close = currentPrice * (1 + dailyReturn);
    const high = Math.max(open, close) * (1 + Math.random() * 0.015);
    const low = Math.min(open, close) * (1 - Math.random() * 0.015);
    const volume = Math.floor(Math.random() * 5000000) + 500000;

    data.push({
      date,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume,
    });

    currentPrice = close;
  }

  return data;
}

// ============================================================================
// Trading Session Info
// ============================================================================

export function getTradingSession(exchange: Exchange = 'NSE'): TradingSession {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  
  const hours = istTime.getUTCHours();
  const minutes = istTime.getUTCMinutes();
  const day = istTime.getUTCDay();
  const currentMinutes = hours * 60 + minutes;

  const isWeekend = day === 0 || day === 6;
  const preOpenStart = 9 * 60;       // 9:00 AM
  const preOpenEnd = 9 * 60 + 15;    // 9:15 AM
  const marketOpen = 9 * 60 + 15;    // 9:15 AM
  const marketClose = 15 * 60 + 30;  // 3:30 PM
  const postCloseStart = 15 * 60 + 40; // 3:40 PM
  const postCloseEnd = 16 * 60;      // 4:00 PM

  const isMarketOpen = !isWeekend && currentMinutes >= marketOpen && currentMinutes < marketClose;

  // Calculate next trading day
  const nextTradingDay = new Date(istTime);
  if (isWeekend || currentMinutes >= marketClose) {
    nextTradingDay.setDate(nextTradingDay.getDate() + 1);
  }
  while (nextTradingDay.getUTCDay() === 0 || nextTradingDay.getUTCDay() === 6) {
    nextTradingDay.setDate(nextTradingDay.getDate() + 1);
  }

  return {
    exchange,
    pre_open_start: '09:00',
    pre_open_end: '09:15',
    market_open: '09:15',
    market_close: '15:30',
    post_close_start: '15:40',
    post_close_end: '16:00',
    is_trading_day: !isWeekend,
    is_market_open: isMarketOpen,
    next_trading_day: new Date(nextTradingDay.getTime() - istOffset),
  };
}

// ============================================================================
// Sector Data
// ============================================================================

export function getSectors(): string[] {
  return [
    'Technology',
    'Financial',
    'Energy',
    'Healthcare',
    'Consumer',
    'Industrial',
    'Auto',
    'Telecom',
    'Metals',
    'Pharma',
    'Real Estate',
    'Utilities',
  ];
}

export async function getSectorPerformance(): Promise<{ sector: string; change: number; topStock: string }[]> {
  const sectors = getSectors();
  return sectors.map(sector => ({
    sector,
    change: (Math.random() - 0.5) * 4,
    topStock: POPULAR_STOCKS.find(s => s.sector === sector)?.symbol || 'N/A',
  }));
}

// ============================================================================
// Bond Data Functions
// ============================================================================

export async function getBondData(bondType?: string): Promise<Bond[]> {
  // This would typically fetch from RBI/NSE bond data
  // For paper trading, we return mock data
  const bonds: Bond[] = [
    {
      id: '1',
      isin: 'IN0020220019',
      name: 'GOI 2032 7.26%',
      issuer: 'Government of India',
      bond_type: 'government',
      face_value: 100,
      issue_price: 100,
      current_price: 101.50,
      coupon_rate: 7.26,
      coupon_frequency: 'semi_annual',
      yield_to_maturity: 7.15,
      issue_date: new Date('2022-06-17'),
      maturity_date: new Date('2032-06-17'),
      next_coupon_date: new Date('2026-06-17'),
      credit_rating: 'Sovereign',
      rating_agency: 'RBI',
      tax_status: 'taxable',
      is_callable: false,
      call_date: null,
      call_price: null,
      minimum_investment: 10000,
      is_listed: true,
      exchange: 'NSE',
      updated_at: new Date(),
    },
    {
      id: '2',
      isin: 'SGBAUG28',
      name: 'Sovereign Gold Bond 2028',
      issuer: 'Reserve Bank of India',
      bond_type: 'sgb',
      face_value: 1000,
      issue_price: 5500,
      current_price: 6200,
      coupon_rate: 2.5,
      coupon_frequency: 'semi_annual',
      yield_to_maturity: 8.5,
      issue_date: new Date('2020-08-01'),
      maturity_date: new Date('2028-08-01'),
      next_coupon_date: new Date('2026-02-01'),
      credit_rating: 'Sovereign',
      rating_agency: 'RBI',
      tax_status: 'tax_free',
      is_callable: false,
      call_date: null,
      call_price: null,
      minimum_investment: 5500,
      is_listed: true,
      exchange: 'NSE',
      updated_at: new Date(),
    },
    {
      id: '3',
      isin: 'IN0020210039',
      name: 'RBI Floating Rate Bond 2028',
      issuer: 'Reserve Bank of India',
      bond_type: 'rbi_bond',
      face_value: 1000,
      issue_price: 1000,
      current_price: 1000,
      coupon_rate: 7.15,
      coupon_frequency: 'semi_annual',
      yield_to_maturity: 7.15,
      issue_date: new Date('2021-07-01'),
      maturity_date: new Date('2028-07-01'),
      next_coupon_date: new Date('2026-07-01'),
      credit_rating: 'Sovereign',
      rating_agency: 'RBI',
      tax_status: 'taxable',
      is_callable: false,
      call_date: null,
      call_price: null,
      minimum_investment: 1000,
      is_listed: false,
      exchange: null,
      updated_at: new Date(),
    },
  ];

  if (bondType) {
    return bonds.filter(b => b.bond_type === bondType);
  }
  return bonds;
}

// ============================================================================
// Mutual Fund NAV Data (for SIP)
// ============================================================================

export async function getMutualFundNAV(symbol: string): Promise<{ nav: number; date: Date }> {
  // Mock NAV for mutual funds
  const baseNavs: Record<string, number> = {
    'NIFTYBEES': 245,
    'BANKBEES': 520,
    'LIQUIDBEES': 1000.05,
    'GOLDBEES': 62,
  };

  const baseNav = baseNavs[symbol] || 100;
  const nav = generateMockPrice(baseNav, 0.01);

  return {
    nav: Math.round(nav * 100) / 100,
    date: new Date(),
  };
}

// ============================================================================
// Export Service
// ============================================================================

export const indianMarketService = {
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
  INDICES,
};

export default indianMarketService;
