-- Migration: 004_create_model_updates_table.sql
-- Description: Creates the model_updates table for tracking model changes and retraining events
-- Created: 2026-01-15

CREATE TYPE update_type AS ENUM ('retrain', 'parameter_change', 'feature_update', 'version_upgrade');

CREATE TABLE IF NOT EXISTS model_updates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    update_type update_type NOT NULL,
    previous_version VARCHAR(50),
    new_version VARCHAR(50) NOT NULL,
    changes_description TEXT NOT NULL,
    previous_hyperparameters JSONB,
    new_hyperparameters JSONB,
    previous_features TEXT[],
    new_features TEXT[],
    training_metrics JSONB,
    validation_metrics JSONB,
    triggered_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_model_updates_model_id ON model_updates(model_id);
CREATE INDEX idx_model_updates_update_type ON model_updates(update_type);
CREATE INDEX idx_model_updates_created_at ON model_updates(created_at);
CREATE INDEX idx_model_updates_model_created ON model_updates(model_id, created_at);
CREATE INDEX idx_model_updates_new_version ON model_updates(new_version);

-- Index for JSONB queries on metrics
CREATE INDEX idx_model_updates_training_metrics ON model_updates USING GIN (training_metrics);
CREATE INDEX idx_model_updates_validation_metrics ON model_updates USING GIN (validation_metrics);

COMMENT ON TABLE model_updates IS 'Tracks all changes, retraining events, and version updates for models';
COMMENT ON COLUMN model_updates.update_type IS 'Type of update: retrain, parameter_change, feature_update, version_upgrade';
COMMENT ON COLUMN model_updates.previous_version IS 'Model version before the update';
COMMENT ON COLUMN model_updates.new_version IS 'Model version after the update';
COMMENT ON COLUMN model_updates.changes_description IS 'Human-readable description of what changed';
COMMENT ON COLUMN model_updates.training_metrics IS 'JSON object with training metrics (loss, accuracy, etc.)';
COMMENT ON COLUMN model_updates.validation_metrics IS 'JSON object with validation metrics';
COMMENT ON COLUMN model_updates.triggered_by IS 'What triggered the update (user, scheduler, performance threshold)';
