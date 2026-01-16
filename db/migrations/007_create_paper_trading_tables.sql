-- Migration: 007_create_paper_trading_tables.sql
-- Description: Creates tables for paper trading on Indian market with SIP, Bonds, and Model Selection
-- Created: 2026-01-15

-- ============================================================================
-- Enums
-- ============================================================================

CREATE TYPE exchange_type AS ENUM ('NSE', 'BSE');
CREATE TYPE asset_class AS ENUM ('equity', 'bond', 'mutual_fund', 'etf', 'index', 'commodity');
CREATE TYPE investment_type AS ENUM ('lumpsum', 'sip');
CREATE TYPE sip_frequency AS ENUM ('daily', 'weekly', 'monthly', 'quarterly');
CREATE TYPE bond_type AS ENUM ('government', 'corporate', 'tax_free', 'sgb', 'rbi_bond');
CREATE TYPE order_type AS ENUM ('market', 'limit', 'stop_loss', 'stop_loss_limit');
CREATE TYPE order_side AS ENUM ('buy', 'sell');
CREATE TYPE order_status AS ENUM ('pending', 'executed', 'partial', 'cancelled', 'rejected');
CREATE TYPE portfolio_type AS ENUM ('paper', 'live');
CREATE TYPE model_selection_strategy AS ENUM ('best_performer', 'ensemble', 'rotation', 'risk_parity', 'momentum', 'custom');
CREATE TYPE sip_installment_status AS ENUM ('pending', 'completed', 'failed', 'skipped');

-- ============================================================================
-- Paper Portfolios Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS paper_portfolios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    initial_capital DECIMAL(20, 4) NOT NULL DEFAULT 1000000, -- 10 Lakhs default
    current_value DECIMAL(20, 4) NOT NULL DEFAULT 1000000,
    cash_balance DECIMAL(20, 4) NOT NULL DEFAULT 1000000,
    invested_value DECIMAL(20, 4) NOT NULL DEFAULT 0,
    total_pnl DECIMAL(20, 4) NOT NULL DEFAULT 0,
    total_pnl_percentage DECIMAL(10, 4) NOT NULL DEFAULT 0,
    total_returns DECIMAL(20, 4) NOT NULL DEFAULT 0,
    cagr DECIMAL(10, 6),
    xirr DECIMAL(10, 6),
    is_default BOOLEAN NOT NULL DEFAULT false,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_paper_portfolios_user_id ON paper_portfolios(user_id);
CREATE INDEX idx_paper_portfolios_created_at ON paper_portfolios(created_at);

-- Ensure only one default portfolio per user
CREATE UNIQUE INDEX idx_paper_portfolios_default ON paper_portfolios(user_id) WHERE is_default = true;

CREATE TRIGGER update_paper_portfolios_updated_at
    BEFORE UPDATE ON paper_portfolios
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE paper_portfolios IS 'Paper trading portfolios for simulation on Indian market';
COMMENT ON COLUMN paper_portfolios.initial_capital IS 'Starting capital in INR';
COMMENT ON COLUMN paper_portfolios.xirr IS 'Extended Internal Rate of Return considering cash flows';

-- ============================================================================
-- Portfolio Holdings Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS portfolio_holdings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    portfolio_id UUID NOT NULL REFERENCES paper_portfolios(id) ON DELETE CASCADE,
    symbol VARCHAR(50) NOT NULL,
    exchange exchange_type NOT NULL,
    asset_class asset_class NOT NULL DEFAULT 'equity',
    quantity DECIMAL(20, 6) NOT NULL,
    average_price DECIMAL(20, 4) NOT NULL,
    current_price DECIMAL(20, 4) NOT NULL,
    invested_value DECIMAL(20, 4) NOT NULL,
    current_value DECIMAL(20, 4) NOT NULL,
    pnl DECIMAL(20, 4) NOT NULL DEFAULT 0,
    pnl_percentage DECIMAL(10, 4) NOT NULL DEFAULT 0,
    day_change DECIMAL(20, 4) NOT NULL DEFAULT 0,
    day_change_percentage DECIMAL(10, 4) NOT NULL DEFAULT 0,
    weight DECIMAL(10, 4) NOT NULL DEFAULT 0,
    first_buy_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_trade_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_portfolio_holdings_portfolio_id ON portfolio_holdings(portfolio_id);
