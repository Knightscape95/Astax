-- Migration: 008_create_experiments_tables.sql
-- Description: Creates tables for experiment tracking (training runs from Colab)
-- Created: 2026-01-15

-- ============================================================================
-- EXPERIMENT STATUS ENUM
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE experiment_status AS ENUM ('running', 'completed', 'failed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- EXPERIMENTS TABLE
-- ============================================================================
-- Stores experiment metadata and key metrics from training runs

CREATE TABLE IF NOT EXISTS experiments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    model_type VARCHAR(50) NOT NULL,
    status experiment_status NOT NULL DEFAULT 'running',

    -- Configuration
    target_asset VARCHAR(50) NOT NULL,
    data_source VARCHAR(50) NOT NULL,
    date_range_start TIMESTAMP WITH TIME ZONE NOT NULL,
    date_range_end TIMESTAMP WITH TIME ZONE NOT NULL,
    train_test_split DECIMAL(3,2) NOT NULL,
    hyperparameters JSONB DEFAULT '{}',
    features TEXT[] DEFAULT '{}',

    -- Training metrics (final values)
    train_loss DECIMAL(10,6),
    train_accuracy DECIMAL(5,4),
    val_loss DECIMAL(10,6),
    val_accuracy DECIMAL(5,4),

    -- Evaluation metrics
    test_accuracy DECIMAL(5,4),
    test_precision DECIMAL(5,4),
    test_recall DECIMAL(5,4),
    test_f1 DECIMAL(5,4),
    sharpe_ratio DECIMAL(8,4),
    max_drawdown DECIMAL(8,4),

    -- Metadata
    training_duration_seconds INTEGER,
    total_epochs INTEGER,
    gpu_used BOOLEAN DEFAULT false,
    colab_session_id VARCHAR(100),

    -- External references
    wandb_run_id VARCHAR(100),
    model_id UUID REFERENCES models(id) ON DELETE SET NULL,

    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- EXPERIMENT METRICS TABLE
-- ============================================================================
-- Stores time-series metrics during training (epoch-by-epoch)

CREATE TABLE IF NOT EXISTS experiment_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    epoch INTEGER NOT NULL,

    -- Metrics at this epoch
    train_loss DECIMAL(10,6) NOT NULL,
    train_accuracy DECIMAL(5,4),
    val_loss DECIMAL(10,6),
    val_accuracy DECIMAL(5,4),
    learning_rate DECIMAL(10,8),

    -- System metrics
    gpu_memory_used_mb INTEGER,
    training_time_seconds DECIMAL(8,2),

    -- Timestamps
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Ensure unique epoch per experiment
    UNIQUE(experiment_id, epoch)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Experiments indexes for common queries
CREATE INDEX IF NOT EXISTS idx_experiments_status ON experiments(status);
CREATE INDEX IF NOT EXISTS idx_experiments_model_type ON experiments(model_type);
CREATE INDEX IF NOT EXISTS idx_experiments_target_asset ON experiments(target_asset);
CREATE INDEX IF NOT EXISTS idx_experiments_started_at ON experiments(started_at);
CREATE INDEX IF NOT EXISTS idx_experiments_model_id ON experiments(model_id);
CREATE INDEX IF NOT EXISTS idx_experiments_wandb_run_id ON experiments(wandb_run_id);
CREATE INDEX IF NOT EXISTS idx_experiments_created_at ON experiments(created_at);

-- Experiment metrics indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_experiment_metrics_experiment_id ON experiment_metrics(experiment_id);
CREATE INDEX IF NOT EXISTS idx_experiment_metrics_epoch ON experiment_metrics(experiment_id, epoch);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger to automatically update updated_at for experiments
CREATE TRIGGER update_experiments_updated_at
    BEFORE UPDATE ON experiments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE experiments IS 'Stores experiment metadata and key metrics from Colab training runs';
COMMENT ON COLUMN experiments.id IS 'Unique identifier for the experiment';
COMMENT ON COLUMN experiments.name IS 'User-provided experiment name';
COMMENT ON COLUMN experiments.model_type IS 'Model architecture: LSTM, XGBoost, Transformer, DNN, RandomForest, RL';
COMMENT ON COLUMN experiments.status IS 'Current status: running, completed, failed, cancelled';
COMMENT ON COLUMN experiments.target_asset IS 'Asset being predicted (e.g., AAPL, BTC-USD)';
COMMENT ON COLUMN experiments.data_source IS 'Data source: yahoo, alpha_vantage, nse';
COMMENT ON COLUMN experiments.hyperparameters IS 'JSON object storing model hyperparameters';
COMMENT ON COLUMN experiments.features IS 'Array of feature names used in training';
COMMENT ON COLUMN experiments.wandb_run_id IS 'Link to Weights & Biases run for detailed logs';
COMMENT ON COLUMN experiments.model_id IS 'FK to models table if experiment resulted in deployed model';

COMMENT ON TABLE experiment_metrics IS 'Stores epoch-by-epoch training metrics for experiments';
COMMENT ON COLUMN experiment_metrics.experiment_id IS 'FK to parent experiment';
COMMENT ON COLUMN experiment_metrics.epoch IS 'Training epoch number (0-indexed)';
COMMENT ON COLUMN experiment_metrics.train_loss IS 'Training loss at this epoch';
COMMENT ON COLUMN experiment_metrics.val_loss IS 'Validation loss at this epoch';
COMMENT ON COLUMN experiment_metrics.learning_rate IS 'Learning rate at this epoch (if applicable)';
