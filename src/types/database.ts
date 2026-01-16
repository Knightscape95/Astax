/**
 * Database Types for Model Performance Tracking
 */

// Model Status enum
export type ModelStatus = 'active' | 'inactive' | 'training' | 'deprecated';

// Alert Type enum
export type AlertType = 
  | 'large_loss'
  | 'low_confidence'
  | 'high_drawdown'
  | 'consecutive_losses'
  | 'model_degradation'
  | 'unusual_volume'
  | 'risk_limit_breach'
  | 'custom'
  | 'model_update'
  | 'performance_milestone';

// Alert Severity enum
export type AlertSeverity = 'info' | 'warning' | 'critical';

// Alert Status enum
export type AlertStatus = 'active' | 'dismissed' | 'acknowledged' | 'resolved';

/**
 * Alert Preference - User notification preferences
 */
export interface AlertPreference {
  id: string;
  user_id: string;
  alert_type: AlertType;
  enabled: boolean;
  email_enabled: boolean;
  push_enabled: boolean;
  min_severity: AlertSeverity;
  thresholds: Record<string, unknown> | null;
  // Dynamic fields from JSON 'thresholds' column
  model_id?: string;
  threshold_value?: number;
  threshold_percentage?: number;
  consecutive_count?: number;
  time_window_minutes?: number;
  severity?: AlertSeverity;
  sound_enabled?: boolean;
  custom_message?: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Alert History - Stores sent alerts
 */
export interface AlertHistory {
  id: string;
  user_id: string;
  model_id: string | null;
  trade_id: string | null;
  alert_type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  details?: Record<string, unknown>;
  threshold_value?: number | null;
  actual_value?: number | null;
  status: AlertStatus;
  triggered_at?: Date;
  acknowledged_at?: Date | null;
  resolved_at?: Date | null;
  sent_at?: Date | null;
  read_at?: Date | null;
  dismissed_at: Date | null;
  created_at: Date;
}

export interface CreateAlertHistoryInput {
  user_id: string;
  model_id?: string;
  trade_id?: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  // Dynamic fields
  details?: Record<string, unknown>;
  threshold_value?: number;
  actual_value?: number;
}

// Trade Direction enum
export type TradeDirection = 'long' | 'short';

// Trade Status enum
export type TradeStatus = 'open' | 'closed' | 'cancelled';

// Update Type enum
export type UpdateType = 'retrain' | 'parameter_change' | 'feature_update' | 'version_upgrade';

// Experiment Status enum
export type ExperimentStatus = 'running' | 'completed' | 'failed' | 'cancelled';

// Experiment Model Type enum
export type ExperimentModelType = 'LSTM' | 'XGBoost' | 'Transformer' | 'DNN' | 'RandomForest' | 'RL';

// Experiment Data Source enum
export type ExperimentDataSource = 'yahoo' | 'alpha_vantage' | 'nse';

/**
 * Models Table - Stores ML model configurations
 */
export interface Model {
  id: string;
  name: string;
  description: string | null;
  version: string;
  status: ModelStatus;
  algorithm: string;
  hyperparameters: Record<string, unknown>;
  features: string[];
  target_asset: string;
  training_start_date: Date | null;
  training_end_date: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateModelInput {
  name: string;
  description?: string;
  version: string;
  status?: ModelStatus;
  algorithm: string;
  hyperparameters?: Record<string, unknown>;
  features?: string[];
  target_asset: string;
  training_start_date?: Date;
  training_end_date?: Date;
}

export interface UpdateModelInput {
  name?: string;
  description?: string;
  version?: string;
  status?: ModelStatus;
  algorithm?: string;
  hyperparameters?: Record<string, unknown>;
  features?: string[];
  target_asset?: string;
  training_start_date?: Date;
  training_end_date?: Date;
}

/**
 * Trades Table - Stores individual trade records
 */
export interface Trade {
  id: string;
  model_id: string;
  symbol: string;
  direction: TradeDirection;
  entry_price: number;
  exit_price: number | null;
  quantity: number;
  entry_time: Date;
  exit_time: Date | null;
  status: TradeStatus;
  pnl: number | null;
  pnl_percentage: number | null;
  fees: number;
  slippage: number | null;
  signal_confidence: number | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTradeInput {
  model_id: string;
  symbol: string;
  direction: TradeDirection;
  entry_price: number;
  quantity: number;
  entry_time?: Date;
  status?: TradeStatus;
  fees?: number;
  signal_confidence?: number;
  notes?: string;
}

export interface UpdateTradeInput {
  exit_price?: number;
  exit_time?: Date;
  status?: TradeStatus;
  pnl?: number;
  pnl_percentage?: number;
  fees?: number;
  slippage?: number;
  notes?: string;
}

/**
 * Performance Metrics Table - Stores aggregated performance data
 */
export interface PerformanceMetric {
  id: string;
  model_id: string;
  period_start: Date;
  period_end: Date;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pnl: number;
  total_pnl_percentage: number;
  average_pnl: number;
  average_win: number;
  average_loss: number;
  max_drawdown: number;
  max_drawdown_percentage: number;
  sharpe_ratio: number | null;
  sortino_ratio: number | null;
  profit_factor: number | null;
  expectancy: number | null;
  avg_holding_period_hours: number | null;
  created_at: Date;
}

export interface CreatePerformanceMetricInput {
  model_id: string;
  period_start: Date;
  period_end: Date;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pnl: number;
  total_pnl_percentage: number;
  average_pnl: number;
  average_win: number;
  average_loss: number;
  max_drawdown: number;
  max_drawdown_percentage: number;
  sharpe_ratio?: number;
  sortino_ratio?: number;
  profit_factor?: number;
  expectancy?: number;
  avg_holding_period_hours?: number;
}

/**
 * Model Updates Table - Tracks model changes and retraining events
 */
export interface ModelUpdate {
  id: string;
  model_id: string;
  update_type: UpdateType;
  previous_version: string | null;
  new_version: string;
  changes_description: string;
  previous_hyperparameters: Record<string, unknown> | null;
  new_hyperparameters: Record<string, unknown> | null;
  previous_features: string[] | null;
  new_features: string[] | null;
  training_metrics: Record<string, unknown> | null;
  validation_metrics: Record<string, unknown> | null;
  triggered_by: string | null;
  created_at: Date;
}

export interface CreateModelUpdateInput {
  model_id: string;
  update_type: UpdateType;
  previous_version?: string;
  new_version: string;
  changes_description: string;
  previous_hyperparameters?: Record<string, unknown>;
  new_hyperparameters?: Record<string, unknown>;
  previous_features?: string[];
  new_features?: string[];
  training_metrics?: Record<string, unknown>;
  validation_metrics?: Record<string, unknown>;
  triggered_by?: string;
}

/**
 * Pagination Types
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Filter Types
 */
export interface ModelFilters {
  status?: ModelStatus;
  algorithm?: string;
  target_asset?: string;
}

export interface TradeFilters {
  model_id?: string;
  symbol?: string;
  direction?: TradeDirection;
  status?: TradeStatus;
  start_date?: Date;
  end_date?: Date;
}

export interface PerformanceMetricFilters {
  model_id?: string;
  start_date?: Date;
  end_date?: Date;
}

export interface ModelUpdateFilters {
  model_id?: string;
  update_type?: UpdateType;
  start_date?: Date;
  end_date?: Date;
}

/**
 * Alert Detection Result
 */
export interface AlertDetectionResult {
  shouldAlert: boolean;
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  thresholdValue: number | null;
  actualValue: number | null;
  details: Record<string, unknown>;
}

// ============================================================================
// EXPERIMENT TRACKING TYPES
// ============================================================================

/**
 * Experiment - Stores experiment metadata and key metrics from training runs
 */
export interface Experiment {
  id: string;
  name: string;
  model_type: ExperimentModelType | string;
  status: ExperimentStatus;

