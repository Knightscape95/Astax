'use client';

import { useState, useEffect } from 'react';
import type { 
  ModelRanking, 
  ModelAllocation,
  ModelSelectionConfig,
  ModelSelectionStrategy,
  ModelGroupSignal,
} from '@/types/indian-market';

// ============================================================================
// Types
// ============================================================================

interface AdvancedModelSelectorProps {
  portfolioId: string;
}

interface ConfigForm {
  strategy: ModelSelectionStrategy;
  lookback_period_days: number;
  rebalance_frequency_days: number;
  min_models: number;
  max_models: number;
  min_confidence_threshold: number;
  max_correlation_threshold: number;
  use_ensemble_voting: boolean;
  ensemble_weight_method: 'equal' | 'performance' | 'sharpe' | 'inverse_volatility';
  risk_budget: number;
}

// ============================================================================
// Component
// ============================================================================

export default function AdvancedModelSelector({ portfolioId }: AdvancedModelSelectorProps) {
  const [rankings, setRankings] = useState<ModelRanking[]>([]);
  const [allocations, setAllocations] = useState<ModelAllocation[]>([]);
  const [config, setConfig] = useState<ModelSelectionConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'rankings' | 'allocations' | 'config' | 'signals'>('rankings');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configForm, setConfigForm] = useState<ConfigForm>({
    strategy: 'best_performer',
    lookback_period_days: 30,
    rebalance_frequency_days: 7,
    min_models: 1,
    max_models: 5,
    min_confidence_threshold: 0.6,
    max_correlation_threshold: 0.7,
    use_ensemble_voting: false,
    ensemble_weight_method: 'equal',
    risk_budget: 0.02,
  });
  const [ensembleSignal, setEnsembleSignal] = useState<ModelGroupSignal | null>(null);

  useEffect(() => {
    fetchData();
  }, [portfolioId]);

  const fetchData = async () => {
    try {
      const [rankingsRes, allocationsRes, configRes] = await Promise.all([
        fetch(`/api/paper-trading/model-selection?portfolio_id=${portfolioId}&action=rankings`),
        fetch(`/api/paper-trading/model-selection?portfolio_id=${portfolioId}&action=allocations`),
        fetch(`/api/paper-trading/model-selection?portfolio_id=${portfolioId}&action=config`),
      ]);

      const [rankingsData, allocationsData, configData] = await Promise.all([
        rankingsRes.json(),
        allocationsRes.json(),
        configRes.json(),
      ]);

      setRankings(rankingsData.rankings || []);
      setAllocations(allocationsData.allocations || []);
      setConfig(configData.config);

      if (configData.config) {
        setConfigForm({
          strategy: configData.config.strategy,
          lookback_period_days: configData.config.lookback_period_days,
          rebalance_frequency_days: configData.config.rebalance_frequency_days,
          min_models: configData.config.min_models,
          max_models: configData.config.max_models,
          min_confidence_threshold: configData.config.min_confidence_threshold,
          max_correlation_threshold: configData.config.max_correlation_threshold,
          use_ensemble_voting: configData.config.use_ensemble_voting,
          ensemble_weight_method: configData.config.ensemble_weight_method,
          risk_budget: configData.config.risk_budget,
        });
      }
    } catch (error) {
      console.error('Failed to fetch model selection data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveConfig = async () => {
    try {
      const res = await fetch('/api/paper-trading/model-selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'configure',
          portfolio_id: portfolioId,
          ...configForm,
        }),
      });

      if (res.ok) {
        setShowConfigModal(false);
        fetchData();
      }
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  };

  const autoSelect = async () => {
    try {
      const res = await fetch('/api/paper-trading/model-selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'auto_select',
          portfolio_id: portfolioId,
        }),
      });

      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('Failed to auto-select models:', error);
    }
  };

  const allocateModel = async (modelId: string, percentage: number) => {
    try {
      await fetch('/api/paper-trading/model-selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'allocate',
          portfolio_id: portfolioId,
          model_id: modelId,
          allocation_percentage: percentage,
        }),
      });
      fetchData();
    } catch (error) {
      console.error('Failed to allocate model:', error);
    }
  };

  const generateEnsembleSignal = async (symbol: string) => {
    // Mock signals from allocated models for demo
    const mockSignals = allocations.map(a => ({
      modelId: a.model_id,
      modelName: `Model ${a.model_id.slice(0, 8)}`,
      signal: ['buy', 'sell', 'hold'][Math.floor(Math.random() * 3)] as 'buy' | 'sell' | 'hold',
      confidence: 0.5 + Math.random() * 0.4,
    }));

    try {
      const res = await fetch('/api/paper-trading/model-selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ensemble_signal',
          portfolio_id: portfolioId,
          symbol,
          exchange: 'NSE',
          model_signals: mockSignals,
        }),
      });

      const data = await res.json();
      setEnsembleSignal(data.signal);
    } catch (error) {
      console.error('Failed to generate ensemble signal:', error);
    }
  };

  const getStrategyLabel = (strategy: ModelSelectionStrategy) => {
    switch (strategy) {
      case 'best_performer': return 'Best Performer';
      case 'ensemble': return 'Ensemble Voting';
      case 'rotation': return 'Rotation';
      case 'risk_parity': return 'Risk Parity';
      case 'momentum': return 'Momentum';
      case 'custom': return 'Custom Rules';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    if (score >= 40) return 'text-orange-400';
    return 'text-red-400';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Model Selection</h2>
          <p className="text-gray-400 text-sm">
            {config 
              ? `Strategy: ${getStrategyLabel(config.strategy)} • Max ${config.max_models} models`
              : 'Configure model selection strategy'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfigModal(true)}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Configure
          </button>
          <button
            onClick={autoSelect}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
          >
            Auto-Select Models
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
        {(['rankings', 'allocations', 'config', 'signals'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'rankings' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700">
          <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Model Rankings</h3>
            <span className="text-sm text-gray-400">
              Last {config?.lookback_period_days || 30} days performance
            </span>
          </div>
          
          {rankings.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              No models available for ranking
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                    <th className="px-6 py-3 font-medium">Rank</th>
                    <th className="px-6 py-3 font-medium">Model</th>
                    <th className="px-6 py-3 font-medium text-right">Score</th>
                    <th className="px-6 py-3 font-medium text-right">Win Rate</th>
                    <th className="px-6 py-3 font-medium text-right">PnL %</th>
                    <th className="px-6 py-3 font-medium text-right">Sharpe</th>
                    <th className="px-6 py-3 font-medium text-right">Max DD</th>
                    <th className="px-6 py-3 font-medium text-right">Confidence</th>
                    <th className="px-6 py-3 font-medium text-right">Trades</th>
                    <th className="px-6 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rankings.map((model) => (
                    <tr 
                      key={model.model_id} 
                      className={`border-b border-gray-700/50 hover:bg-gray-700/30 ${
                        model.is_selected ? 'bg-emerald-500/10' : ''
                      }`}
                    >
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${
                          model.rank === 1 ? 'bg-yellow-500/20 text-yellow-400' :
                          model.rank === 2 ? 'bg-gray-300/20 text-gray-300' :
                          model.rank === 3 ? 'bg-orange-500/20 text-orange-400' :
                          'bg-gray-700 text-gray-400'
                        }`}>
                          {model.rank}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{model.model_name}</span>
                          {model.is_selected && (
                            <span className="px-2 py-0.5 text-xs bg-emerald-500/20 text-emerald-400 rounded">
                              Selected
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={`px-6 py-4 text-right font-bold ${getScoreColor(model.score)}`}>
                        {model.score.toFixed(1)}
                      </td>
                      <td className="px-6 py-4 text-right text-white">
                        {model.win_rate.toFixed(1)}%
                      </td>
                      <td className={`px-6 py-4 text-right ${model.pnl_percentage >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {model.pnl_percentage >= 0 ? '+' : ''}{model.pnl_percentage.toFixed(2)}%
                      </td>
                      <td className="px-6 py-4 text-right text-white">
                        {model.sharpe_ratio?.toFixed(2) || 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-right text-red-400">
                        -{model.max_drawdown.toFixed(2)}%
                      </td>
                      <td className="px-6 py-4 text-right text-white">
                        {(model.avg_confidence * 100).toFixed(0)}%
                      </td>
                      <td className="px-6 py-4 text-right text-gray-400">
                        {model.trade_count}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => allocateModel(model.model_id, model.recommended_allocation || 20)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded transition-colors"
                        >
                          Add
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'allocations' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700">
          <div className="px-6 py-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold text-white">Current Allocations</h3>
          </div>
          
          {allocations.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              No models allocated yet. Use Auto-Select or add models from Rankings.
            </div>
          ) : (
            <div className="p-6">
              <div className="space-y-4">
                {allocations.map((allocation) => (
                  <div 
                    key={allocation.id}
                    className="flex items-center justify-between bg-gray-700/50 rounded-lg p-4"
                  >
                    <div>
                      <p className="font-medium text-white">Model {allocation.model_id.slice(0, 8)}...</p>
                      <p className="text-sm text-gray-400">
                        {allocation.is_active ? 'Active' : 'Inactive'} • 
                        Auto-rebalance: {allocation.auto_rebalance ? 'On' : 'Off'}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-2xl font-bold text-emerald-400">
                          {Number(allocation.allocation_percentage).toFixed(1)}%
                        </p>
                        <p className="text-xs text-gray-400">
                          Range: {Number(allocation.min_allocation)}% - {Number(allocation.max_allocation)}%
                        </p>
                      </div>
                      <div className="w-32 bg-gray-600 rounded-full h-2">
                        <div 
                          className="bg-emerald-500 h-2 rounded-full"
                          style={{ width: `${Number(allocation.allocation_percentage)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total Allocation */}
              <div className="mt-6 pt-4 border-t border-gray-700 flex items-center justify-between">
                <span className="text-gray-400">Total Allocation</span>
                <span className="text-xl font-bold text-white">
                  {allocations.reduce((sum, a) => sum + Number(a.allocation_percentage), 0).toFixed(1)}%
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'config' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Selection Configuration</h3>
          
          {config ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-gray-700/50 rounded-lg p-4">
                <p className="text-gray-400 text-sm">Strategy</p>
                <p className="text-white font-medium">{getStrategyLabel(config.strategy)}</p>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-4">
                <p className="text-gray-400 text-sm">Lookback Period</p>
                <p className="text-white font-medium">{config.lookback_period_days} days</p>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-4">
                <p className="text-gray-400 text-sm">Rebalance Frequency</p>
                <p className="text-white font-medium">{config.rebalance_frequency_days} days</p>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-4">
                <p className="text-gray-400 text-sm">Model Range</p>
                <p className="text-white font-medium">{config.min_models} - {config.max_models}</p>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-4">
                <p className="text-gray-400 text-sm">Min Confidence</p>
                <p className="text-white font-medium">{(Number(config.min_confidence_threshold) * 100).toFixed(0)}%</p>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-4">
                <p className="text-gray-400 text-sm">Max Correlation</p>
                <p className="text-white font-medium">{(Number(config.max_correlation_threshold) * 100).toFixed(0)}%</p>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-4">
                <p className="text-gray-400 text-sm">Ensemble Voting</p>
                <p className="text-white font-medium">{config.use_ensemble_voting ? 'Enabled' : 'Disabled'}</p>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-4">
                <p className="text-gray-400 text-sm">Weight Method</p>
                <p className="text-white font-medium capitalize">{config.ensemble_weight_method}</p>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-4">
                <p className="text-gray-400 text-sm">Risk Budget</p>
                <p className="text-white font-medium">{(Number(config.risk_budget) * 100).toFixed(1)}%</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-400 mb-4">No configuration set</p>
              <button
                onClick={() => setShowConfigModal(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
              >
                Configure Now
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'signals' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Ensemble Signal Generator</h3>
          
          <div className="flex gap-4 mb-6">
            <input
              type="text"
              placeholder="Enter symbol (e.g., RELIANCE)"
              className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  generateEnsembleSignal((e.target as HTMLInputElement).value.toUpperCase());
                }
              }}
            />
            <button
              onClick={() => {
                const input = document.querySelector('input[placeholder*="symbol"]') as HTMLInputElement;
                if (input?.value) generateEnsembleSignal(input.value.toUpperCase());
              }}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
            >
              Generate Signal
            </button>
          </div>

          {ensembleSignal && (
            <div className="space-y-4">
              <div className={`p-6 rounded-xl ${
                ensembleSignal.direction === 'buy' ? 'bg-green-500/20 border border-green-500/30' :
                ensembleSignal.direction === 'sell' ? 'bg-red-500/20 border border-red-500/30' :
                'bg-gray-700/50 border border-gray-600'
              }`}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-gray-400 text-sm">Consensus Signal</p>
                    <p className={`text-3xl font-bold ${
                      ensembleSignal.direction === 'buy' ? 'text-green-400' :
                      ensembleSignal.direction === 'sell' ? 'text-red-400' :
                      'text-gray-400'
                    }`}>
                      {ensembleSignal.direction.toUpperCase()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400 text-sm">Confidence</p>
                    <p className="text-2xl font-bold text-white">{ensembleSignal.confidence.toFixed(1)}%</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-400 text-sm">Consensus Strength</p>
                    <p className="text-white font-medium">{ensembleSignal.consensus_strength.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Actionable</p>
                    <p className={`font-medium ${ensembleSignal.is_actionable ? 'text-green-400' : 'text-yellow-400'}`}>
                      {ensembleSignal.is_actionable ? 'Yes' : 'No - Weak consensus'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-700/50 rounded-lg p-4">
                <p className="text-gray-400 text-sm mb-3">Participating Models ({ensembleSignal.participating_models.length})</p>
                <div className="space-y-2">
                  {ensembleSignal.participating_models.map((model, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-600 last:border-0">
                      <span className="text-white">{model.modelName}</span>
                      <div className="flex items-center gap-4">
                        <span className={`px-2 py-0.5 rounded text-sm ${
                          model.signal === 'buy' ? 'bg-green-500/20 text-green-400' :
                          model.signal === 'sell' ? 'bg-red-500/20 text-red-400' :
                          'bg-gray-600 text-gray-400'
                        }`}>
                          {model.signal.toUpperCase()}
                        </span>
                        <span className="text-gray-400 text-sm">{(model.confidence * 100).toFixed(0)}%</span>
                        <span className="text-gray-500 text-sm">Weight: {(model.weight * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Config Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Model Selection Configuration</h2>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Selection Strategy</label>
                <select
                  value={configForm.strategy}
                  onChange={(e) => setConfigForm({ ...configForm, strategy: e.target.value as ModelSelectionStrategy })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="best_performer">Best Performer - Top N models by score</option>
                  <option value="ensemble">Ensemble - Diverse models for voting</option>
                  <option value="rotation">Rotation - Switch to best recent performer</option>
                  <option value="risk_parity">Risk Parity - Equal risk contribution</option>
                  <option value="momentum">Momentum - Follow positive trend</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Lookback Period (days)</label>
                  <input
                    type="number"
                    value={configForm.lookback_period_days}
                    onChange={(e) => setConfigForm({ ...configForm, lookback_period_days: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Rebalance Frequency (days)</label>
                  <input
                    type="number"
                    value={configForm.rebalance_frequency_days}
                    onChange={(e) => setConfigForm({ ...configForm, rebalance_frequency_days: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Min Models</label>
                  <input
                    type="number"
                    min="1"
                    value={configForm.min_models}
                    onChange={(e) => setConfigForm({ ...configForm, min_models: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Max Models</label>
                  <input
                    type="number"
                    min="1"
                    value={configForm.max_models}
                    onChange={(e) => setConfigForm({ ...configForm, max_models: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Min Confidence Threshold</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={configForm.min_confidence_threshold}
                    onChange={(e) => setConfigForm({ ...configForm, min_confidence_threshold: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Max Correlation Threshold</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={configForm.max_correlation_threshold}
                    onChange={(e) => setConfigForm({ ...configForm, max_correlation_threshold: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="border-t border-gray-700 pt-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={configForm.use_ensemble_voting}
                    onChange={(e) => setConfigForm({ ...configForm, use_ensemble_voting: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-white">Enable Ensemble Voting</span>
                </label>
              </div>

              {configForm.use_ensemble_voting && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Weight Method</label>
                  <select
                    value={configForm.ensemble_weight_method}
                    onChange={(e) => setConfigForm({ ...configForm, ensemble_weight_method: e.target.value as ConfigForm['ensemble_weight_method'] })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="equal">Equal Weight</option>
                    <option value="performance">Performance Weighted</option>
                    <option value="sharpe">Sharpe Ratio Weighted</option>
                    <option value="inverse_volatility">Inverse Volatility</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Risk Budget (Max Drawdown %)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="0.5"
                  value={configForm.risk_budget}
                  onChange={(e) => setConfigForm({ ...configForm, risk_budget: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
                <p className="text-gray-500 text-xs mt-1">
                  Current: {(configForm.risk_budget * 100).toFixed(1)}% - Models with higher drawdown will be penalized
                </p>
              </div>

              <button
                onClick={saveConfig}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-colors"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
