/**
 * Indian Market Types for Paper Trading
 * 
 * Supports NSE, BSE stocks, SIP, Bonds, and Model Selection
 */

// ============================================================================
// Market Types
// ============================================================================

export type Exchange = 'NSE' | 'BSE';
export type AssetClass = 'equity' | 'bond' | 'mutual_fund' | 'etf' | 'index' | 'commodity';
export type InvestmentType = 'lumpsum' | 'sip';
export type SIPFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly';
export type BondType = 'government' | 'corporate' | 'tax_free' | 'sgb' | 'rbi_bond';
export type OrderType = 'market' | 'limit' | 'stop_loss' | 'stop_loss_limit';
export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'pending' | 'executed' | 'partial' | 'cancelled' | 'rejected';
export type PortfolioType = 'paper' | 'live';
export type ModelSelectionStrategy = 'best_performer' | 'ensemble' | 'rotation' | 'risk_parity' | 'momentum' | 'custom';

// ============================================================================
// Indian Stock Types
// ============================================================================

export interface IndianStock {
  symbol: string;
  isin: string;
  name: string;
  exchange: Exchange;
  sector: string;
  industry: string;
  market_cap: number;
  lot_size: number;
  tick_size: number;
  is_fno_enabled: boolean;
  is_etf: boolean;
  face_value: number;
  last_price: number;
  change: number;
  change_percent: number;
  volume: number;
  value_traded: number;
  open: number;
  high: number;
  low: number;
  close: number;
  week_52_high: number;
  week_52_low: number;
  updated_at: Date;
}

export interface StockQuote {
  symbol: string;
  exchange: Exchange;
  last_price: number;
  bid_price: number;
  ask_price: number;
  bid_qty: number;
  ask_qty: number;
  volume: number;
  open: number;
  high: number;
  low: number;
  close: number;
  timestamp: Date;
}

export interface MarketIndex {
  symbol: string;
  name: string;
  exchange: Exchange;
  last_value: number;
  change: number;
  change_percent: number;
  open: number;
  high: number;
  low: number;
  previous_close: number;
  timestamp: Date;
}

// ============================================================================
// Paper Trading Portfolio Types
// ============================================================================