  // Configuration
  target_asset: string;
  data_source: ExperimentDataSource | string;
  date_range_start: Date;
  date_range_end: Date;
  train_test_split: number;
  hyperparameters: Record<string, unknown>;
  features: string[];

  // Training metrics (final values)
  train_loss: number | null;
  train_accuracy: number | null;
  val_loss: number | null;
  val_accuracy: number | null;

  // Evaluation metrics
  test_accuracy: number | null;
  test_precision: number | null;
  test_recall: number | null;
  test_f1: number | null;
  sharpe_ratio: number | null;
  max_drawdown: number | null;

  // Metadata
  training_duration_seconds: number | null;
  total_epochs: number | null;
  gpu_used: boolean;
  colab_session_id: string | null;

  // External references
  wandb_run_id: string | null;
  model_id: string | null;

  // Timestamps
  started_at: Date;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * ExperimentMetric - Stores time-series metrics during training (epoch-by-epoch)
 */
export interface ExperimentMetric {
  id: string;
  experiment_id: string;
  epoch: number;

  // Metrics at this epoch
  train_loss: number;
  train_accuracy: number | null;
  val_loss: number | null;
  val_accuracy: number | null;
  learning_rate: number | null;

  // System metrics
  gpu_memory_used_mb: number | null;
  training_time_seconds: number | null;

  // Timestamps
  timestamp: Date;
  created_at: Date;
}

/**
 * CreateExperimentInput - Input type for creating a new experiment
 */
export interface CreateExperimentInput {
  name: string;
  model_type: ExperimentModelType | string;
  target_asset: string;
  data_source: ExperimentDataSource | string;
  date_range_start: Date;
  date_range_end: Date;
  train_test_split: number;
  hyperparameters?: Record<string, unknown>;
  features?: string[];
  gpu_used?: boolean;
  colab_session_id?: string;
  wandb_run_id?: string;
}

/**
 * UpdateExperimentInput - Input type for updating an experiment
 */
export interface UpdateExperimentInput {
  name?: string;
  status?: ExperimentStatus;

  // Training metrics
  train_loss?: number;
  train_accuracy?: number;
  val_loss?: number;
  val_accuracy?: number;

  // Evaluation metrics
  test_accuracy?: number;
  test_precision?: number;
  test_recall?: number;
  test_f1?: number;
  sharpe_ratio?: number;
  max_drawdown?: number;

  // Metadata
  training_duration_seconds?: number;
  total_epochs?: number;
  completed_at?: Date;

  // External references
  wandb_run_id?: string;
  model_id?: string;
}

/**
 * CreateExperimentMetricInput - Input type for logging epoch metrics
 */
export interface CreateExperimentMetricInput {
  experiment_id: string;
  epoch: number;
  train_loss: number;
  train_accuracy?: number;
  val_loss?: number;
  val_accuracy?: number;
  learning_rate?: number;
  gpu_memory_used_mb?: number;
  training_time_seconds?: number;
}

/**
 * ExperimentFilters - Filters for querying experiments
 */
export interface ExperimentFilters {
  status?: ExperimentStatus;
  model_type?: ExperimentModelType | string;
  target_asset?: string;
  data_source?: ExperimentDataSource | string;
  model_id?: string;
  start_date?: Date;
  end_date?: Date;
}
