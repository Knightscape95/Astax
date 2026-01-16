import { sql, transaction, getClient } from './db';
import type {
  Model,
  CreateModelInput,
  UpdateModelInput,
  Trade,
  CreateTradeInput,
  UpdateTradeInput,
  PerformanceMetric,
  CreatePerformanceMetricInput,
  ModelUpdate,
  CreateModelUpdateInput,
  PaginationParams,
  PaginatedResult,
  ModelFilters,
  TradeFilters,
  PerformanceMetricFilters,
  ModelUpdateFilters,
  Experiment,
  ExperimentMetric,
  ExperimentStatus,
  CreateExperimentInput,
  UpdateExperimentInput,
  CreateExperimentMetricInput,
  ExperimentFilters,
} from '@/types/database';

// ============================================================================
// Model CRUD Operations
// ============================================================================

export async function createModel(input: CreateModelInput): Promise<Model> {
  const result = await sql`
    INSERT INTO models (
      name, description, version, status, algorithm,
      hyperparameters, features, target_asset,
      training_start_date, training_end_date
    ) VALUES (
      ${input.name},
      ${input.description || null},
      ${input.version},
      ${input.status || 'inactive'},
      ${input.algorithm},
      ${JSON.stringify(input.hyperparameters || {})},
      ${JSON.stringify(input.features || [])},
      ${input.target_asset},
      ${input.training_start_date?.toISOString() || null},
      ${input.training_end_date?.toISOString() || null}
    )
    RETURNING *
  `;
  return transformModel(result.rows[0]);
}

export async function getModelById(id: string): Promise<Model | null> {
  const result = await sql`
    SELECT * FROM models WHERE id = ${id}
  `;
  return result.rows[0] ? transformModel(result.rows[0]) : null;
}

