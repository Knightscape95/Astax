/**
 * Paper Trading Service for Indian Market
 * 
 * Handles paper trade execution, portfolio management, and Indian market specific calculations
 */

import { sql } from './db';
import type {
  PaperPortfolio,
  CreatePaperPortfolioInput,
  PaperTrade,
  CreatePaperTradeInput,
  PortfolioHolding,
  IndianTradingCharges,
  SIPPlan,
  CreateSIPPlanInput,
  SIPInstallment,
  StockQuote,
  Exchange,
  OrderStatus,
  AssetClass,
} from '@/types/indian-market';

// ============================================================================
// Configuration
// ============================================================================

// Indian market trading charges (as of 2026)
const TRADING_CHARGES = {
  equity: {
    stt_delivery: 0.001,        // 0.1% on buy + sell for delivery
    stt_intraday: 0.00025,      // 0.025% on sell side for intraday
    stamp_duty: 0.00015,        // 0.015% (varies by state)
    sebi_charges: 0.000001,     // Rs 10 per crore
    exchange_nse: 0.0000297,    // NSE charges
    exchange_bse: 0.0000275,    // BSE charges
    gst_rate: 0.18,             // 18% GST on brokerage + transaction charges
  },
  bond: {
    stt: 0,
    stamp_duty: 0.00005,
    sebi_charges: 0.000001,
    gst_rate: 0.18,
  },
};

// Default brokerage rates (discount broker style)
const DEFAULT_BROKERAGE = {
  delivery: 0,                   // Zero brokerage for delivery
  intraday_percentage: 0.0003,   // 0.03% or Rs 20 max
  intraday_max: 20,
};

// ============================================================================
// Indian Trading Charges Calculator
// ============================================================================