CREATE INDEX idx_portfolio_holdings_symbol ON portfolio_holdings(symbol);
CREATE UNIQUE INDEX idx_portfolio_holdings_unique ON portfolio_holdings(portfolio_id, symbol, exchange);

CREATE TRIGGER update_portfolio_holdings_updated_at
    BEFORE UPDATE ON portfolio_holdings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Paper Trades Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS paper_trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    portfolio_id UUID NOT NULL REFERENCES paper_portfolios(id) ON DELETE CASCADE,
    model_id UUID REFERENCES models(id) ON DELETE SET NULL,
    symbol VARCHAR(50) NOT NULL,
    exchange exchange_type NOT NULL,
    asset_class asset_class NOT NULL DEFAULT 'equity',
    order_type order_type NOT NULL,
    side order_side NOT NULL,
    quantity DECIMAL(20, 6) NOT NULL,
    price DECIMAL(20, 4) NOT NULL,
    executed_price DECIMAL(20, 4),
    executed_quantity DECIMAL(20, 6),
    status order_status NOT NULL DEFAULT 'pending',
    trigger_price DECIMAL(20, 4),
    -- Indian market specific charges
    fees DECIMAL(20, 4) NOT NULL DEFAULT 0,
    taxes DECIMAL(20, 4) NOT NULL DEFAULT 0,
    stt DECIMAL(20, 4) NOT NULL DEFAULT 0,        -- Securities Transaction Tax
    stamp_duty DECIMAL(20, 4) NOT NULL DEFAULT 0,
    brokerage DECIMAL(20, 4) NOT NULL DEFAULT 0,
    gst DECIMAL(20, 4) NOT NULL DEFAULT 0,
    sebi_charges DECIMAL(20, 4) NOT NULL DEFAULT 0,
    exchange_charges DECIMAL(20, 4) NOT NULL DEFAULT 0,
    total_charges DECIMAL(20, 4) NOT NULL DEFAULT 0,
    net_amount DECIMAL(20, 4) NOT NULL DEFAULT 0,
    signal_confidence DECIMAL(5, 4),
    trade_reason TEXT,
    slippage DECIMAL(20, 4),
    placed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    executed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_paper_trades_portfolio_id ON paper_trades(portfolio_id);
CREATE INDEX idx_paper_trades_model_id ON paper_trades(model_id);
CREATE INDEX idx_paper_trades_symbol ON paper_trades(symbol);
CREATE INDEX idx_paper_trades_status ON paper_trades(status);
CREATE INDEX idx_paper_trades_side ON paper_trades(side);
CREATE INDEX idx_paper_trades_placed_at ON paper_trades(placed_at);

CREATE TRIGGER update_paper_trades_updated_at
    BEFORE UPDATE ON paper_trades
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE paper_trades IS 'Paper trades for simulated trading on Indian market';
COMMENT ON COLUMN paper_trades.stt IS 'Securities Transaction Tax as per Indian regulations';