export async function getModels(
  filters?: ModelFilters,
  pagination?: PaginationParams
): Promise<PaginatedResult<Model>> {
  const page = pagination?.page || 1;
  const limit = pagination?.limit || 20;
  const offset = (page - 1) * limit;
  const sortBy = pagination?.sortBy || 'created_at';
  const sortOrder = pagination?.sortOrder || 'desc';

  // Build filter conditions
  const conditions: string[] = ['1=1'];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters?.status) {
    conditions.push(`status = $${paramIndex++}`);
    values.push(filters.status);
  }
  if (filters?.algorithm) {
    conditions.push(`algorithm = $${paramIndex++}`);
    values.push(filters.algorithm);
  }
  if (filters?.target_asset) {
    conditions.push(`target_asset = $${paramIndex++}`);
    values.push(filters.target_asset);
  }

  const whereClause = conditions.join(' AND ');
  
  // Get total count
  const countResult = await sql.query(
    `SELECT COUNT(*) as count FROM models WHERE ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Get paginated results
  const dataResult = await sql.query(
    `SELECT * FROM models WHERE ${whereClause} 
     ORDER BY ${sortBy} ${sortOrder}
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...values, limit, offset]
  );

  return {
    data: dataResult.rows.map(transformModel),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function updateModel(
  id: string,
  input: UpdateModelInput
): Promise<Model | null> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (input.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(input.name);
  }
  if (input.description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    values.push(input.description);
  }
  if (input.version !== undefined) {
    updates.push(`version = $${paramIndex++}`);
    values.push(input.version);
  }
  if (input.status !== undefined) {
    updates.push(`status = $${paramIndex++}`);
    values.push(input.status);
  }
  if (input.algorithm !== undefined) {
    updates.push(`algorithm = $${paramIndex++}`);
    values.push(input.algorithm);
  }
  if (input.hyperparameters !== undefined) {
    updates.push(`hyperparameters = $${paramIndex++}`);
    values.push(JSON.stringify(input.hyperparameters));
  }
  if (input.features !== undefined) {
    updates.push(`features = $${paramIndex++}`);
    values.push(input.features);
  }
  if (input.target_asset !== undefined) {
    updates.push(`target_asset = $${paramIndex++}`);
    values.push(input.target_asset);
  }
  if (input.training_start_date !== undefined) {
    updates.push(`training_start_date = $${paramIndex++}`);
    values.push(input.training_start_date);
  }
  if (input.training_end_date !== undefined) {
    updates.push(`training_end_date = $${paramIndex++}`);
    values.push(input.training_end_date);
  }

  if (updates.length === 0) {
    return getModelById(id);
  }

  values.push(id);
  const result = await sql.query(
    `UPDATE models SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  return result.rows[0] ? transformModel(result.rows[0]) : null;
}

export async function deleteModel(id: string): Promise<boolean> {
  const result = await sql`
    DELETE FROM models WHERE id = ${id}
  `;
  return result.rowCount > 0;
}

// ============================================================================
// Trade CRUD Operations
// ============================================================================

export async function createTrade(input: CreateTradeInput): Promise<Trade> {
  const result = await sql`
    INSERT INTO trades (
      model_id, symbol, direction, entry_price, quantity,
      entry_time, status, fees, signal_confidence, notes
    ) VALUES (
      ${input.model_id},
      ${input.symbol},
      ${input.direction},
      ${input.entry_price},
      ${input.quantity},
      ${(input.entry_time || new Date()).toISOString()},
      ${input.status || 'open'},
      ${input.fees || 0},
      ${input.signal_confidence || null},
      ${input.notes || null}
    )
    RETURNING *
  `;
  return transformTrade(result.rows[0]);
}

export async function getTradeById(id: string): Promise<Trade | null> {
  const result = await sql`
    SELECT * FROM trades WHERE id = ${id}
  `;
  return result.rows[0] ? transformTrade(result.rows[0]) : null;
}

export async function getTrades(
  filters?: TradeFilters,
  pagination?: PaginationParams
): Promise<PaginatedResult<Trade>> {
  const page = pagination?.page || 1;
  const limit = pagination?.limit || 50;
  const offset = (page - 1) * limit;
  const sortBy = pagination?.sortBy || 'entry_time';
  const sortOrder = pagination?.sortOrder || 'desc';

  const conditions: string[] = ['1=1'];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters?.model_id) {
    conditions.push(`model_id = $${paramIndex++}`);
    values.push(filters.model_id);
  }
  if (filters?.symbol) {
    conditions.push(`symbol = $${paramIndex++}`);
    values.push(filters.symbol);
  }
  if (filters?.direction) {
    conditions.push(`direction = $${paramIndex++}`);
    values.push(filters.direction);
  }
  if (filters?.status) {
    conditions.push(`status = $${paramIndex++}`);
    values.push(filters.status);
  }
  if (filters?.start_date) {
    conditions.push(`entry_time >= $${paramIndex++}`);
    values.push(filters.start_date);
  }
  if (filters?.end_date) {
    conditions.push(`entry_time <= $${paramIndex++}`);
    values.push(filters.end_date);
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await sql.query(
    `SELECT COUNT(*) as count FROM trades WHERE ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const dataResult = await sql.query(
    `SELECT * FROM trades WHERE ${whereClause} 
     ORDER BY ${sortBy} ${sortOrder}
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...values, limit, offset]
  );

  return {
    data: dataResult.rows.map(transformTrade),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function updateTrade(
  id: string,
  input: UpdateTradeInput
): Promise<Trade | null> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (input.exit_price !== undefined) {
    updates.push(`exit_price = $${paramIndex++}`);
    values.push(input.exit_price);
  }
  if (input.exit_time !== undefined) {
    updates.push(`exit_time = $${paramIndex++}`);
    values.push(input.exit_time);
  }
  if (input.status !== undefined) {
    updates.push(`status = $${paramIndex++}`);
    values.push(input.status);
  }
  if (input.pnl !== undefined) {
    updates.push(`pnl = $${paramIndex++}`);
    values.push(input.pnl);
  }
  if (input.pnl_percentage !== undefined) {
    updates.push(`pnl_percentage = $${paramIndex++}`);
    values.push(input.pnl_percentage);
  }
  if (input.fees !== undefined) {
    updates.push(`fees = $${paramIndex++}`);
    values.push(input.fees);
  }
  if (input.slippage !== undefined) {
    updates.push(`slippage = $${paramIndex++}`);
    values.push(input.slippage);
  }
  if (input.notes !== undefined) {
    updates.push(`notes = $${paramIndex++}`);
    values.push(input.notes);
  }

  if (updates.length === 0) {
    return getTradeById(id);
  }

  values.push(id);
  const result = await sql.query(
    `UPDATE trades SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  return result.rows[0] ? transformTrade(result.rows[0]) : null;
}

export async function closeTrade(
  id: string,
  exitPrice: number,
  exitTime?: Date
): Promise<Trade | null> {
  return updateTrade(id, {
    exit_price: exitPrice,
    exit_time: exitTime || new Date(),
    status: 'closed',
  });
}

export async function deleteTrade(id: string): Promise<boolean> {
  const result = await sql`
    DELETE FROM trades WHERE id = ${id}
  `;
  return result.rowCount > 0;
}

export async function getTradesByModel(
  modelId: string,
  status?: 'open' | 'closed' | 'cancelled'
): Promise<Trade[]> {
  if (status) {
    const result = await sql`
      SELECT * FROM trades 
      WHERE model_id = ${modelId} AND status = ${status}
      ORDER BY entry_time DESC
    `;
    return result.rows.map(transformTrade);
  }

  const result = await sql`
    SELECT * FROM trades 
    WHERE model_id = ${modelId}
    ORDER BY entry_time DESC
  `;
  return result.rows.map(transformTrade);
}

// ============================================================================
// Performance Metrics CRUD Operations
// ============================================================================

export async function createPerformanceMetric(
  input: CreatePerformanceMetricInput
): Promise<PerformanceMetric> {
  const result = await sql`
    INSERT INTO performance_metrics (
      model_id, period_start, period_end, total_trades,
      winning_trades, losing_trades, win_rate, total_pnl,
      total_pnl_percentage, average_pnl, average_win, average_loss,
      max_drawdown, max_drawdown_percentage, sharpe_ratio,
      sortino_ratio, profit_factor, expectancy, avg_holding_period_hours
    ) VALUES (
      ${input.model_id},
      ${input.period_start.toISOString()},
      ${input.period_end.toISOString()},
      ${input.total_trades},
      ${input.winning_trades},
      ${input.losing_trades},
      ${input.win_rate},
      ${input.total_pnl},
      ${input.total_pnl_percentage},
      ${input.average_pnl},
      ${input.average_win},
      ${input.average_loss},
      ${input.max_drawdown},
      ${input.max_drawdown_percentage},
      ${input.sharpe_ratio || null},
      ${input.sortino_ratio || null},
      ${input.profit_factor || null},
      ${input.expectancy || null},
      ${input.avg_holding_period_hours || null}
    )
    RETURNING *
  `;
  return transformPerformanceMetric(result.rows[0]);
}

export async function getPerformanceMetricById(
  id: string
): Promise<PerformanceMetric | null> {
  const result = await sql`
    SELECT * FROM performance_metrics WHERE id = ${id}
  `;
  return result.rows[0] ? transformPerformanceMetric(result.rows[0]) : null;
}

export async function getPerformanceMetrics(
  filters?: PerformanceMetricFilters,
  pagination?: PaginationParams
): Promise<PaginatedResult<PerformanceMetric>> {
  const page = pagination?.page || 1;
  const limit = pagination?.limit || 20;
  const offset = (page - 1) * limit;
  const sortBy = pagination?.sortBy || 'period_end';
  const sortOrder = pagination?.sortOrder || 'desc';

  const conditions: string[] = ['1=1'];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters?.model_id) {
    conditions.push(`model_id = $${paramIndex++}`);
    values.push(filters.model_id);
  }
  if (filters?.start_date) {
    conditions.push(`period_start >= $${paramIndex++}`);
    values.push(filters.start_date);
  }
  if (filters?.end_date) {
    conditions.push(`period_end <= $${paramIndex++}`);
    values.push(filters.end_date);
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await sql.query(
    `SELECT COUNT(*) as count FROM performance_metrics WHERE ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const dataResult = await sql.query(
    `SELECT * FROM performance_metrics WHERE ${whereClause} 
     ORDER BY ${sortBy} ${sortOrder}
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...values, limit, offset]
  );

  return {
    data: dataResult.rows.map(transformPerformanceMetric),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getLatestPerformanceMetric(
  modelId: string
): Promise<PerformanceMetric | null> {
  const result = await sql`
    SELECT * FROM performance_metrics 
    WHERE model_id = ${modelId}
    ORDER BY period_end DESC
    LIMIT 1
  `;
  return result.rows[0] ? transformPerformanceMetric(result.rows[0]) : null;
}

export async function deletePerformanceMetric(id: string): Promise<boolean> {
  const result = await sql`
    DELETE FROM performance_metrics WHERE id = ${id}
  `;
  return result.rowCount > 0;
}

// ============================================================================
// Model Updates CRUD Operations
// ============================================================================

export async function createModelUpdate(
  input: CreateModelUpdateInput
): Promise<ModelUpdate> {
  const result = await sql`
    INSERT INTO model_updates (
      model_id, update_type, previous_version, new_version,
      changes_description, previous_hyperparameters, new_hyperparameters,
      previous_features, new_features, training_metrics,
      validation_metrics, triggered_by
    ) VALUES (
      ${input.model_id},
      ${input.update_type},
      ${input.previous_version || null},
      ${input.new_version},
      ${input.changes_description},
      ${input.previous_hyperparameters ? JSON.stringify(input.previous_hyperparameters) : null},
      ${input.new_hyperparameters ? JSON.stringify(input.new_hyperparameters) : null},
      ${input.previous_features ? JSON.stringify(input.previous_features) : null},
      ${input.new_features ? JSON.stringify(input.new_features) : null},
      ${input.training_metrics ? JSON.stringify(input.training_metrics) : null},
      ${input.validation_metrics ? JSON.stringify(input.validation_metrics) : null},
      ${input.triggered_by || null}
    )
    RETURNING *
  `;
  return transformModelUpdate(result.rows[0]);
}

export async function getModelUpdateById(
  id: string
): Promise<ModelUpdate | null> {
  const result = await sql`
    SELECT * FROM model_updates WHERE id = ${id}
  `;
  return result.rows[0] ? transformModelUpdate(result.rows[0]) : null;
}

export async function getModelUpdates(
  filters?: ModelUpdateFilters,
  pagination?: PaginationParams
): Promise<PaginatedResult<ModelUpdate>> {
  const page = pagination?.page || 1;
  const limit = pagination?.limit || 20;
  const offset = (page - 1) * limit;
  const sortBy = pagination?.sortBy || 'created_at';
  const sortOrder = pagination?.sortOrder || 'desc';

  const conditions: string[] = ['1=1'];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters?.model_id) {
    conditions.push(`model_id = $${paramIndex++}`);
    values.push(filters.model_id);
  }
  if (filters?.update_type) {
    conditions.push(`update_type = $${paramIndex++}`);
    values.push(filters.update_type);
  }
  if (filters?.start_date) {
    conditions.push(`created_at >= $${paramIndex++}`);
    values.push(filters.start_date);
  }
  if (filters?.end_date) {
    conditions.push(`created_at <= $${paramIndex++}`);
    values.push(filters.end_date);
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await sql.query(
    `SELECT COUNT(*) as count FROM model_updates WHERE ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const dataResult = await sql.query(
    `SELECT * FROM model_updates WHERE ${whereClause} 
     ORDER BY ${sortBy} ${sortOrder}
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...values, limit, offset]
  );

  return {
    data: dataResult.rows.map(transformModelUpdate),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getModelUpdateHistory(
  modelId: string
): Promise<ModelUpdate[]> {
  const result = await sql`
    SELECT * FROM model_updates 
    WHERE model_id = ${modelId}
    ORDER BY created_at DESC
  `;
  return result.rows.map(transformModelUpdate);
}

export async function deleteModelUpdate(id: string): Promise<boolean> {
  const result = await sql`
    DELETE FROM model_updates WHERE id = ${id}
  `;
  return result.rowCount > 0;
}

// ============================================================================
// Aggregate/Analytics Functions
// ============================================================================

export async function getModelPerformanceSummary(modelId: string) {
  const result = await sql`
    SELECT * FROM v_model_summary WHERE id = ${modelId}
  `;
  return result.rows[0] || null;
}

export async function getDailyPerformance(
  modelId: string,
  startDate?: Date,
  endDate?: Date
) {
  if (startDate && endDate) {
    const result = await sql`
      SELECT * FROM v_daily_trade_performance 
      WHERE model_id = ${modelId}
        AND trade_date >= ${startDate.toISOString()}
        AND trade_date <= ${endDate.toISOString()}
      ORDER BY trade_date DESC
    `;
    return result.rows;
  }

  const result = await sql`
    SELECT * FROM v_daily_trade_performance 
    WHERE model_id = ${modelId}
    ORDER BY trade_date DESC
    LIMIT 30
  `;
  return result.rows;
}

export async function calculatePerformanceMetrics(
  modelId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<CreatePerformanceMetricInput> {
  const trades = await sql`
    SELECT * FROM trades
    WHERE model_id = ${modelId}
      AND status = 'closed'
      AND exit_time >= ${periodStart.toISOString()}
      AND exit_time <= ${periodEnd.toISOString()}
  `;

  const closedTrades = trades.rows;
  const totalTrades = closedTrades.length;

  if (totalTrades === 0) {
    return {
      model_id: modelId,
      period_start: periodStart,
      period_end: periodEnd,
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      win_rate: 0,
      total_pnl: 0,
      total_pnl_percentage: 0,
      average_pnl: 0,
      average_win: 0,
      average_loss: 0,
      max_drawdown: 0,
      max_drawdown_percentage: 0,
    };
  }

  const winningTrades = closedTrades.filter((t) => parseFloat(t.pnl) > 0);
  const losingTrades = closedTrades.filter((t) => parseFloat(t.pnl) < 0);

  const totalPnl = closedTrades.reduce((sum, t) => sum + parseFloat(t.pnl || 0), 0);
  const totalPnlPercentage = closedTrades.reduce(
    (sum, t) => sum + parseFloat(t.pnl_percentage || 0),
    0
  );

  const avgWin =
    winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + parseFloat(t.pnl), 0) /
        winningTrades.length
      : 0;

  const avgLoss =
    losingTrades.length > 0
      ? Math.abs(
          losingTrades.reduce((sum, t) => sum + parseFloat(t.pnl), 0) /
            losingTrades.length
        )
      : 0;

  // Calculate max drawdown
  let peak = 0;
  let maxDrawdown = 0;
  let runningPnl = 0;

  for (const trade of closedTrades.sort(
    (a, b) => new Date(a.exit_time).getTime() - new Date(b.exit_time).getTime()
  )) {
    runningPnl += parseFloat(trade.pnl);
    if (runningPnl > peak) {
      peak = runningPnl;
    }
    const drawdown = peak - runningPnl;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  const grossProfit = winningTrades.reduce(
    (sum, t) => sum + parseFloat(t.pnl),
    0
  );
  const grossLoss = Math.abs(
    losingTrades.reduce((sum, t) => sum + parseFloat(t.pnl), 0)
  );
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;

  const winRate = winningTrades.length / totalTrades;
  const expectancy = avgWin * winRate - avgLoss * (1 - winRate);

  return {
    model_id: modelId,
    period_start: periodStart,
    period_end: periodEnd,
    total_trades: totalTrades,
    winning_trades: winningTrades.length,
    losing_trades: losingTrades.length,
    win_rate: winRate,
    total_pnl: totalPnl,
    total_pnl_percentage: totalPnlPercentage,
    average_pnl: totalPnl / totalTrades,
    average_win: avgWin,
    average_loss: avgLoss,
    max_drawdown: maxDrawdown,
    max_drawdown_percentage: peak > 0 ? (maxDrawdown / peak) * 100 : 0,
    profit_factor: profitFactor || undefined,
    expectancy,
  };
}

// ============================================================================
// Transform Functions (DB row -> TypeScript type)
// ============================================================================

function transformModel(row: Record<string, unknown>): Model {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string | null,
    version: row.version as string,
    status: row.status as Model['status'],
    algorithm: row.algorithm as string,
    hyperparameters: (row.hyperparameters as Record<string, unknown>) || {},
    features: (row.features as string[]) || [],
    target_asset: row.target_asset as string,
    training_start_date: row.training_start_date
      ? new Date(row.training_start_date as string)
      : null,
    training_end_date: row.training_end_date
      ? new Date(row.training_end_date as string)
      : null,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  };
}

function transformTrade(row: Record<string, unknown>): Trade {
  return {
    id: row.id as string,
    model_id: row.model_id as string,
    symbol: row.symbol as string,
    direction: row.direction as Trade['direction'],
    entry_price: parseFloat(row.entry_price as string),
    exit_price: row.exit_price ? parseFloat(row.exit_price as string) : null,
    quantity: parseFloat(row.quantity as string),
    entry_time: new Date(row.entry_time as string),
    exit_time: row.exit_time ? new Date(row.exit_time as string) : null,
    status: row.status as Trade['status'],
    pnl: row.pnl ? parseFloat(row.pnl as string) : null,
    pnl_percentage: row.pnl_percentage
      ? parseFloat(row.pnl_percentage as string)
      : null,
    fees: parseFloat(row.fees as string),
    slippage: row.slippage ? parseFloat(row.slippage as string) : null,
    signal_confidence: row.signal_confidence
      ? parseFloat(row.signal_confidence as string)
      : null,
    notes: row.notes as string | null,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  };
}

function transformPerformanceMetric(
  row: Record<string, unknown>
): PerformanceMetric {
  return {
    id: row.id as string,
    model_id: row.model_id as string,
    period_start: new Date(row.period_start as string),
    period_end: new Date(row.period_end as string),
    total_trades: row.total_trades as number,
    winning_trades: row.winning_trades as number,
    losing_trades: row.losing_trades as number,
    win_rate: parseFloat(row.win_rate as string),
    total_pnl: parseFloat(row.total_pnl as string),
    total_pnl_percentage: parseFloat(row.total_pnl_percentage as string),
    average_pnl: parseFloat(row.average_pnl as string),
    average_win: parseFloat(row.average_win as string),
    average_loss: parseFloat(row.average_loss as string),
    max_drawdown: parseFloat(row.max_drawdown as string),
    max_drawdown_percentage: parseFloat(row.max_drawdown_percentage as string),
    sharpe_ratio: row.sharpe_ratio
      ? parseFloat(row.sharpe_ratio as string)
      : null,
    sortino_ratio: row.sortino_ratio
      ? parseFloat(row.sortino_ratio as string)
      : null,
    profit_factor: row.profit_factor
      ? parseFloat(row.profit_factor as string)
      : null,
    expectancy: row.expectancy ? parseFloat(row.expectancy as string) : null,
    avg_holding_period_hours: row.avg_holding_period_hours
      ? parseFloat(row.avg_holding_period_hours as string)
      : null,
    created_at: new Date(row.created_at as string),
  };
}

function transformModelUpdate(row: Record<string, unknown>): ModelUpdate {
  return {
    id: row.id as string,
    model_id: row.model_id as string,
    update_type: row.update_type as ModelUpdate['update_type'],
    previous_version: row.previous_version as string | null,
    new_version: row.new_version as string,
    changes_description: row.changes_description as string,
    previous_hyperparameters:
      (row.previous_hyperparameters as Record<string, unknown>) || null,
    new_hyperparameters:
      (row.new_hyperparameters as Record<string, unknown>) || null,
    previous_features: (row.previous_features as string[]) || null,
    new_features: (row.new_features as string[]) || null,
    training_metrics:
      (row.training_metrics as Record<string, unknown>) || null,
    validation_metrics:
      (row.validation_metrics as Record<string, unknown>) || null,
    triggered_by: row.triggered_by as string | null,
    created_at: new Date(row.created_at as string),
  };
}

function transformExperiment(row: Record<string, unknown>): Experiment {
  return {
    id: row.id as string,
    name: row.name as string,
    model_type: row.model_type as string,
    status: row.status as ExperimentStatus,
    target_asset: row.target_asset as string,
    data_source: row.data_source as string,
    date_range_start: new Date(row.date_range_start as string),
    date_range_end: new Date(row.date_range_end as string),
    train_test_split: parseFloat(row.train_test_split as string),
    hyperparameters: (row.hyperparameters as Record<string, unknown>) || {},
    features: (row.features as string[]) || [],
    train_loss: row.train_loss ? parseFloat(row.train_loss as string) : null,
    train_accuracy: row.train_accuracy ? parseFloat(row.train_accuracy as string) : null,
    val_loss: row.val_loss ? parseFloat(row.val_loss as string) : null,
    val_accuracy: row.val_accuracy ? parseFloat(row.val_accuracy as string) : null,
    test_accuracy: row.test_accuracy ? parseFloat(row.test_accuracy as string) : null,
    test_precision: row.test_precision ? parseFloat(row.test_precision as string) : null,
    test_recall: row.test_recall ? parseFloat(row.test_recall as string) : null,
    test_f1: row.test_f1 ? parseFloat(row.test_f1 as string) : null,
    sharpe_ratio: row.sharpe_ratio ? parseFloat(row.sharpe_ratio as string) : null,
    max_drawdown: row.max_drawdown ? parseFloat(row.max_drawdown as string) : null,
    training_duration_seconds: row.training_duration_seconds as number | null,
    total_epochs: row.total_epochs as number | null,
    gpu_used: row.gpu_used as boolean,
    colab_session_id: row.colab_session_id as string | null,
    wandb_run_id: row.wandb_run_id as string | null,
    model_id: row.model_id as string | null,
    started_at: new Date(row.started_at as string),
    completed_at: row.completed_at ? new Date(row.completed_at as string) : null,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  };
}

function transformExperimentMetric(row: Record<string, unknown>): ExperimentMetric {
  return {
    id: row.id as string,
    experiment_id: row.experiment_id as string,
    epoch: row.epoch as number,
    train_loss: parseFloat(row.train_loss as string),
    train_accuracy: row.train_accuracy ? parseFloat(row.train_accuracy as string) : null,
    val_loss: row.val_loss ? parseFloat(row.val_loss as string) : null,
    val_accuracy: row.val_accuracy ? parseFloat(row.val_accuracy as string) : null,
    learning_rate: row.learning_rate ? parseFloat(row.learning_rate as string) : null,
    gpu_memory_used_mb: row.gpu_memory_used_mb as number | null,
    training_time_seconds: row.training_time_seconds ? parseFloat(row.training_time_seconds as string) : null,
    timestamp: new Date(row.timestamp as string),
    created_at: new Date(row.created_at as string),
  };
}

// ============================================================================
// Experiment CRUD Operations
// ============================================================================

export async function createExperiment(input: CreateExperimentInput): Promise<Experiment> {
  const result = await sql`
    INSERT INTO experiments (
      name, model_type, target_asset, data_source,
      date_range_start, date_range_end, train_test_split,
      hyperparameters, features, gpu_used, colab_session_id, wandb_run_id
    ) VALUES (
      ${input.name},
      ${input.model_type},
      ${input.target_asset},
      ${input.data_source},
      ${new Date(input.date_range_start).toISOString()},
      ${new Date(input.date_range_end).toISOString()},
      ${input.train_test_split},
      ${JSON.stringify(input.hyperparameters || {})},
      ${JSON.stringify(input.features || [])},
      ${input.gpu_used || false},
      ${input.colab_session_id || null},
      ${input.wandb_run_id || null}
    )
    RETURNING *
  `;
  return transformExperiment(result.rows[0]);
}

export async function getExperimentById(id: string): Promise<Experiment | null> {
  const result = await sql`
    SELECT * FROM experiments WHERE id = ${id}
  `;
  return result.rows[0] ? transformExperiment(result.rows[0]) : null;
}

export async function getExperiments(
  filters?: ExperimentFilters,
  pagination?: PaginationParams
): Promise<PaginatedResult<Experiment>> {
  const page = pagination?.page || 1;
  const limit = pagination?.limit || 20;
  const offset = (page - 1) * limit;
  const sortBy = pagination?.sortBy || 'created_at';
  const sortOrder = pagination?.sortOrder || 'desc';

  const conditions: string[] = ['1=1'];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters?.status) {
    conditions.push(`status = $${paramIndex++}`);
    values.push(filters.status);
  }
  if (filters?.model_type) {
    conditions.push(`model_type = $${paramIndex++}`);
    values.push(filters.model_type);
  }
  if (filters?.target_asset) {
    conditions.push(`target_asset = $${paramIndex++}`);
    values.push(filters.target_asset);
  }
  if (filters?.data_source) {
    conditions.push(`data_source = $${paramIndex++}`);
    values.push(filters.data_source);
  }
  if (filters?.model_id) {
    conditions.push(`model_id = $${paramIndex++}`);
    values.push(filters.model_id);
  }
  if (filters?.start_date) {
    conditions.push(`started_at >= $${paramIndex++}`);
    values.push(filters.start_date);
  }
  if (filters?.end_date) {
    conditions.push(`started_at <= $${paramIndex++}`);
    values.push(filters.end_date);
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await sql.query(
    `SELECT COUNT(*) as count FROM experiments WHERE ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const dataResult = await sql.query(
    `SELECT * FROM experiments WHERE ${whereClause} 
     ORDER BY ${sortBy} ${sortOrder}
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...values, limit, offset]
  );

  return {
    data: dataResult.rows.map(transformExperiment),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function updateExperiment(
  id: string,
  input: UpdateExperimentInput
): Promise<Experiment | null> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (input.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(input.name);
  }
  if (input.status !== undefined) {
    updates.push(`status = $${paramIndex++}`);
    values.push(input.status);
  }
  if (input.train_loss !== undefined) {
    updates.push(`train_loss = $${paramIndex++}`);
    values.push(input.train_loss);
  }
  if (input.train_accuracy !== undefined) {
    updates.push(`train_accuracy = $${paramIndex++}`);
    values.push(input.train_accuracy);
  }
  if (input.val_loss !== undefined) {
    updates.push(`val_loss = $${paramIndex++}`);
    values.push(input.val_loss);
  }
  if (input.val_accuracy !== undefined) {
    updates.push(`val_accuracy = $${paramIndex++}`);
    values.push(input.val_accuracy);
  }
  if (input.test_accuracy !== undefined) {
    updates.push(`test_accuracy = $${paramIndex++}`);
    values.push(input.test_accuracy);
  }
  if (input.test_precision !== undefined) {
    updates.push(`test_precision = $${paramIndex++}`);
    values.push(input.test_precision);
  }
  if (input.test_recall !== undefined) {
    updates.push(`test_recall = $${paramIndex++}`);
    values.push(input.test_recall);
  }
  if (input.test_f1 !== undefined) {
    updates.push(`test_f1 = $${paramIndex++}`);
    values.push(input.test_f1);
  }
  if (input.sharpe_ratio !== undefined) {
    updates.push(`sharpe_ratio = $${paramIndex++}`);
    values.push(input.sharpe_ratio);
  }
  if (input.max_drawdown !== undefined) {
    updates.push(`max_drawdown = $${paramIndex++}`);
    values.push(input.max_drawdown);
  }
  if (input.training_duration_seconds !== undefined) {
    updates.push(`training_duration_seconds = $${paramIndex++}`);
    values.push(input.training_duration_seconds);
  }
  if (input.total_epochs !== undefined) {
    updates.push(`total_epochs = $${paramIndex++}`);
    values.push(input.total_epochs);
  }
  if (input.completed_at !== undefined) {
    updates.push(`completed_at = $${paramIndex++}`);
    values.push(new Date(input.completed_at).toISOString());
  }
  if (input.wandb_run_id !== undefined) {
    updates.push(`wandb_run_id = $${paramIndex++}`);
    values.push(input.wandb_run_id);
  }
  if (input.model_id !== undefined) {
    updates.push(`model_id = $${paramIndex++}`);
    values.push(input.model_id);
  }

  if (updates.length === 0) {
    return getExperimentById(id);
  }

  values.push(id);
  const result = await sql.query(
    `UPDATE experiments SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  return result.rows[0] ? transformExperiment(result.rows[0]) : null;
}

export async function deleteExperiment(id: string): Promise<boolean> {
  const result = await sql`
    DELETE FROM experiments WHERE id = ${id}
  `;
  return result.rowCount > 0;
}

// ============================================================================
// Experiment Metrics CRUD Operations
// ============================================================================

export async function createExperimentMetric(
  input: CreateExperimentMetricInput
): Promise<ExperimentMetric> {
  const result = await sql`
    INSERT INTO experiment_metrics (
      experiment_id, epoch, train_loss, train_accuracy,
      val_loss, val_accuracy, learning_rate,
      gpu_memory_used_mb, training_time_seconds
    ) VALUES (
      ${input.experiment_id},
      ${input.epoch},
      ${input.train_loss},
      ${input.train_accuracy || null},
      ${input.val_loss || null},
      ${input.val_accuracy || null},
      ${input.learning_rate || null},
      ${input.gpu_memory_used_mb || null},
      ${input.training_time_seconds || null}
    )
    ON CONFLICT (experiment_id, epoch) DO UPDATE SET
      train_loss = EXCLUDED.train_loss,
      train_accuracy = EXCLUDED.train_accuracy,
      val_loss = EXCLUDED.val_loss,
      val_accuracy = EXCLUDED.val_accuracy,
      learning_rate = EXCLUDED.learning_rate,
      gpu_memory_used_mb = EXCLUDED.gpu_memory_used_mb,
      training_time_seconds = EXCLUDED.training_time_seconds,
      timestamp = NOW()
    RETURNING *
  `;
  return transformExperimentMetric(result.rows[0]);
}

export async function createExperimentMetricsBatch(
  metrics: CreateExperimentMetricInput[]
): Promise<ExperimentMetric[]> {
  if (metrics.length === 0) {
    return [];
  }

  // Use transaction for batch insert
  return transaction(async (client) => {
    const results: ExperimentMetric[] = [];
    
    for (const metric of metrics) {
      const result = await client.sql`
        INSERT INTO experiment_metrics (
          experiment_id, epoch, train_loss, train_accuracy,
          val_loss, val_accuracy, learning_rate,
          gpu_memory_used_mb, training_time_seconds
        ) VALUES (
          ${metric.experiment_id},
          ${metric.epoch},
          ${metric.train_loss},
          ${metric.train_accuracy || null},
          ${metric.val_loss || null},
          ${metric.val_accuracy || null},
          ${metric.learning_rate || null},
          ${metric.gpu_memory_used_mb || null},
          ${metric.training_time_seconds || null}
        )
        ON CONFLICT (experiment_id, epoch) DO UPDATE SET
          train_loss = EXCLUDED.train_loss,
          train_accuracy = EXCLUDED.train_accuracy,
          val_loss = EXCLUDED.val_loss,
          val_accuracy = EXCLUDED.val_accuracy,
          learning_rate = EXCLUDED.learning_rate,
          gpu_memory_used_mb = EXCLUDED.gpu_memory_used_mb,
          training_time_seconds = EXCLUDED.training_time_seconds,
          timestamp = NOW()
        RETURNING *
      `;
      results.push(transformExperimentMetric(result.rows[0]));
    }
    
    return results;
  });
}

export async function getExperimentMetrics(
  experimentId: string
): Promise<ExperimentMetric[]> {
  const result = await sql`
    SELECT * FROM experiment_metrics
    WHERE experiment_id = ${experimentId}
    ORDER BY epoch ASC
  `;
  return result.rows.map(transformExperimentMetric);
}

export async function getExperimentMetricByEpoch(
  experimentId: string,
  epoch: number
): Promise<ExperimentMetric | null> {
  const result = await sql`
    SELECT * FROM experiment_metrics
    WHERE experiment_id = ${experimentId} AND epoch = ${epoch}
  `;
  return result.rows[0] ? transformExperimentMetric(result.rows[0]) : null;
}

export async function deleteExperimentMetrics(experimentId: string): Promise<boolean> {
  const result = await sql`
    DELETE FROM experiment_metrics WHERE experiment_id = ${experimentId}
  `;
  return result.rowCount > 0;
}

/**
 * Get experiment with all its metrics included
 */
export async function getExperimentWithMetrics(id: string): Promise<{
  experiment: Experiment;
  metrics: ExperimentMetric[];
} | null> {
  const experiment = await getExperimentById(id);
  if (!experiment) {
    return null;
  }
  
  const metrics = await getExperimentMetrics(id);
  
  return {
    experiment,
    metrics,
  };
}
