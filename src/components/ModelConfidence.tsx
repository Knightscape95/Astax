'use client';

import { useMemo } from 'react';

export interface ModelConfidenceData {
  modelId: string;
  modelName: string;
  currentConfidence: number;
  avgConfidence: number;
  confidenceHistory: { timestamp: number; value: number }[];
  predictions: {
    total: number;
    correct: number;
    accuracy: number;
  };
  status: 'active' | 'inactive' | 'training';
}

export interface ModelConfidenceProps {
  models: ModelConfidenceData[];
  selectedModelId?: string;
  onModelSelect?: (modelId: string) => void;
  showSparkline?: boolean;
  isLoading?: boolean;
}

export function ModelConfidence({
  models,
  selectedModelId,
  onModelSelect,
  showSparkline = true,
  isLoading = false,
}: ModelConfidenceProps) {
  const sortedModels = useMemo(() => {
    return [...models].sort((a, b) => b.currentConfidence - a.currentConfidence);
  }, [models]);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return { text: 'text-green-400', bg: 'bg-green-500', bar: 'bg-green-500' };
    if (confidence >= 60) return { text: 'text-yellow-400', bg: 'bg-yellow-500', bar: 'bg-yellow-500' };
    if (confidence >= 40) return { text: 'text-orange-400', bg: 'bg-orange-500', bar: 'bg-orange-500' };
    return { text: 'text-red-400', bg: 'bg-red-500', bar: 'bg-red-500' };
  };

  const getStatusBadge = (status: ModelConfidenceData['status']) => {
    switch (status) {
      case 'active':
        return (
          <span className="flex items-center gap-1 text-xs text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Active
          </span>
        );
      case 'inactive':
        return (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
            Inactive
          </span>
        );
      case 'training':
        return (
          <span className="flex items-center gap-1 text-xs text-blue-400">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Training
          </span>
        );
    }
  };

  const renderSparkline = (history: { timestamp: number; value: number }[]) => {
    if (history.length < 2) return null;

    const min = Math.min(...history.map((h) => h.value));
    const max = Math.max(...history.map((h) => h.value));
    const range = max - min || 1;

    const points = history
      .slice(-20)
      .map((h, i, arr) => {
        const x = (i / (arr.length - 1)) * 100;
        const y = 100 - ((h.value - min) / range) * 100;
        return `${x},${y}`;
      })
      .join(' ');

    const lastValue = history[history.length - 1].value;
    const prevValue = history[history.length - 2]?.value ?? lastValue;
    const trend = lastValue >= prevValue ? 'text-green-400' : 'text-red-400';

    return (
      <svg
        className={`w-16 h-8 ${trend}`}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

  const getConfidenceTrend = (history: { timestamp: number; value: number }[]) => {
    if (history.length < 2) return { direction: 'stable', change: 0 };

    const recent = history.slice(-5);
    const first = recent[0].value;
    const last = recent[recent.length - 1].value;
    const change = last - first;

    if (Math.abs(change) < 1) return { direction: 'stable', change };
    return { direction: change > 0 ? 'up' : 'down', change };
  };

  // Overall confidence summary
  const overallStats = useMemo(() => {
    if (models.length === 0) return null;

    const activeModels = models.filter((m) => m.status === 'active');
    const avgConfidence =
      activeModels.reduce((sum, m) => sum + m.currentConfidence, 0) / activeModels.length || 0;
    const totalPredictions = models.reduce((sum, m) => sum + m.predictions.total, 0);
    const totalCorrect = models.reduce((sum, m) => sum + m.predictions.correct, 0);
    const overallAccuracy = totalPredictions > 0 ? (totalCorrect / totalPredictions) * 100 : 0;

    return {
      avgConfidence,
      totalPredictions,
      overallAccuracy,
      activeCount: activeModels.length,
      totalCount: models.length,
    };
  }, [models]);

  return (
    <div className="bg-gray-800 rounded-xl p-6 shadow-lg">
      <h3 className="text-lg font-semibold text-white mb-4">Model Confidence</h3>

      {/* Overall Summary */}
      {overallStats && !isLoading && (
        <div className="grid grid-cols-4 gap-3 mb-4 pb-4 border-b border-gray-700">
          <div className="text-center p-2 bg-gray-700/50 rounded-lg">
            <p className={`text-xl font-bold ${getConfidenceColor(overallStats.avgConfidence).text}`}>
              {overallStats.avgConfidence.toFixed(1)}%
            </p>
            <p className="text-xs text-gray-400">Avg Confidence</p>
          </div>
          <div className="text-center p-2 bg-gray-700/50 rounded-lg">
            <p className="text-xl font-bold text-white">
              {overallStats.activeCount}/{overallStats.totalCount}
            </p>
            <p className="text-xs text-gray-400">Active Models</p>
          </div>
          <div className="text-center p-2 bg-gray-700/50 rounded-lg">
            <p className="text-xl font-bold text-blue-400">
              {overallStats.totalPredictions.toLocaleString()}
            </p>
            <p className="text-xs text-gray-400">Predictions</p>
          </div>
          <div className="text-center p-2 bg-gray-700/50 rounded-lg">
            <p className={`text-xl font-bold ${getConfidenceColor(overallStats.overallAccuracy).text}`}>
              {overallStats.overallAccuracy.toFixed(1)}%
            </p>
            <p className="text-xs text-gray-400">Accuracy</p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="flex justify-between mb-2">
                  <div className="h-4 bg-gray-600 rounded w-1/3" />
                  <div className="h-4 bg-gray-600 rounded w-16" />
                </div>
                <div className="h-2 bg-gray-600 rounded w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : sortedModels.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <svg
            className="w-12 h-12 mb-3 opacity-50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <p className="text-sm">No models available</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
          {sortedModels.map((model) => {
            const colors = getConfidenceColor(model.currentConfidence);
            const trend = getConfidenceTrend(model.confidenceHistory);
            const isSelected = selectedModelId === model.modelId;

            return (
              <div
                key={model.modelId}
                onClick={() => onModelSelect?.(model.modelId)}
                className={`bg-gray-700/50 rounded-lg p-4 border transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-600/50 hover:bg-gray-700'
                } ${onModelSelect ? 'cursor-pointer' : ''}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-white">{model.modelName}</h4>
                      {getStatusBadge(model.status)}
                    </div>
                    <p className="text-xs text-gray-400">
                      {model.predictions.total.toLocaleString()} predictions •{' '}
                      {model.predictions.accuracy.toFixed(1)}% accurate
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {showSparkline && renderSparkline(model.confidenceHistory)}
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${colors.text}`}>
                        {model.currentConfidence.toFixed(0)}%
                      </p>
                      <p
                        className={`text-xs ${
                          trend.direction === 'up'
                            ? 'text-green-400'
                            : trend.direction === 'down'
                            ? 'text-red-400'
                            : 'text-gray-400'
                        }`}
                      >
                        {trend.direction === 'up' && '↑ '}
                        {trend.direction === 'down' && '↓ '}
                        {trend.change >= 0 ? '+' : ''}
                        {trend.change.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>

                {/* Confidence Bar */}
                <div className="relative">
                  <div className="h-2 bg-gray-600 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${colors.bar} transition-all duration-500 ease-out`}
                      style={{ width: `${model.currentConfidence}%` }}
                    />
                  </div>
                  {/* Threshold markers */}
                  <div className="absolute top-0 left-[40%] w-px h-2 bg-gray-400/50" />
                  <div className="absolute top-0 left-[60%] w-px h-2 bg-gray-400/50" />
                  <div className="absolute top-0 left-[80%] w-px h-2 bg-gray-400/50" />
                </div>

                {/* Confidence Thresholds Legend */}
                <div className="flex justify-between mt-1 text-[10px] text-gray-500">
                  <span>0%</span>
                  <span>40%</span>
                  <span>60%</span>
                  <span>80%</span>
                  <span>100%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-gray-700">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-green-500" />
          <span className="text-xs text-gray-400">High (80%+)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-yellow-500" />
          <span className="text-xs text-gray-400">Medium (60-79%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-orange-500" />
          <span className="text-xs text-gray-400">Low (40-59%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-500" />
          <span className="text-xs text-gray-400">Critical (&lt;40%)</span>
        </div>
      </div>
    </div>
  );
}

export default ModelConfidence;