export function calculateTradingCharges(
  price: number,
  quantity: number,
  side: 'buy' | 'sell',
  assetClass: AssetClass = 'equity',
  exchange: Exchange = 'NSE',
  isIntraday: boolean = false
): IndianTradingCharges {
  const value = price * quantity;
  const charges = TRADING_CHARGES[assetClass === 'equity' ? 'equity' : 'bond'];
  
  // STT Calculation
  let stt = 0;
  if (assetClass === 'equity') {
    if (isIntraday) {
      // Intraday: STT only on sell
      stt = side === 'sell' ? value * TRADING_CHARGES.equity.stt_intraday : 0;
    } else {
      // Delivery: STT on both buy and sell
      stt = value * TRADING_CHARGES.equity.stt_delivery;
    }
  }

  // Stamp Duty (only on buy)
  const stamp_duty = side === 'buy' ? value * charges.stamp_duty : 0;

  // Brokerage
  let brokerage = 0;
  if (isIntraday) {
    brokerage = Math.min(value * DEFAULT_BROKERAGE.intraday_percentage, DEFAULT_BROKERAGE.intraday_max);
  } else {
    brokerage = DEFAULT_BROKERAGE.delivery; // Zero for delivery
  }

  // Exchange charges
  const exchangeRate = exchange === 'NSE' 
    ? TRADING_CHARGES.equity.exchange_nse 
    : TRADING_CHARGES.equity.exchange_bse;
  const exchange_charges = value * exchangeRate;

  // SEBI charges
  const sebi_charges = value * charges.sebi_charges;

  // GST on brokerage + exchange charges + SEBI charges
  const gst = (brokerage + exchange_charges + sebi_charges) * charges.gst_rate;

  // Total charges
  const total = stt + stamp_duty + brokerage + gst + sebi_charges + exchange_charges;

  return {
    stt: Math.round(stt * 100) / 100,
    stamp_duty: Math.round(stamp_duty * 100) / 100,
    brokerage: Math.round(brokerage * 100) / 100,
    gst: Math.round(gst * 100) / 100,
    sebi_charges: Math.round(sebi_charges * 100) / 100,
    exchange_charges: Math.round(exchange_charges * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

// ============================================================================
// Portfolio CRUD Operations
// ============================================================================

export async function createPaperPortfolio(input: CreatePaperPortfolioInput): Promise<PaperPortfolio> {
  const result = await sql`
    INSERT INTO paper_portfolios (
      user_id, name, description, initial_capital, current_value, 
      cash_balance, currency, is_default
    ) VALUES (
      ${input.user_id},
      ${input.name},
      ${input.description || null},
      ${input.initial_capital},
      ${input.initial_capital},
      ${input.initial_capital},
      ${input.currency || 'INR'},
      false
    )
    RETURNING *
  `;
  return result.rows[0] as PaperPortfolio;
}

export async function getPaperPortfolio(portfolioId: string): Promise<PaperPortfolio | null> {
  const result = await sql`
    SELECT * FROM paper_portfolios WHERE id = ${portfolioId}
  `;
  return result.rows[0] as PaperPortfolio | null;
}

export async function getUserPortfolios(userId: string): Promise<PaperPortfolio[]> {
  const result = await sql`
    SELECT * FROM paper_portfolios 
    WHERE user_id = ${userId}
    ORDER BY is_default DESC, created_at DESC
  `;
  return result.rows as PaperPortfolio[];
}

export async function updatePortfolioValues(portfolioId: string): Promise<void> {
  // Calculate current values from holdings
  await sql`
    UPDATE paper_portfolios 
    SET 
      invested_value = COALESCE((
        SELECT SUM(invested_value) FROM portfolio_holdings WHERE portfolio_id = ${portfolioId}
      ), 0),
      current_value = cash_balance + COALESCE((
        SELECT SUM(current_value) FROM portfolio_holdings WHERE portfolio_id = ${portfolioId}
      ), 0),
      total_pnl = COALESCE((
        SELECT SUM(pnl) FROM portfolio_holdings WHERE portfolio_id = ${portfolioId}
      ), 0),
      total_pnl_percentage = CASE 
        WHEN COALESCE((SELECT SUM(invested_value) FROM portfolio_holdings WHERE portfolio_id = ${portfolioId}), 0) > 0
        THEN (COALESCE((SELECT SUM(pnl) FROM portfolio_holdings WHERE portfolio_id = ${portfolioId}), 0) / 
              COALESCE((SELECT SUM(invested_value) FROM portfolio_holdings WHERE portfolio_id = ${portfolioId}), 1)) * 100
        ELSE 0
      END,
      updated_at = NOW()
    WHERE id = ${portfolioId}
  `;
}

// ============================================================================
// Paper Trade Execution
// ============================================================================

export async function executePaperTrade(
  input: CreatePaperTradeInput,
  currentPrice: number
): Promise<{ trade: PaperTrade; holding?: PortfolioHolding }> {
  const portfolio = await getPaperPortfolio(input.portfolio_id);
  if (!portfolio) {
    throw new Error('Portfolio not found');
  }

  const executedPrice = input.order_type === 'market' ? currentPrice : input.price;
  const charges = calculateTradingCharges(
    executedPrice,
    input.quantity,
    input.side,
    input.asset_class || 'equity',
    input.exchange
  );

  const grossAmount = executedPrice * input.quantity;
  const netAmount = input.side === 'buy' 
    ? grossAmount + charges.total 
    : grossAmount - charges.total;

  // Validate sufficient funds for buy
  if (input.side === 'buy' && portfolio.cash_balance < netAmount) {
    throw new Error(`Insufficient funds. Required: ₹${netAmount.toFixed(2)}, Available: ₹${portfolio.cash_balance.toFixed(2)}`);
  }

  // Insert the trade
  const tradeResult = await sql`
    INSERT INTO paper_trades (
      portfolio_id, model_id, symbol, exchange, asset_class,
      order_type, side, quantity, price, executed_price, executed_quantity,
      status, trigger_price, stt, stamp_duty, brokerage, gst,
      sebi_charges, exchange_charges, total_charges, net_amount,
      signal_confidence, trade_reason, executed_at
    ) VALUES (
      ${input.portfolio_id},
      ${input.model_id || null},
      ${input.symbol},
      ${input.exchange},
      ${input.asset_class || 'equity'},
      ${input.order_type},
      ${input.side},
      ${input.quantity},
      ${input.price},
      ${executedPrice},
      ${input.quantity},
      'executed',
      ${input.trigger_price || null},
      ${charges.stt},
      ${charges.stamp_duty},
      ${charges.brokerage},
      ${charges.gst},
      ${charges.sebi_charges},
      ${charges.exchange_charges},
      ${charges.total},
      ${netAmount},
      ${input.signal_confidence || null},
      ${input.trade_reason || null},
      NOW()
    )
    RETURNING *
  `;

  const trade = tradeResult.rows[0] as PaperTrade;

  // Update cash balance
  if (input.side === 'buy') {
    await sql`
      UPDATE paper_portfolios 
      SET cash_balance = cash_balance - ${netAmount}
      WHERE id = ${input.portfolio_id}
    `;
  } else {
    await sql`
      UPDATE paper_portfolios 
      SET cash_balance = cash_balance + ${netAmount}
      WHERE id = ${input.portfolio_id}
    `;
  }

  // Update holdings
  const holding = await updateHolding(
    input.portfolio_id,
    input.symbol,
    input.exchange,
    input.asset_class || 'equity',
    input.side,
    input.quantity,
    executedPrice,
    currentPrice
  );

  // Recalculate portfolio values
  await updatePortfolioValues(input.portfolio_id);

  return { trade, holding };
}

async function updateHolding(
  portfolioId: string,
  symbol: string,
  exchange: Exchange,
  assetClass: AssetClass,
  side: 'buy' | 'sell',
  quantity: number,
  executedPrice: number,
  currentPrice: number
): Promise<PortfolioHolding | undefined> {
  // Check if holding exists
  const existingResult = await sql`
    SELECT * FROM portfolio_holdings 
    WHERE portfolio_id = ${portfolioId} 
    AND symbol = ${symbol} 
    AND exchange = ${exchange}
  `;

  const existing = existingResult.rows[0] as PortfolioHolding | undefined;

  if (side === 'buy') {
    if (existing) {
      // Update existing holding with new average price
      const newQuantity = Number(existing.quantity) + quantity;
      const newInvestedValue = Number(existing.invested_value) + (quantity * executedPrice);
      const newAvgPrice = newInvestedValue / newQuantity;
      const newCurrentValue = newQuantity * currentPrice;
      const newPnl = newCurrentValue - newInvestedValue;
      const newPnlPercentage = (newPnl / newInvestedValue) * 100;

      const updateResult = await sql`
        UPDATE portfolio_holdings SET
          quantity = ${newQuantity},
          average_price = ${newAvgPrice},
          current_price = ${currentPrice},
          invested_value = ${newInvestedValue},
          current_value = ${newCurrentValue},
          pnl = ${newPnl},
          pnl_percentage = ${newPnlPercentage},
          last_trade_date = NOW()
        WHERE id = ${existing.id}
        RETURNING *
      `;
      return updateResult.rows[0] as PortfolioHolding;
    } else {
      // Create new holding
      const investedValue = quantity * executedPrice;
      const currentValue = quantity * currentPrice;
      const pnl = currentValue - investedValue;
      const pnlPercentage = (pnl / investedValue) * 100;

      const insertResult = await sql`
        INSERT INTO portfolio_holdings (
          portfolio_id, symbol, exchange, asset_class, quantity,
          average_price, current_price, invested_value, current_value,
          pnl, pnl_percentage, first_buy_date, last_trade_date
        ) VALUES (
          ${portfolioId}, ${symbol}, ${exchange}, ${assetClass}, ${quantity},
          ${executedPrice}, ${currentPrice}, ${investedValue}, ${currentValue},
          ${pnl}, ${pnlPercentage}, NOW(), NOW()
        )
        RETURNING *
      `;
      return insertResult.rows[0] as PortfolioHolding;
    }
  } else {
    // Sell
    if (!existing) {
      throw new Error(`No holding found for ${symbol} to sell`);
    }

    if (Number(existing.quantity) < quantity) {
      throw new Error(`Insufficient quantity. Available: ${existing.quantity}, Requested: ${quantity}`);
    }

    const newQuantity = Number(existing.quantity) - quantity;

    if (newQuantity === 0) {
      // Remove the holding
      await sql`DELETE FROM portfolio_holdings WHERE id = ${existing.id}`;
      return undefined;
    } else {
      // Update holding
      const newInvestedValue = newQuantity * Number(existing.average_price);
      const newCurrentValue = newQuantity * currentPrice;
      const newPnl = newCurrentValue - newInvestedValue;
      const newPnlPercentage = (newPnl / newInvestedValue) * 100;

      const updateResult = await sql`
        UPDATE portfolio_holdings SET
          quantity = ${newQuantity},
          current_price = ${currentPrice},
          invested_value = ${newInvestedValue},
          current_value = ${newCurrentValue},
          pnl = ${newPnl},
          pnl_percentage = ${newPnlPercentage},
          last_trade_date = NOW()
        WHERE id = ${existing.id}
        RETURNING *
      `;
      return updateResult.rows[0] as PortfolioHolding;
    }
  }
}

// ============================================================================
// Portfolio Holdings Operations
// ============================================================================

export async function getPortfolioHoldings(portfolioId: string): Promise<PortfolioHolding[]> {
  const result = await sql`
    SELECT * FROM portfolio_holdings 
    WHERE portfolio_id = ${portfolioId}
    ORDER BY current_value DESC
  `;
  return result.rows as PortfolioHolding[];
}

export async function updateHoldingPrices(
  portfolioId: string,
  priceUpdates: { symbol: string; exchange: Exchange; price: number }[]
): Promise<void> {
  for (const update of priceUpdates) {
    await sql`
      UPDATE portfolio_holdings SET
        current_price = ${update.price},
        current_value = quantity * ${update.price},
        pnl = (quantity * ${update.price}) - invested_value,
        pnl_percentage = CASE 
          WHEN invested_value > 0 THEN ((quantity * ${update.price}) - invested_value) / invested_value * 100
          ELSE 0
        END,
        day_change = ${update.price} - current_price,
        day_change_percentage = CASE 
          WHEN current_price > 0 THEN ((${update.price} - current_price) / current_price) * 100
          ELSE 0
        END
      WHERE portfolio_id = ${portfolioId}
      AND symbol = ${update.symbol}
      AND exchange = ${update.exchange}
    `;
  }

  await updatePortfolioValues(portfolioId);
}

// ============================================================================
// SIP Operations
// ============================================================================

export async function createSIPPlan(input: CreateSIPPlanInput): Promise<SIPPlan> {
  const nextDate = calculateNextInstallmentDate(input.start_date, input.frequency);
  
  const result = await sql`
    INSERT INTO sip_plans (
      portfolio_id, model_id, name, symbol, exchange, asset_class,
      amount, frequency, start_date, end_date, next_installment_date,
      step_up_percentage, step_up_frequency, is_active
    ) VALUES (
      ${input.portfolio_id},
      ${input.model_id || null},
      ${input.name},
      ${input.symbol},
      ${input.exchange},
      ${input.asset_class || 'equity'},
      ${input.amount},
      ${input.frequency},
      ${input.start_date.toISOString()},
      ${input.end_date?.toISOString() || null},
      ${nextDate.toISOString()},
      ${input.step_up_percentage || null},
      ${input.step_up_frequency || null},
      true
    )
    RETURNING *
  `;
  return result.rows[0] as SIPPlan;
}

export async function getSIPPlans(portfolioId: string): Promise<SIPPlan[]> {
  const result = await sql`
    SELECT * FROM sip_plans 
    WHERE portfolio_id = ${portfolioId}
    ORDER BY is_active DESC, created_at DESC
  `;
  return result.rows as SIPPlan[];
}

export async function executeSIPInstallment(
  sipId: string,
  currentNav: number
): Promise<{ installment: SIPInstallment; trade: PaperTrade }> {
  const sipResult = await sql`SELECT * FROM sip_plans WHERE id = ${sipId}`;
  const sip = sipResult.rows[0] as SIPPlan;

  if (!sip || !sip.is_active) {
    throw new Error('SIP plan not found or inactive');
  }

  // Calculate units to purchase
  const units = sip.amount / currentNav;
  const installmentNumber = sip.completed_installments + 1;

  // Execute the paper trade
  const { trade } = await executePaperTrade({
    portfolio_id: sip.portfolio_id,
    model_id: sip.model_id || undefined,
    symbol: sip.symbol,
    exchange: sip.exchange,
    asset_class: sip.asset_class,
    order_type: 'market',
    side: 'buy',
    quantity: units,
    price: currentNav,
    trade_reason: `SIP Installment #${installmentNumber}`,
  }, currentNav);

  // Create installment record
  const installmentResult = await sql`
    INSERT INTO sip_installments (
      sip_id, installment_number, amount, nav, units_purchased,
      status, scheduled_date, executed_date, trade_id
    ) VALUES (
      ${sipId},
      ${installmentNumber},
      ${sip.amount},
      ${currentNav},
      ${units},
      'completed',
      ${sip.next_installment_date},
      NOW(),
      ${trade.id}
    )
    RETURNING *
  `;

  const installment = installmentResult.rows[0] as SIPInstallment;

  // Update SIP plan
  const nextDate = calculateNextInstallmentDate(new Date(sip.next_installment_date), sip.frequency);
  const newTotalInvested = Number(sip.total_invested) + sip.amount;
  const newUnits = Number(sip.units_accumulated) + units;
  const newAvgNav = newTotalInvested / newUnits;
  const newCurrentValue = newUnits * currentNav;
  const absoluteReturns = newCurrentValue - newTotalInvested;

  // Check for step-up
  let newAmount = sip.amount;
  if (sip.step_up_percentage) {
    const shouldStepUp = checkSIPStepUp(sip, installmentNumber);
    if (shouldStepUp) {
      newAmount = sip.amount * (1 + sip.step_up_percentage / 100);
    }
  }

  await sql`
    UPDATE sip_plans SET
      completed_installments = ${installmentNumber},
      total_invested = ${newTotalInvested},
      units_accumulated = ${newUnits},
      average_nav = ${newAvgNav},
      current_value = ${newCurrentValue},
      absolute_returns = ${absoluteReturns},
      next_installment_date = ${nextDate.toISOString()},
      amount = ${newAmount}
    WHERE id = ${sipId}
  `;

  return { installment, trade };
}

function calculateNextInstallmentDate(currentDate: Date, frequency: string): Date {
  const next = new Date(currentDate);
  
  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
  }
  
  return next;
}

function checkSIPStepUp(sip: SIPPlan, installmentNumber: number): boolean {
  if (!sip.step_up_percentage || !sip.step_up_frequency) return false;
  
  const installmentsPerYear = sip.frequency === 'monthly' ? 12 : 
                               sip.frequency === 'quarterly' ? 4 : 
                               sip.frequency === 'weekly' ? 52 : 365;
  
  const stepUpInterval = sip.step_up_frequency === 'yearly' 
    ? installmentsPerYear 
    : installmentsPerYear / 2;
  
  return installmentNumber % stepUpInterval === 0;
}

// ============================================================================
// Paper Trading History
// ============================================================================

export async function getPaperTrades(
  portfolioId: string,
  filters?: {
    symbol?: string;
    side?: 'buy' | 'sell';
    status?: OrderStatus;
    modelId?: string;
    startDate?: Date;
    endDate?: Date;
  },
  pagination?: { page: number; limit: number }
): Promise<{ trades: PaperTrade[]; total: number }> {
  const page = pagination?.page || 1;
  const limit = pagination?.limit || 50;
  const offset = (page - 1) * limit;

  let query = `
    SELECT * FROM paper_trades 
    WHERE portfolio_id = $1
  `;
  const params: unknown[] = [portfolioId];
  let paramIndex = 2;

  if (filters?.symbol) {
    query += ` AND symbol = $${paramIndex++}`;
    params.push(filters.symbol);
  }
  if (filters?.side) {
    query += ` AND side = $${paramIndex++}`;
    params.push(filters.side);
  }
  if (filters?.status) {
    query += ` AND status = $${paramIndex++}`;
    params.push(filters.status);
  }
  if (filters?.modelId) {
    query += ` AND model_id = $${paramIndex++}`;
    params.push(filters.modelId);
  }
  if (filters?.startDate) {
    query += ` AND executed_at >= $${paramIndex++}`;
    params.push(filters.startDate.toISOString());
  }
  if (filters?.endDate) {
    query += ` AND executed_at <= $${paramIndex++}`;
    params.push(filters.endDate.toISOString());
  }

  // Count total
  const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
  const countResult = await sql.query(countQuery, params);
  const total = parseInt(countResult.rows[0].count, 10);

  // Get paginated results
  query += ` ORDER BY executed_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  params.push(limit, offset);

  const result = await sql.query(query, params);
  
  return {
    trades: result.rows as PaperTrade[],
    total,
  };
}

// ============================================================================
// Portfolio Analytics
// ============================================================================

export async function calculatePortfolioMetrics(portfolioId: string) {
  const portfolio = await getPaperPortfolio(portfolioId);
  if (!portfolio) throw new Error('Portfolio not found');

  const holdings = await getPortfolioHoldings(portfolioId);
  
  // Calculate weights
  const totalValue = Number(portfolio.current_value);
  for (const holding of holdings) {
    const weight = (Number(holding.current_value) / totalValue) * 100;
    await sql`
      UPDATE portfolio_holdings 
      SET weight = ${weight}
      WHERE id = ${holding.id}
    `;
  }

  // Calculate CAGR if enough time has passed
  const daysSinceCreation = (Date.now() - new Date(portfolio.created_at).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceCreation >= 30) {
    const years = daysSinceCreation / 365;
    const totalReturn = (Number(portfolio.current_value) - Number(portfolio.initial_capital)) / Number(portfolio.initial_capital);
    const cagr = (Math.pow(1 + totalReturn, 1 / years) - 1) * 100;
    
    await sql`
      UPDATE paper_portfolios 
      SET cagr = ${cagr}
      WHERE id = ${portfolioId}
    `;
  }

  return {
    totalValue,
    holdings,
    daysSinceCreation,
  };
}

// ============================================================================
// Market Hours Check
// ============================================================================

export function isMarketOpen(exchange: Exchange = 'NSE'): boolean {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
  const istTime = new Date(now.getTime() + istOffset);
  
  const hours = istTime.getUTCHours();
  const minutes = istTime.getUTCMinutes();
  const day = istTime.getUTCDay();

  // Market is closed on weekends
  if (day === 0 || day === 6) return false;

  // Market hours: 9:15 AM to 3:30 PM IST
  const currentMinutes = hours * 60 + minutes;
  const marketOpen = 9 * 60 + 15;  // 9:15 AM
  const marketClose = 15 * 60 + 30; // 3:30 PM

  return currentMinutes >= marketOpen && currentMinutes < marketClose;
}

export function getNextMarketOpen(): Date {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  let nextOpen = new Date(now.getTime() + istOffset);
  
  // Set to 9:15 AM IST
  nextOpen.setUTCHours(9, 15, 0, 0);
  
  // If it's past 9:15 AM today, move to tomorrow
  if (nextOpen <= new Date(now.getTime() + istOffset)) {
    nextOpen.setDate(nextOpen.getDate() + 1);
  }
  
  // Skip weekends
  while (nextOpen.getUTCDay() === 0 || nextOpen.getUTCDay() === 6) {
    nextOpen.setDate(nextOpen.getDate() + 1);
  }
  
  return new Date(nextOpen.getTime() - istOffset);
}

// ============================================================================
// Export Service
// ============================================================================

export const paperTradingService = {
  calculateTradingCharges,
  createPaperPortfolio,
  getPaperPortfolio,
  getUserPortfolios,
  executePaperTrade,
  getPortfolioHoldings,
  updateHoldingPrices,
  createSIPPlan,
  getSIPPlans,
  executeSIPInstallment,
  getPaperTrades,
  calculatePortfolioMetrics,
  isMarketOpen,
  getNextMarketOpen,
};

export default paperTradingService;
