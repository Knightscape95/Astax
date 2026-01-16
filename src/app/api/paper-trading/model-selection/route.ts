/**
 * Model Selection API Routes
 * 
 * Model ranking, selection strategies, and ensemble signal generation
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import {
  createModelSelectionConfig,
  getModelSelectionConfig,
  createModelAllocation,
  getModelAllocations,
  rankModels,
  selectModels,
  generateEnsembleSignal,
  checkRebalanceNeeded,
  autoSelectAndAllocate,
} from '@/lib/model-selector';
import { getPaperPortfolio } from '@/lib/paper-trading';
import type { ModelSelectionStrategy, Exchange } from '@/types/indian-market';

// ============================================================================
// GET - Get model rankings, allocations, or config
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get('portfolio_id');
    const action = searchParams.get('action') || 'rankings';

    if (!portfolioId) {
      return NextResponse.json({ error: 'portfolio_id required' }, { status: 400 });
    }

    // Verify portfolio ownership
    const portfolio = await getPaperPortfolio(portfolioId);
    if (!portfolio || portfolio.user_id !== session.user.email) {
      return NextResponse.json({ error: 'Portfolio not found or unauthorized' }, { status: 404 });
    }

    switch (action) {
      case 'rankings': {
        const lookbackDays = parseInt(searchParams.get('lookback') || '30', 10);
        const rankings = await rankModels(portfolioId, lookbackDays);
        return NextResponse.json({ rankings });
      }

      case 'allocations': {
        const allocations = await getModelAllocations(portfolioId);
        return NextResponse.json({ allocations });
      }

      case 'config': {
        const config = await getModelSelectionConfig(portfolioId);
        return NextResponse.json({ config });
      }

      case 'selected': {
        const strategy = searchParams.get('strategy') as ModelSelectionStrategy | undefined;
        const result = await selectModels(portfolioId, strategy);
        return NextResponse.json(result);
      }

      case 'rebalance_check': {
        const result = await checkRebalanceNeeded(portfolioId);
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in model selection GET:', error);
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 });
  }
}

// ============================================================================
// POST - Configure selection, allocate models, or generate signals
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, portfolio_id } = body;

    if (!portfolio_id) {
      return NextResponse.json({ error: 'portfolio_id required' }, { status: 400 });
    }

    // Verify portfolio ownership
    const portfolio = await getPaperPortfolio(portfolio_id);
    if (!portfolio || portfolio.user_id !== session.user.email) {
      return NextResponse.json({ error: 'Portfolio not found or unauthorized' }, { status: 404 });
    }

    switch (action) {
      case 'configure': {
        const config = await createModelSelectionConfig({
          portfolio_id,
          strategy: body.strategy || 'best_performer',
          lookback_period_days: body.lookback_period_days,
          rebalance_frequency_days: body.rebalance_frequency_days,
          min_models: body.min_models,
          max_models: body.max_models,
          min_confidence_threshold: body.min_confidence_threshold,
          max_correlation_threshold: body.max_correlation_threshold,
          use_ensemble_voting: body.use_ensemble_voting,
          ensemble_weight_method: body.ensemble_weight_method,
          rotation_metric: body.rotation_metric,
          momentum_lookback_days: body.momentum_lookback_days,
          risk_budget: body.risk_budget,
          custom_rules: body.custom_rules,
        });

        return NextResponse.json({
          config,
          message: `Model selection configured with ${config.strategy} strategy`,
        }, { status: 201 });
      }

      case 'allocate': {
        const { model_id, allocation_percentage, min_allocation, max_allocation, auto_rebalance } = body;

        if (!model_id || allocation_percentage === undefined) {
          return NextResponse.json(
            { error: 'model_id and allocation_percentage required' },
            { status: 400 }
          );
        }

        const allocation = await createModelAllocation({
          portfolio_id,
          model_id,
          allocation_percentage,
          min_allocation,
          max_allocation,
          auto_rebalance,
        });

        return NextResponse.json({
          allocation,
          message: `Model allocated ${allocation_percentage}% of portfolio`,
        }, { status: 201 });
      }

      case 'auto_select': {
        const result = await autoSelectAndAllocate(portfolio_id);
        return NextResponse.json({
          ...result,
          message: `Auto-selected ${result.selectedModels.length} models based on performance`,
        });
      }

      case 'ensemble_signal': {
        const { symbol, exchange, model_signals } = body;

        if (!symbol || !model_signals || !Array.isArray(model_signals)) {
          return NextResponse.json(
            { error: 'symbol and model_signals array required' },
            { status: 400 }
          );
        }

        const signal = await generateEnsembleSignal(
          portfolio_id,
          symbol,
          (exchange || 'NSE') as Exchange,
          model_signals
        );

        return NextResponse.json({
          signal,
          recommendation: signal.is_actionable 
            ? `${signal.direction.toUpperCase()} ${symbol} with ${signal.confidence.toFixed(1)}% confidence`
            : 'No actionable signal - consensus too weak',
        });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: configure, allocate, auto_select, ensemble_signal' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error in model selection POST:', error);
    const message = error instanceof Error ? error.message : 'Operation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
