/**
 * Model Selection Service
 * 
 * Intelligent model selection, ensemble voting, and rotation strategies
 * for paper trading on Indian market
 */

import { sql } from './db';
import type {
  ModelAllocation,
  CreateModelAllocationInput,
  ModelSelectionConfig,
  CreateModelSelectionConfigInput,
  ModelRanking,
  ModelGroupSignal,
  ModelSelectionStrategy,
  Exchange,
} from '@/types/indian-market';
import type { Model, PerformanceMetric, Trade } from '@/types/database';

// ============================================================================
// Types
// ============================================================================

interface ModelPerformanceData {
  model: Model;
  metrics: PerformanceMetric | null;
  recentTrades: Trade[];
}

interface EnsembleSignal {
  symbol: string;
  direction: 'buy' | 'sell' | 'hold';
  confidence: number;
  modelSignals: {
    modelId: string;
    modelName: string;
    signal: 'buy' | 'sell' | 'hold';
    confidence: number;
  }[];
}

// ============================================================================
// Model Selection Configuration
// ============================================================================

export async function createModelSelectionConfig(
  input: CreateModelSelectionConfigInput
): Promise<ModelSelectionConfig> {
  const result = await sql`
    INSERT INTO model_selection_configs (
      portfolio_id, strategy, lookback_period_days, rebalance_frequency_days,
      min_models, max_models, min_confidence_threshold, max_correlation_threshold,
      use_ensemble_voting, ensemble_weight_method, rotation_metric,
      momentum_lookback_days, risk_budget, custom_rules
    ) VALUES (
      ${input.portfolio_id},
      ${input.strategy},
      ${input.lookback_period_days || 30},
      ${input.rebalance_frequency_days || 7},
      ${input.min_models || 1},
      ${input.max_models || 5},
      ${input.min_confidence_threshold || 0.6},
      ${input.max_correlation_threshold || 0.7},
      ${input.use_ensemble_voting || false},
      ${input.ensemble_weight_method || 'equal'},
      ${input.rotation_metric || 'sharpe'},
      ${input.momentum_lookback_days || 14},
      ${input.risk_budget || 0.02},
      ${JSON.stringify(input.custom_rules || {})}
    )
    ON CONFLICT (portfolio_id) DO UPDATE SET
      strategy = EXCLUDED.strategy,
      lookback_period_days = EXCLUDED.lookback_period_days,
      rebalance_frequency_days = EXCLUDED.rebalance_frequency_days,
      min_models = EXCLUDED.min_models,
      max_models = EXCLUDED.max_models,
      min_confidence_threshold = EXCLUDED.min_confidence_threshold,
      max_correlation_threshold = EXCLUDED.max_correlation_threshold,
      use_ensemble_voting = EXCLUDED.use_ensemble_voting,
      ensemble_weight_method = EXCLUDED.ensemble_weight_method,
      rotation_metric = EXCLUDED.rotation_metric,
      momentum_lookback_days = EXCLUDED.momentum_lookback_days,
      risk_budget = EXCLUDED.risk_budget,
      custom_rules = EXCLUDED.custom_rules,
      updated_at = NOW()
    RETURNING *
  `;
  return result.rows[0] as ModelSelectionConfig;
}

export async function getModelSelectionConfig(portfolioId: string): Promise<ModelSelectionConfig | null> {
  const result = await sql`
    SELECT * FROM model_selection_configs WHERE portfolio_id = ${portfolioId}
  `;
  return result.rows[0] as ModelSelectionConfig | null;
}

// ============================================================================
// Model Allocation CRUD
// ============================================================================

export async function createModelAllocation(
  input: CreateModelAllocationInput
): Promise<ModelAllocation> {
  const result = await sql`
    INSERT INTO model_allocations (
      portfolio_id, model_id, allocation_percentage, min_allocation,
      max_allocation, auto_rebalance, rebalance_threshold
    ) VALUES (
      ${input.portfolio_id},
      ${input.model_id},
      ${input.allocation_percentage},
      ${input.min_allocation || 0},
      ${input.max_allocation || 100},
      ${input.auto_rebalance || false},
      ${input.rebalance_threshold || 5}
    )
    ON CONFLICT (portfolio_id, model_id) DO UPDATE SET
      allocation_percentage = EXCLUDED.allocation_percentage,
      min_allocation = EXCLUDED.min_allocation,
      max_allocation = EXCLUDED.max_allocation,
      auto_rebalance = EXCLUDED.auto_rebalance,
      rebalance_threshold = EXCLUDED.rebalance_threshold,
      updated_at = NOW()
    RETURNING *
  `;
  return result.rows[0] as ModelAllocation;
}

