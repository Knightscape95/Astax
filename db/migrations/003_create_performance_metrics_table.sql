-- Migration: 003_create_performance_metrics_table.sql
-- Description: Creates the performance_metrics table for storing aggregated performance data
-- Created: 2026-01-15

CREATE TABLE IF NOT EXISTS performance_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    total_trades INTEGER NOT NULL DEFAULT 0,
    winning_trades INTEGER NOT NULL DEFAULT 0,
    losing_trades INTEGER NOT NULL DEFAULT 0,
    win_rate DECIMAL(5, 4) NOT NULL DEFAULT 0,
    total_pnl DECIMAL(20, 8) NOT NULL DEFAULT 0,
    total_pnl_percentage DECIMAL(10, 4) NOT NULL DEFAULT 0,
    average_pnl DECIMAL(20, 8) NOT NULL DEFAULT 0,
    average_win DECIMAL(20, 8) NOT NULL DEFAULT 0,
    average_loss DECIMAL(20, 8) NOT NULL DEFAULT 0,
    max_drawdown DECIMAL(20, 8) NOT NULL DEFAULT 0,
    max_drawdown_percentage DECIMAL(10, 4) NOT NULL DEFAULT 0,
    sharpe_ratio DECIMAL(10, 4),
    sortino_ratio DECIMAL(10, 4),
    profit_factor DECIMAL(10, 4),
    expectancy DECIMAL(20, 8),
    avg_holding_period_hours DECIMAL(10, 2),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Ensure no overlapping periods for the same model
    CONSTRAINT unique_model_period UNIQUE (model_id, period_start, period_end)
);

-- Indexes for common queries
CREATE INDEX idx_performance_metrics_model_id ON performance_metrics(model_id);
CREATE INDEX idx_performance_metrics_period_start ON performance_metrics(period_start);
CREATE INDEX idx_performance_metrics_period_end ON performance_metrics(period_end);
CREATE INDEX idx_performance_metrics_model_period ON performance_metrics(model_id, period_start, period_end);
CREATE INDEX idx_performance_metrics_sharpe ON performance_metrics(sharpe_ratio) WHERE sharpe_ratio IS NOT NULL;
CREATE INDEX idx_performance_metrics_win_rate ON performance_metrics(win_rate);

-- Check constraints for data validity
ALTER TABLE performance_metrics ADD CONSTRAINT chk_win_rate 
    CHECK (win_rate >= 0 AND win_rate <= 1);
ALTER TABLE performance_metrics ADD CONSTRAINT chk_period_order 
    CHECK (period_end > period_start);
ALTER TABLE performance_metrics ADD CONSTRAINT chk_trades_sum 
    CHECK (winning_trades + losing_trades <= total_trades);

COMMENT ON TABLE performance_metrics IS 'Stores aggregated performance metrics for model evaluation';
COMMENT ON COLUMN performance_metrics.period_start IS 'Start of the performance measurement period';
COMMENT ON COLUMN performance_metrics.period_end IS 'End of the performance measurement period';
COMMENT ON COLUMN performance_metrics.win_rate IS 'Ratio of winning trades to total trades (0-1)';
COMMENT ON COLUMN performance_metrics.max_drawdown IS 'Maximum peak-to-trough decline in absolute terms';
COMMENT ON COLUMN performance_metrics.max_drawdown_percentage IS 'Maximum peak-to-trough decline as percentage';
COMMENT ON COLUMN performance_metrics.sharpe_ratio IS 'Risk-adjusted return metric (annualized)';
COMMENT ON COLUMN performance_metrics.sortino_ratio IS 'Risk-adjusted return focusing on downside volatility';
COMMENT ON COLUMN performance_metrics.profit_factor IS 'Gross profits divided by gross losses';
COMMENT ON COLUMN performance_metrics.expectancy IS 'Expected profit per trade';
