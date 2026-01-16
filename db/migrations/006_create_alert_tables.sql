-- Migration: 006_create_alert_tables.sql
-- Description: Creates tables for alert preferences and alert history
-- Created: 2026-01-15

-- Alert Type enum
CREATE TYPE alert_type AS ENUM (
    'large_loss',
    'low_confidence',
    'high_drawdown',
    'consecutive_losses',
    'model_degradation',
    'unusual_volume',
    'risk_limit_breach',
    'custom'
);

-- Alert Severity enum
CREATE TYPE alert_severity AS ENUM (
    'info',
    'warning',
    'critical'
);

-- Alert Status enum
CREATE TYPE alert_status AS ENUM (
    'active',
    'dismissed',
    'acknowledged',
    'resolved'
);

-- Alert Preferences Table - Stores user alert configuration
CREATE TABLE IF NOT EXISTS alert_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL,
    model_id UUID REFERENCES models(id) ON DELETE CASCADE,
    alert_type alert_type NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    threshold_value DECIMAL(20, 8),
    threshold_percentage DECIMAL(10, 4),
    consecutive_count INTEGER,
    time_window_minutes INTEGER,
    severity alert_severity NOT NULL DEFAULT 'warning',
    push_enabled BOOLEAN NOT NULL DEFAULT true,
    email_enabled BOOLEAN NOT NULL DEFAULT false,
    sound_enabled BOOLEAN NOT NULL DEFAULT true,
    custom_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Unique constraint for user + model + alert_type combination
    CONSTRAINT unique_user_model_alert UNIQUE (user_id, model_id, alert_type)
);

-- Alert History Table - Stores triggered alerts
CREATE TABLE IF NOT EXISTS alert_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL,
    model_id UUID REFERENCES models(id) ON DELETE CASCADE,
    trade_id UUID REFERENCES trades(id) ON DELETE SET NULL,
    alert_type alert_type NOT NULL,
    severity alert_severity NOT NULL,
    status alert_status NOT NULL DEFAULT 'active',
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    details JSONB,
    threshold_value DECIMAL(20, 8),
    actual_value DECIMAL(20, 8),
    triggered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    dismissed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Push Subscription Table - Stores browser push subscription info
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh_key TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Unique constraint for user + endpoint
    CONSTRAINT unique_user_endpoint UNIQUE (user_id, endpoint)
);

-- Indexes for efficient queries
CREATE INDEX idx_alert_preferences_user_id ON alert_preferences(user_id);
CREATE INDEX idx_alert_preferences_model_id ON alert_preferences(model_id);
CREATE INDEX idx_alert_preferences_enabled ON alert_preferences(enabled) WHERE enabled = true;
CREATE INDEX idx_alert_preferences_type ON alert_preferences(alert_type);

CREATE INDEX idx_alert_history_user_id ON alert_history(user_id);
CREATE INDEX idx_alert_history_model_id ON alert_history(model_id);
CREATE INDEX idx_alert_history_status ON alert_history(status);
CREATE INDEX idx_alert_history_triggered_at ON alert_history(triggered_at);
CREATE INDEX idx_alert_history_severity ON alert_history(severity);
CREATE INDEX idx_alert_history_user_status ON alert_history(user_id, status);

CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_alert_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_alert_preferences_updated_at
    BEFORE UPDATE ON alert_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_alert_preferences_timestamp();

CREATE TRIGGER trigger_push_subscriptions_updated_at
    BEFORE UPDATE ON push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_alert_preferences_timestamp();

-- Comments
COMMENT ON TABLE alert_preferences IS 'Stores user preferences for different alert types';
COMMENT ON TABLE alert_history IS 'Stores history of triggered alerts';
COMMENT ON TABLE push_subscriptions IS 'Stores browser push notification subscriptions';
COMMENT ON COLUMN alert_preferences.threshold_value IS 'Absolute threshold value for triggering alert';
COMMENT ON COLUMN alert_preferences.threshold_percentage IS 'Percentage threshold for triggering alert';
COMMENT ON COLUMN alert_preferences.consecutive_count IS 'Number of consecutive events to trigger alert';
COMMENT ON COLUMN alert_preferences.time_window_minutes IS 'Time window for aggregating events';
COMMENT ON COLUMN alert_history.details IS 'Additional JSON data about the alert context';