export async function getModelAllocations(portfolioId: string): Promise<ModelAllocation[]> {
  const result = await sql`
    SELECT ma.*, m.name as model_name, m.algorithm, m.status
    FROM model_allocations ma
    JOIN models m ON ma.model_id = m.id
    WHERE ma.portfolio_id = ${portfolioId}
    AND ma.is_active = true
    ORDER BY ma.allocation_percentage DESC
  `;
  return result.rows as ModelAllocation[];
}

export async function updateModelAllocation(
  id: string,
  updates: Partial<ModelAllocation>
): Promise<ModelAllocation> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.allocation_percentage !== undefined) {
    setClauses.push(`allocation_percentage = $${paramIndex++}`);
    values.push(updates.allocation_percentage);
  }
  if (updates.is_active !== undefined) {
    setClauses.push(`is_active = $${paramIndex++}`);
    values.push(updates.is_active);
  }
  if (updates.performance_score !== undefined) {
    setClauses.push(`performance_score = $${paramIndex++}`);
    values.push(updates.performance_score);
  }
  if (updates.risk_score !== undefined) {
    setClauses.push(`risk_score = $${paramIndex++}`);
    values.push(updates.risk_score);
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  const result = await sql.query(
    `UPDATE model_allocations SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return result.rows[0] as ModelAllocation;
}

// ============================================================================
// Model Ranking & Selection
// ============================================================================

export async function rankModels(
  portfolioId: string,
  lookbackDays: number = 30
): Promise<ModelRanking[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - lookbackDays);

  // Get all active models with their performance
  const result = await sql`
    WITH model_stats AS (
      SELECT 
        m.id as model_id,
        m.name as model_name,
        COUNT(t.id) as trade_count,
        COALESCE(SUM(t.pnl), 0) as total_pnl,
        COALESCE(AVG(t.pnl_percentage), 0) as avg_pnl_percentage,
        COALESCE(AVG(t.signal_confidence), 0) as avg_confidence,
        COALESCE(SUM(CASE WHEN t.pnl > 0 THEN 1 ELSE 0 END)::float / NULLIF(COUNT(t.id), 0) * 100, 0) as win_rate,
        pm.sharpe_ratio,
        pm.sortino_ratio,
        pm.max_drawdown_percentage
      FROM models m
      LEFT JOIN trades t ON m.id = t.model_id 
        AND t.status = 'closed' 
        AND t.exit_time >= ${startDate.toISOString()}
      LEFT JOIN performance_metrics pm ON m.id = pm.model_id
        AND pm.period_start >= ${startDate.toISOString()}
      WHERE m.status = 'active'
      GROUP BY m.id, m.name, pm.sharpe_ratio, pm.sortino_ratio, pm.max_drawdown_percentage
    )
    SELECT * FROM model_stats
    ORDER BY 
      CASE WHEN sharpe_ratio IS NOT NULL THEN sharpe_ratio ELSE 0 END DESC,
      total_pnl DESC,
      win_rate DESC
  `;

  const models = result.rows;
  const rankings: ModelRanking[] = [];

  // Calculate scores and rankings
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    
    // Composite score calculation
    const pnlScore = normalizeScore(Number(model.total_pnl), models.map(m => Number(m.total_pnl)));
    const winRateScore = Number(model.win_rate) / 100;
    const sharpeScore = model.sharpe_ratio ? normalizeScore(Number(model.sharpe_ratio), models.map(m => Number(m.sharpe_ratio || 0))) : 0.5;
    const confidenceScore = Number(model.avg_confidence);
    
    // Weighted score
    const score = (
      pnlScore * 0.3 +
      winRateScore * 0.25 +
      sharpeScore * 0.25 +
      confidenceScore * 0.2
    );

    rankings.push({
      model_id: model.model_id,
      model_name: model.model_name,
      rank: i + 1,
      score: Math.round(score * 10000) / 100, // Score out of 100
      total_pnl: Number(model.total_pnl),
      pnl_percentage: Number(model.avg_pnl_percentage),
      win_rate: Number(model.win_rate),
      sharpe_ratio: model.sharpe_ratio ? Number(model.sharpe_ratio) : null,
      sortino_ratio: model.sortino_ratio ? Number(model.sortino_ratio) : null,
      max_drawdown: Number(model.max_drawdown_percentage || 0),
      avg_confidence: Number(model.avg_confidence),
      trade_count: Number(model.trade_count),
      correlation_with_top: null, // Calculated separately if needed
      is_selected: false,
      recommended_allocation: 0,
    });
  }

  return rankings;
}

function normalizeScore(value: number, allValues: number[]): number {
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  if (max === min) return 0.5;
  return (value - min) / (max - min);
}

// ============================================================================
// Model Selection Strategies
// ============================================================================

export async function selectModels(
  portfolioId: string,
  strategy?: ModelSelectionStrategy
): Promise<{ rankings: ModelRanking[]; selectedModels: string[] }> {
  const config = await getModelSelectionConfig(portfolioId);
  const actualStrategy = strategy || config?.strategy || 'best_performer';
  const lookbackDays = config?.lookback_period_days || 30;

  const rankings = await rankModels(portfolioId, lookbackDays);
  let selectedModels: string[] = [];

  switch (actualStrategy) {
    case 'best_performer':
      selectedModels = selectBestPerformers(rankings, config);
      break;
    case 'ensemble':
      selectedModels = selectEnsemble(rankings, config);
      break;
    case 'rotation':
      selectedModels = selectRotation(rankings, config);
      break;
    case 'risk_parity':
      selectedModels = selectRiskParity(rankings, config);
      break;
    case 'momentum':
      selectedModels = selectMomentum(rankings, config);
      break;
    default:
      selectedModels = selectBestPerformers(rankings, config);
  }

  // Mark selected models and calculate allocations
  const totalScore = selectedModels.reduce((sum, id) => {
    const model = rankings.find(r => r.model_id === id);
    return sum + (model?.score || 0);
  }, 0);

  rankings.forEach(r => {
    r.is_selected = selectedModels.includes(r.model_id);
    if (r.is_selected) {
      r.recommended_allocation = Math.round((r.score / totalScore) * 100 * 100) / 100;
    }
  });

  return { rankings, selectedModels };
}

function selectBestPerformers(
  rankings: ModelRanking[],
  config: ModelSelectionConfig | null
): string[] {
  const maxModels = config?.max_models || 3;
  const minConfidence = config?.min_confidence_threshold || 0.6;

  return rankings
    .filter(r => r.avg_confidence >= minConfidence && r.trade_count >= 5)
    .slice(0, maxModels)
    .map(r => r.model_id);
}

function selectEnsemble(
  rankings: ModelRanking[],
  config: ModelSelectionConfig | null
): string[] {
  const maxModels = config?.max_models || 5;
  const minModels = config?.min_models || 3;
  const maxCorrelation = config?.max_correlation_threshold || 0.7;

  // Select diverse models with low correlation
  const selected: string[] = [];
  const sortedByScore = [...rankings].sort((a, b) => b.score - a.score);

  for (const model of sortedByScore) {
    if (selected.length >= maxModels) break;
    
    // For simplicity, we select models with different characteristics
    // In production, we'd calculate actual correlation
    const isDiverse = selected.length === 0 || 
      Math.random() > maxCorrelation; // Simplified diversity check

    if (isDiverse && model.trade_count >= 3) {
      selected.push(model.model_id);
    }
  }

  // Ensure minimum models
  while (selected.length < minModels && selected.length < rankings.length) {
    const nextModel = sortedByScore.find(r => !selected.includes(r.model_id));
    if (nextModel) selected.push(nextModel.model_id);
    else break;
  }

  return selected;
}

function selectRotation(
  rankings: ModelRanking[],
  config: ModelSelectionConfig | null
): string[] {
  const metric = config?.rotation_metric || 'sharpe';
  const maxModels = config?.max_models || 2;

  // Sort by rotation metric
  let sorted: ModelRanking[];
  switch (metric) {
    case 'returns':
      sorted = [...rankings].sort((a, b) => b.pnl_percentage - a.pnl_percentage);
      break;
    case 'sharpe':
      sorted = [...rankings].sort((a, b) => (b.sharpe_ratio || 0) - (a.sharpe_ratio || 0));
      break;
    case 'sortino':
      sorted = [...rankings].sort((a, b) => (b.sortino_ratio || 0) - (a.sortino_ratio || 0));
      break;
    case 'calmar':
      sorted = [...rankings].sort((a, b) => {
        const calmarA = a.max_drawdown ? a.pnl_percentage / a.max_drawdown : 0;
        const calmarB = b.max_drawdown ? b.pnl_percentage / b.max_drawdown : 0;
        return calmarB - calmarA;
      });
      break;
    default:
      sorted = rankings;
  }

  return sorted.slice(0, maxModels).map(r => r.model_id);
}

function selectRiskParity(
  rankings: ModelRanking[],
  config: ModelSelectionConfig | null
): string[] {
  const maxModels = config?.max_models || 4;
  const riskBudget = config?.risk_budget || 0.02;

  // Select models with manageable drawdowns
  const lowRiskModels = rankings
    .filter(r => r.max_drawdown < riskBudget * 100 || r.max_drawdown === 0)
    .sort((a, b) => b.score - a.score);

  // If not enough low-risk models, include others
  const selected = lowRiskModels.slice(0, maxModels).map(r => r.model_id);
  
  if (selected.length < 2) {
    const remaining = rankings
      .filter(r => !selected.includes(r.model_id))
      .sort((a, b) => a.max_drawdown - b.max_drawdown)
      .slice(0, maxModels - selected.length);
    selected.push(...remaining.map(r => r.model_id));
  }

  return selected;
}

function selectMomentum(
  rankings: ModelRanking[],
  config: ModelSelectionConfig | null
): string[] {
  const maxModels = config?.max_models || 3;

  // Select models with positive recent performance
  const momentumModels = rankings
    .filter(r => r.pnl_percentage > 0 && r.win_rate > 50)
    .sort((a, b) => b.pnl_percentage - a.pnl_percentage);

  return momentumModels.slice(0, maxModels).map(r => r.model_id);
}

// ============================================================================
// Ensemble Signal Generation
// ============================================================================

export async function generateEnsembleSignal(
  portfolioId: string,
  symbol: string,
  exchange: Exchange,
  modelSignals: {
    modelId: string;
    modelName: string;
    signal: 'buy' | 'sell' | 'hold';
    confidence: number;
  }[]
): Promise<ModelGroupSignal> {
  const config = await getModelSelectionConfig(portfolioId);
  const allocations = await getModelAllocations(portfolioId);

  // Get weights based on configuration
  const weightMethod = config?.ensemble_weight_method || 'equal';
  
  let weightedSignals: {
    modelId: string;
    modelName: string;
    signal: 'buy' | 'sell' | 'hold';
    confidence: number;
    weight: number;
  }[] = [];

  const totalAllocation = allocations.reduce((sum, a) => sum + Number(a.allocation_percentage), 0);

  for (const signal of modelSignals) {
    const allocation = allocations.find(a => a.model_id === signal.modelId);
    let weight: number;

    switch (weightMethod) {
      case 'performance':
        weight = allocation?.performance_score || 1;
        break;
      case 'sharpe':
        // Would need to fetch sharpe ratios
        weight = allocation?.performance_score || 1;
        break;
      case 'inverse_volatility':
        // Would need to calculate volatility
        weight = 1 / (allocation?.risk_score || 1);
        break;
      case 'equal':
      default:
        weight = 1 / modelSignals.length;
    }

    weightedSignals.push({
      ...signal,
      weight: allocation ? Number(allocation.allocation_percentage) / totalAllocation : weight,
    });
  }

  // Normalize weights
  const totalWeight = weightedSignals.reduce((sum, s) => sum + s.weight, 0);
  weightedSignals = weightedSignals.map(s => ({
    ...s,
    weight: s.weight / totalWeight,
  }));

  // Calculate consensus
  let buyScore = 0;
  let sellScore = 0;
  let holdScore = 0;

  for (const signal of weightedSignals) {
    const weightedConfidence = signal.confidence * signal.weight;
    switch (signal.signal) {
      case 'buy':
        buyScore += weightedConfidence;
        break;
      case 'sell':
        sellScore += weightedConfidence;
        break;
      case 'hold':
        holdScore += weightedConfidence;
        break;
    }
  }

  // Determine consensus direction
  let direction: 'buy' | 'sell' | 'hold';
  let confidence: number;
  
  if (buyScore > sellScore && buyScore > holdScore) {
    direction = 'buy';
    confidence = buyScore;
  } else if (sellScore > buyScore && sellScore > holdScore) {
    direction = 'sell';
    confidence = sellScore;
  } else {
    direction = 'hold';
    confidence = holdScore;
  }

  // Calculate consensus strength (how much agreement between models)
  const maxScore = Math.max(buyScore, sellScore, holdScore);
  const totalScore = buyScore + sellScore + holdScore;
  const consensusStrength = (maxScore / totalScore) * 100;

  // Determine if signal is actionable
  const minConfidence = config?.min_confidence_threshold || 0.6;
  const isActionable = confidence >= minConfidence && consensusStrength >= 60;

  return {
    timestamp: new Date(),
    symbol,
    exchange,
    direction,
    confidence: Math.round(confidence * 100) / 100,
    participating_models: weightedSignals,
    consensus_strength: Math.round(consensusStrength * 100) / 100,
    is_actionable: isActionable,
  };
}

// ============================================================================
// Auto-Rebalance
// ============================================================================

export async function checkRebalanceNeeded(
  portfolioId: string
): Promise<{ needsRebalance: boolean; deviations: { modelId: string; current: number; target: number; deviation: number }[] }> {
  const config = await getModelSelectionConfig(portfolioId);
  if (!config?.use_ensemble_voting) {
    return { needsRebalance: false, deviations: [] };
  }

  const allocations = await getModelAllocations(portfolioId);
  const threshold = config.rebalance_threshold || 5;
  
  // Get current actual allocations from portfolio holdings
  // This would need to be implemented based on actual trade values
  // For now, we simulate with random deviations
  
  const deviations: { modelId: string; current: number; target: number; deviation: number }[] = [];
  let needsRebalance = false;

  for (const allocation of allocations) {
    const target = Number(allocation.allocation_percentage);
    // Simulated current allocation (would come from actual holdings)
    const current = target + (Math.random() - 0.5) * 10;
    const deviation = Math.abs(current - target);

    deviations.push({
      modelId: allocation.model_id,
      current: Math.round(current * 100) / 100,
      target,
      deviation: Math.round(deviation * 100) / 100,
    });

    if (deviation > threshold) {
      needsRebalance = true;
    }
  }

  return { needsRebalance, deviations };
}

export async function autoSelectAndAllocate(portfolioId: string): Promise<{
  selectedModels: ModelRanking[];
  allocations: ModelAllocation[];
}> {
  const { rankings, selectedModels } = await selectModels(portfolioId);
  const selectedRankings = rankings.filter(r => r.is_selected);

  // Create/update allocations for selected models
  const allocations: ModelAllocation[] = [];
  
  for (const ranking of selectedRankings) {
    const allocation = await createModelAllocation({
      portfolio_id: portfolioId,
      model_id: ranking.model_id,
      allocation_percentage: ranking.recommended_allocation,
      auto_rebalance: true,
    });
    allocations.push(allocation);
  }

  // Deactivate non-selected models
  const config = await getModelSelectionConfig(portfolioId);
  if (config) {
    await sql`
      UPDATE model_allocations 
      SET is_active = false 
      WHERE portfolio_id = ${portfolioId}
      AND model_id NOT IN (${sql.array(selectedModels, 'uuid')})
    `;
  }

  return { selectedModels: selectedRankings, allocations };
}

// ============================================================================
// Export Service
// ============================================================================

export const modelSelectorService = {
  createModelSelectionConfig,
  getModelSelectionConfig,
  createModelAllocation,
  getModelAllocations,
  updateModelAllocation,
  rankModels,
  selectModels,
  generateEnsembleSignal,
  checkRebalanceNeeded,
  autoSelectAndAllocate,
};

export default modelSelectorService;