export interface PaperPortfolio {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  initial_capital: number;
  current_value: number;
  cash_balance: number;
  invested_value: number;
  total_pnl: number;
  total_pnl_percentage: number;
  total_returns: number;
  cagr: number | null;
  xirr: number | null;
  is_default: boolean;
  currency: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePaperPortfolioInput {
  user_id: string;
  name: string;
  description?: string;
  initial_capital: number;
  currency?: string;
}

export interface PortfolioHolding {
  id: string;
  portfolio_id: string;
  symbol: string;
  exchange: Exchange;
  asset_class: AssetClass;
  quantity: number;
  average_price: number;
  current_price: number;
  invested_value: number;
  current_value: number;
  pnl: number;
  pnl_percentage: number;
  day_change: number;
  day_change_percentage: number;
  weight: number;
  first_buy_date: Date;
  last_trade_date: Date;
  created_at: Date;
  updated_at: Date;
}

// ============================================================================
// Paper Trade Types
// ============================================================================

export interface PaperTrade {
  id: string;
  portfolio_id: string;
  model_id: string | null;
  symbol: string;
  exchange: Exchange;
  asset_class: AssetClass;
  order_type: OrderType;
  side: OrderSide;
  quantity: number;
  price: number;
  executed_price: number | null;
  executed_quantity: number | null;
  status: OrderStatus;
  trigger_price: number | null;
  fees: number;
  taxes: number;
  stt: number;
  stamp_duty: number;
  brokerage: number;
  gst: number;
  sebi_charges: number;
  exchange_charges: number;
  total_charges: number;
  net_amount: number;
  signal_confidence: number | null;
  trade_reason: string | null;
  slippage: number | null;
  placed_at: Date;
  executed_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePaperTradeInput {
  portfolio_id: string;
  model_id?: string;
  symbol: string;
  exchange: Exchange;
  asset_class?: AssetClass;
  order_type: OrderType;
  side: OrderSide;
  quantity: number;
  price: number;
  trigger_price?: number;
  signal_confidence?: number;
  trade_reason?: string;
}

// ============================================================================
// SIP (Systematic Investment Plan) Types
// ============================================================================

export interface SIPPlan {
  id: string;
  portfolio_id: string;
  model_id: string | null;
  name: string;
  symbol: string;
  exchange: Exchange;
  asset_class: AssetClass;
  amount: number;
  frequency: SIPFrequency;
  start_date: Date;
  end_date: Date | null;
  next_installment_date: Date;
  total_installments: number;
  completed_installments: number;
  total_invested: number;
  current_value: number;
  units_accumulated: number;
  average_nav: number;
  absolute_returns: number;
  cagr: number | null;
  xirr: number | null;
  is_active: boolean;
  step_up_percentage: number | null;
  step_up_frequency: 'yearly' | 'half_yearly' | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSIPPlanInput {
  portfolio_id: string;
  model_id?: string;
  name: string;
  symbol: string;
  exchange: Exchange;
  asset_class?: AssetClass;
  amount: number;
  frequency: SIPFrequency;
  start_date: Date;
  end_date?: Date;
  step_up_percentage?: number;
  step_up_frequency?: 'yearly' | 'half_yearly';
}

export interface SIPInstallment {
  id: string;
  sip_id: string;
  installment_number: number;
  amount: number;
  nav: number;
  units_purchased: number;
  status: 'pending' | 'completed' | 'failed' | 'skipped';
  scheduled_date: Date;
  executed_date: Date | null;
  failure_reason: string | null;
  trade_id: string | null;
  created_at: Date;
}

// ============================================================================
// Bond Types
// ============================================================================

export interface Bond {
  id: string;
  isin: string;
  name: string;
  issuer: string;
  bond_type: BondType;
  face_value: number;
  issue_price: number;
  current_price: number;
  coupon_rate: number;
  coupon_frequency: 'monthly' | 'quarterly' | 'semi_annual' | 'annual';
  yield_to_maturity: number;
  issue_date: Date;
  maturity_date: Date;
  next_coupon_date: Date | null;
  credit_rating: string;
  rating_agency: string;
  tax_status: 'taxable' | 'tax_free';
  is_callable: boolean;
  call_date: Date | null;
  call_price: number | null;
  minimum_investment: number;
  is_listed: boolean;
  exchange: Exchange | null;
  updated_at: Date;
}

export interface BondHolding {
  id: string;
  portfolio_id: string;
  bond_id: string;
  quantity: number;
  average_price: number;
  current_price: number;
  invested_value: number;
  current_value: number;
  accrued_interest: number;
  total_interest_received: number;
  pnl: number;
  pnl_percentage: number;
  purchase_date: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CreateBondHoldingInput {
  portfolio_id: string;
  bond_id: string;
  quantity: number;
  price: number;
}

// ============================================================================
// Model Selection Types
// ============================================================================

export interface ModelAllocation {
  id: string;
  portfolio_id: string;
  model_id: string;
  allocation_percentage: number;
  min_allocation: number;
  max_allocation: number;
  is_active: boolean;
  auto_rebalance: boolean;
  rebalance_threshold: number;
  last_rebalance_date: Date | null;
  performance_score: number | null;
  risk_score: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateModelAllocationInput {
  portfolio_id: string;
  model_id: string;
  allocation_percentage: number;
  min_allocation?: number;
  max_allocation?: number;
  auto_rebalance?: boolean;
  rebalance_threshold?: number;
}

export interface ModelSelectionConfig {
  id: string;
  portfolio_id: string;
  strategy: ModelSelectionStrategy;
  lookback_period_days: number;
  rebalance_frequency_days: number;
  min_models: number;
  max_models: number;
  min_confidence_threshold: number;
  max_correlation_threshold: number;
  use_ensemble_voting: boolean;
  ensemble_weight_method: 'equal' | 'performance' | 'sharpe' | 'inverse_volatility';
  rotation_metric: 'returns' | 'sharpe' | 'sortino' | 'calmar';
  momentum_lookback_days: number;
  risk_budget: number;
  custom_rules: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateModelSelectionConfigInput {
  portfolio_id: string;
  strategy: ModelSelectionStrategy;
  lookback_period_days?: number;
  rebalance_frequency_days?: number;
  min_models?: number;
  max_models?: number;
  min_confidence_threshold?: number;
  max_correlation_threshold?: number;
  use_ensemble_voting?: boolean;
  ensemble_weight_method?: 'equal' | 'performance' | 'sharpe' | 'inverse_volatility';
  rotation_metric?: 'returns' | 'sharpe' | 'sortino' | 'calmar';
  momentum_lookback_days?: number;
  risk_budget?: number;
  custom_rules?: Record<string, unknown>;
}

export interface ModelRanking {
  model_id: string;
  model_name: string;
  rank: number;
  score: number;
  total_pnl: number;
  pnl_percentage: number;
  win_rate: number;
  sharpe_ratio: number | null;
  sortino_ratio: number | null;
  max_drawdown: number;
  avg_confidence: number;
  trade_count: number;
  correlation_with_top: number | null;
  is_selected: boolean;
  recommended_allocation: number;
}

export interface ModelGroupSignal {
  timestamp: Date;
  symbol: string;
  exchange: Exchange;
  direction: 'buy' | 'sell' | 'hold';
  confidence: number;
  participating_models: {
    model_id: string;
    model_name: string;
    signal: 'buy' | 'sell' | 'hold';
    confidence: number;
    weight: number;
  }[];
  consensus_strength: number;
  is_actionable: boolean;
}

// ============================================================================
// Indian Market Specific Calculations
// ============================================================================

export interface IndianTradingCharges {
  stt: number;           // Securities Transaction Tax
  stamp_duty: number;
  brokerage: number;
  gst: number;
  sebi_charges: number;
  exchange_charges: number;
  total: number;
}

export interface TradingSession {
  exchange: Exchange;
  pre_open_start: string;
  pre_open_end: string;
  market_open: string;
  market_close: string;
  post_close_start: string;
  post_close_end: string;
  is_trading_day: boolean;
  is_market_open: boolean;
  next_trading_day: Date;
}

// ============================================================================
// Portfolio Analytics Types
// ============================================================================

export interface PortfolioAnalytics {
  portfolio_id: string;
  date: Date;
  total_value: number;
  daily_return: number;
  cumulative_return: number;
  volatility: number;
  beta: number | null;
  alpha: number | null;
  sharpe_ratio: number | null;
  sortino_ratio: number | null;
  max_drawdown: number;
  current_drawdown: number;
  var_95: number | null;
  cvar_95: number | null;
  sector_allocation: Record<string, number>;
  asset_allocation: Record<AssetClass, number>;
  top_gainers: string[];
  top_losers: string[];
}

export interface PortfolioRebalanceResult {
  portfolio_id: string;
  rebalance_date: Date;
  trades_executed: PaperTrade[];
  old_allocations: Record<string, number>;
  new_allocations: Record<string, number>;
  transaction_cost: number;
  slippage_cost: number;
  tax_implications: number;
}

// ============================================================================
// Watchlist Types
// ============================================================================

export interface Watchlist {
  id: string;
  user_id: string;
  name: string;
  symbols: WatchlistSymbol[];
  created_at: Date;
  updated_at: Date;
}

export interface WatchlistSymbol {
  symbol: string;
  exchange: Exchange;
  added_at: Date;
  notes: string | null;
  alert_price_above: number | null;
  alert_price_below: number | null;
}
