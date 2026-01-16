-- Migration: 005_create_indexes_and_views.sql
-- Description: Creates additional indexes and useful views for analytics
-- Created: 2026-01-15

-- Composite indexes for common analytical queries
CREATE INDEX IF NOT EXISTS idx_trades_model_status_time 
    ON trades(model_id, status, entry_time);

CREATE INDEX IF NOT EXISTS idx_trades_symbol_time 
    ON trades(symbol, entry_time);

-- View: Latest performance metrics per model
CREATE OR REPLACE VIEW v_latest_model_performance AS
SELECT DISTINCT ON (model_id)
    pm.*,
    m.name as model_name,
    m.status as model_status,
    m.algorithm,
    m.target_asset
FROM performance_metrics pm
JOIN models m ON pm.model_id = m.id
ORDER BY model_id, period_end DESC;

-- View: Model summary with trade statistics
CREATE OR REPLACE VIEW v_model_summary AS
SELECT 
    m.id,
    m.name,
    m.version,
    m.status,
    m.algorithm,
    m.target_asset,
    m.created_at,
    COUNT(DISTINCT t.id) as total_trades,
    COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'closed' AND t.pnl > 0) as winning_trades,
    COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'closed' AND t.pnl < 0) as losing_trades,
    COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'open') as open_trades,
    COALESCE(SUM(t.pnl) FILTER (WHERE t.status = 'closed'), 0) as total_pnl,
    COUNT(DISTINCT mu.id) as total_updates,
    MAX(mu.created_at) as last_update
FROM models m
LEFT JOIN trades t ON m.id = t.model_id
LEFT JOIN model_updates mu ON m.id = mu.model_id
GROUP BY m.id, m.name, m.version, m.status, m.algorithm, m.target_asset, m.created_at;

-- View: Daily trade performance
CREATE OR REPLACE VIEW v_daily_trade_performance AS
SELECT 
    m.id as model_id,
    m.name as model_name,
    DATE(t.entry_time) as trade_date,
    COUNT(*) as trades_count,
    COUNT(*) FILTER (WHERE t.pnl > 0) as winning_trades,
    COUNT(*) FILTER (WHERE t.pnl < 0) as losing_trades,
    SUM(t.pnl) as daily_pnl,
    AVG(t.pnl) as avg_pnl,
    MAX(t.pnl) as best_trade,
    MIN(t.pnl) as worst_trade
FROM trades t
JOIN models m ON t.model_id = m.id
WHERE t.status = 'closed'
GROUP BY m.id, m.name, DATE(t.entry_time)
ORDER BY trade_date DESC;

-- View: Model update history with performance impact
CREATE OR REPLACE VIEW v_model_update_impact AS
SELECT 
    mu.*,
    m.name as model_name,
    -- Get performance metrics before and after update
    pm_before.sharpe_ratio as sharpe_before,
    pm_after.sharpe_ratio as sharpe_after,
    pm_before.win_rate as win_rate_before,
    pm_after.win_rate as win_rate_after
FROM model_updates mu
JOIN models m ON mu.model_id = m.id
LEFT JOIN LATERAL (
    SELECT sharpe_ratio, win_rate
    FROM performance_metrics
    WHERE model_id = mu.model_id AND period_end < mu.created_at
    ORDER BY period_end DESC
    LIMIT 1
) pm_before ON true
LEFT JOIN LATERAL (
    SELECT sharpe_ratio, win_rate
    FROM performance_metrics
    WHERE model_id = mu.model_id AND period_start >= mu.created_at
    ORDER BY period_start ASC
    LIMIT 1
) pm_after ON true
ORDER BY mu.created_at DESC;

COMMENT ON VIEW v_latest_model_performance IS 'Shows the most recent performance metrics for each model';
COMMENT ON VIEW v_model_summary IS 'Aggregated summary statistics for all models';
COMMENT ON VIEW v_daily_trade_performance IS 'Daily breakdown of trading performance per model';
COMMENT ON VIEW v_model_update_impact IS 'Model updates with before/after performance comparison';