-- ============================================================================
-- SIP Plans Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS sip_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    portfolio_id UUID NOT NULL REFERENCES paper_portfolios(id) ON DELETE CASCADE,
    model_id UUID REFERENCES models(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    symbol VARCHAR(50) NOT NULL,
    exchange exchange_type NOT NULL,
    asset_class asset_class NOT NULL DEFAULT 'equity',
    amount DECIMAL(20, 4) NOT NULL,
    frequency sip_frequency NOT NULL DEFAULT 'monthly',
    start_date DATE NOT NULL,
    end_date DATE,
    next_installment_date DATE NOT NULL,
    total_installments INTEGER NOT NULL DEFAULT 0,
    completed_installments INTEGER NOT NULL DEFAULT 0,
    total_invested DECIMAL(20, 4) NOT NULL DEFAULT 0,
    current_value DECIMAL(20, 4) NOT NULL DEFAULT 0,
    units_accumulated DECIMAL(20, 6) NOT NULL DEFAULT 0,
    average_nav DECIMAL(20, 4) NOT NULL DEFAULT 0,
    absolute_returns DECIMAL(20, 4) NOT NULL DEFAULT 0,
    cagr DECIMAL(10, 6),
    xirr DECIMAL(10, 6),
    is_active BOOLEAN NOT NULL DEFAULT true,
    step_up_percentage DECIMAL(5, 2),
    step_up_frequency VARCHAR(20), -- 'yearly' or 'half_yearly'
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sip_plans_portfolio_id ON sip_plans(portfolio_id);
CREATE INDEX idx_sip_plans_model_id ON sip_plans(model_id);
CREATE INDEX idx_sip_plans_symbol ON sip_plans(symbol);
CREATE INDEX idx_sip_plans_next_installment ON sip_plans(next_installment_date) WHERE is_active = true;

CREATE TRIGGER update_sip_plans_updated_at
    BEFORE UPDATE ON sip_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE sip_plans IS 'Systematic Investment Plans for rupee cost averaging';
COMMENT ON COLUMN sip_plans.step_up_percentage IS 'Annual increase in SIP amount percentage';

-- ============================================================================
-- SIP Installments Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS sip_installments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sip_id UUID NOT NULL REFERENCES sip_plans(id) ON DELETE CASCADE,
    installment_number INTEGER NOT NULL,
    amount DECIMAL(20, 4) NOT NULL,
    nav DECIMAL(20, 4) NOT NULL,
    units_purchased DECIMAL(20, 6) NOT NULL,
    status sip_installment_status NOT NULL DEFAULT 'pending',
    scheduled_date DATE NOT NULL,
    executed_date DATE,
    failure_reason TEXT,
    trade_id UUID REFERENCES paper_trades(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sip_installments_sip_id ON sip_installments(sip_id);
CREATE INDEX idx_sip_installments_scheduled_date ON sip_installments(scheduled_date);
CREATE INDEX idx_sip_installments_status ON sip_installments(status);

COMMENT ON TABLE sip_installments IS 'Individual SIP installment records';

-- ============================================================================
-- Bonds Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS bonds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    isin VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    issuer VARCHAR(255) NOT NULL,
    bond_type bond_type NOT NULL,
    face_value DECIMAL(20, 4) NOT NULL DEFAULT 1000,
    issue_price DECIMAL(20, 4) NOT NULL,
    current_price DECIMAL(20, 4) NOT NULL,
    coupon_rate DECIMAL(6, 4) NOT NULL, -- Percentage
    coupon_frequency VARCHAR(20) NOT NULL DEFAULT 'semi_annual', -- monthly, quarterly, semi_annual, annual
    yield_to_maturity DECIMAL(6, 4),
    issue_date DATE NOT NULL,
    maturity_date DATE NOT NULL,
    next_coupon_date DATE,
    credit_rating VARCHAR(20),
    rating_agency VARCHAR(50),
    tax_status VARCHAR(20) NOT NULL DEFAULT 'taxable', -- taxable, tax_free
    is_callable BOOLEAN NOT NULL DEFAULT false,
    call_date DATE,
    call_price DECIMAL(20, 4),
    minimum_investment DECIMAL(20, 4) NOT NULL DEFAULT 10000,
    is_listed BOOLEAN NOT NULL DEFAULT false,
    exchange exchange_type,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bonds_bond_type ON bonds(bond_type);
CREATE INDEX idx_bonds_issuer ON bonds(issuer);
CREATE INDEX idx_bonds_maturity_date ON bonds(maturity_date);
CREATE INDEX idx_bonds_credit_rating ON bonds(credit_rating);

COMMENT ON TABLE bonds IS 'Bond master data including government and corporate bonds';
COMMENT ON COLUMN bonds.sgb IS 'Sovereign Gold Bonds specific fields if bond_type is sgb';

-- ============================================================================
-- Bond Holdings Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS bond_holdings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    portfolio_id UUID NOT NULL REFERENCES paper_portfolios(id) ON DELETE CASCADE,
    bond_id UUID NOT NULL REFERENCES bonds(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    average_price DECIMAL(20, 4) NOT NULL,
    current_price DECIMAL(20, 4) NOT NULL,
    invested_value DECIMAL(20, 4) NOT NULL,
    current_value DECIMAL(20, 4) NOT NULL,
    accrued_interest DECIMAL(20, 4) NOT NULL DEFAULT 0,
    total_interest_received DECIMAL(20, 4) NOT NULL DEFAULT 0,
    pnl DECIMAL(20, 4) NOT NULL DEFAULT 0,
    pnl_percentage DECIMAL(10, 4) NOT NULL DEFAULT 0,
    purchase_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bond_holdings_portfolio_id ON bond_holdings(portfolio_id);
CREATE INDEX idx_bond_holdings_bond_id ON bond_holdings(bond_id);
CREATE UNIQUE INDEX idx_bond_holdings_unique ON bond_holdings(portfolio_id, bond_id);

CREATE TRIGGER update_bond_holdings_updated_at
    BEFORE UPDATE ON bond_holdings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Model Allocations Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS model_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    portfolio_id UUID NOT NULL REFERENCES paper_portfolios(id) ON DELETE CASCADE,
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    allocation_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0,
    min_allocation DECIMAL(5, 2) NOT NULL DEFAULT 0,
    max_allocation DECIMAL(5, 2) NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT true,
    auto_rebalance BOOLEAN NOT NULL DEFAULT false,
    rebalance_threshold DECIMAL(5, 2) NOT NULL DEFAULT 5, -- Percentage deviation trigger
    last_rebalance_date TIMESTAMP WITH TIME ZONE,
    performance_score DECIMAL(10, 4),
    risk_score DECIMAL(10, 4),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_model_allocations_portfolio_id ON model_allocations(portfolio_id);
CREATE INDEX idx_model_allocations_model_id ON model_allocations(model_id);
CREATE UNIQUE INDEX idx_model_allocations_unique ON model_allocations(portfolio_id, model_id);

CREATE TRIGGER update_model_allocations_updated_at
    BEFORE UPDATE ON model_allocations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE model_allocations IS 'Model allocation percentages within portfolios';

-- ============================================================================
-- Model Selection Config Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS model_selection_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    portfolio_id UUID NOT NULL REFERENCES paper_portfolios(id) ON DELETE CASCADE,
    strategy model_selection_strategy NOT NULL DEFAULT 'best_performer',
    lookback_period_days INTEGER NOT NULL DEFAULT 30,
    rebalance_frequency_days INTEGER NOT NULL DEFAULT 7,
    min_models INTEGER NOT NULL DEFAULT 1,
    max_models INTEGER NOT NULL DEFAULT 5,
    min_confidence_threshold DECIMAL(5, 4) NOT NULL DEFAULT 0.6,
    max_correlation_threshold DECIMAL(5, 4) NOT NULL DEFAULT 0.7,
    use_ensemble_voting BOOLEAN NOT NULL DEFAULT false,
    ensemble_weight_method VARCHAR(20) NOT NULL DEFAULT 'equal', -- equal, performance, sharpe, inverse_volatility
    rotation_metric VARCHAR(20) NOT NULL DEFAULT 'sharpe', -- returns, sharpe, sortino, calmar
    momentum_lookback_days INTEGER NOT NULL DEFAULT 14,
    risk_budget DECIMAL(5, 4) NOT NULL DEFAULT 0.02, -- 2% default
    custom_rules JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_model_selection_configs_portfolio_id ON model_selection_configs(portfolio_id);
CREATE UNIQUE INDEX idx_model_selection_configs_unique ON model_selection_configs(portfolio_id);

CREATE TRIGGER update_model_selection_configs_updated_at
    BEFORE UPDATE ON model_selection_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE model_selection_configs IS 'Configuration for automated model selection strategies';

-- ============================================================================
-- Portfolio Daily Snapshots Table (for historical tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    portfolio_id UUID NOT NULL REFERENCES paper_portfolios(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    total_value DECIMAL(20, 4) NOT NULL,
    cash_balance DECIMAL(20, 4) NOT NULL,
    invested_value DECIMAL(20, 4) NOT NULL,
    daily_return DECIMAL(10, 6),
    cumulative_return DECIMAL(10, 6),
    volatility DECIMAL(10, 6),
    beta DECIMAL(10, 6),
    alpha DECIMAL(10, 6),
    sharpe_ratio DECIMAL(10, 6),
    sortino_ratio DECIMAL(10, 6),
    max_drawdown DECIMAL(10, 6),
    current_drawdown DECIMAL(10, 6),
    var_95 DECIMAL(10, 6),
    cvar_95 DECIMAL(10, 6),
    sector_allocation JSONB,
    asset_allocation JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_portfolio_snapshots_portfolio_id ON portfolio_snapshots(portfolio_id);
CREATE INDEX idx_portfolio_snapshots_date ON portfolio_snapshots(snapshot_date);
CREATE UNIQUE INDEX idx_portfolio_snapshots_unique ON portfolio_snapshots(portfolio_id, snapshot_date);

COMMENT ON TABLE portfolio_snapshots IS 'Daily portfolio value and analytics snapshots';

-- ============================================================================
-- Watchlists Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS watchlists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    symbols JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_watchlists_user_id ON watchlists(user_id);

CREATE TRIGGER update_watchlists_updated_at
    BEFORE UPDATE ON watchlists
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Indian Market Holidays Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS market_holidays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exchange exchange_type NOT NULL,
    holiday_date DATE NOT NULL,
    description VARCHAR(255) NOT NULL,
    is_half_day BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_market_holidays_unique ON market_holidays(exchange, holiday_date);

COMMENT ON TABLE market_holidays IS 'NSE/BSE market holidays for trading calendar';

-- ============================================================================
-- Insert Default Bond Data (Government Securities)
-- ============================================================================

INSERT INTO bonds (isin, name, issuer, bond_type, face_value, issue_price, current_price, coupon_rate, coupon_frequency, issue_date, maturity_date, credit_rating, rating_agency, tax_status, minimum_investment)
VALUES 
    ('IN0020220019', 'GOI 2032 7.26%', 'Government of India', 'government', 100, 100, 101.50, 7.26, 'semi_annual', '2022-06-17', '2032-06-17', 'Sovereign', 'RBI', 'taxable', 10000),
    ('IN0020230001', 'GOI 2033 7.18%', 'Government of India', 'government', 100, 100, 100.75, 7.18, 'semi_annual', '2023-01-13', '2033-01-13', 'Sovereign', 'RBI', 'taxable', 10000),
    ('SGBAUG28', 'Sovereign Gold Bond 2028', 'Reserve Bank of India', 'sgb', 1000, 5500, 6200, 2.50, 'semi_annual', '2020-08-01', '2028-08-01', 'Sovereign', 'RBI', 'tax_free', 5500),
    ('IN0020210039', 'RBI Floating Rate Bond 2028', 'Reserve Bank of India', 'rbi_bond', 1000, 1000, 1000, 7.15, 'semi_annual', '2021-07-01', '2028-07-01', 'Sovereign', 'RBI', 'taxable', 1000)
ON CONFLICT (isin) DO NOTHING;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON COLUMN paper_portfolios.initial_capital IS 'Starting capital in INR (default 10 Lakhs)';
COMMENT ON COLUMN paper_trades.stt IS 'Securities Transaction Tax - 0.1% for delivery, 0.025% for intraday';
COMMENT ON COLUMN sip_plans.xirr IS 'Extended Internal Rate of Return for accurate SIP returns';
