-- Migration: 001_create_models_table.sql
-- Description: Creates the models table for storing ML model configurations
-- Created: 2026-01-15

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE model_status AS ENUM ('active', 'inactive', 'training', 'deprecated');

CREATE TABLE IF NOT EXISTS models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(50) NOT NULL,
    status model_status NOT NULL DEFAULT 'inactive',
    algorithm VARCHAR(100) NOT NULL,
    hyperparameters JSONB DEFAULT '{}',
    features TEXT[] DEFAULT '{}',
    target_asset VARCHAR(50) NOT NULL,
    training_start_date TIMESTAMP WITH TIME ZONE,
    training_end_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_models_status ON models(status);
CREATE INDEX idx_models_algorithm ON models(algorithm);
CREATE INDEX idx_models_target_asset ON models(target_asset);
CREATE INDEX idx_models_created_at ON models(created_at);

-- Trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_models_updated_at
    BEFORE UPDATE ON models
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE models IS 'Stores ML model configurations and metadata';
COMMENT ON COLUMN models.id IS 'Unique identifier for the model';
COMMENT ON COLUMN models.name IS 'Human-readable name for the model';
COMMENT ON COLUMN models.version IS 'Semantic version of the model';
COMMENT ON COLUMN models.status IS 'Current operational status of the model';
COMMENT ON COLUMN models.algorithm IS 'ML algorithm used (e.g., LSTM, XGBoost)';
COMMENT ON COLUMN models.hyperparameters IS 'JSON object containing model hyperparameters';
COMMENT ON COLUMN models.features IS 'Array of feature names used by the model';
COMMENT ON COLUMN models.target_asset IS 'Trading asset the model targets (e.g., BTC-USD)';
