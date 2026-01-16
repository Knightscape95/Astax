'use client';

import { useState, useMemo } from 'react';
import type { TradeDirection } from '@/types/database';

export interface TradeSignal {
  id: string;
  modelId: string;
  modelName: string;
  symbol: string;
  direction: TradeDirection;
  confidence: number;
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  reasoning?: string;
  timestamp: number;
  status: 'pending' | 'executed' | 'expired' | 'cancelled';
  expiresAt?: number;
}

export interface TradeSignalsProps {
  signals: TradeSignal[];
  maxSignals?: number;
  showFilters?: boolean;
  onSignalClick?: (signal: TradeSignal) => void;
  isLoading?: boolean;
}

type FilterStatus = 'all' | 'pending' | 'executed' | 'expired' | 'cancelled';
type FilterDirection = 'all' | 'long' | 'short';

export function TradeSignals({
  signals,
  maxSignals = 10,
  showFilters = true,
  onSignalClick,
  isLoading = false,
}: TradeSignalsProps) {
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [directionFilter, setDirectionFilter] = useState<FilterDirection>('all');
  const [sortBy, setSortBy] = useState<'timestamp' | 'confidence'>('timestamp');

  const filteredSignals = useMemo(() => {
    let filtered = [...signals];

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((s) => s.status === statusFilter);
    }

    // Apply direction filter
    if (directionFilter !== 'all') {
      filtered = filtered.filter((s) => s.direction === directionFilter);
    }

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === 'timestamp') {
        return b.timestamp - a.timestamp;
      }
      return b.confidence - a.confidence;
    });

    // Limit results
    return filtered.slice(0, maxSignals);
  }, [signals, statusFilter, directionFilter, sortBy, maxSignals]);

  const getStatusColor = (status: TradeSignal['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'executed':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'expired':
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      case 'cancelled':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
    }
  };

  const getDirectionColor = (direction: TradeDirection) => {
    return direction === 'long'
      ? 'text-green-400 bg-green-500/20'
      : 'text-red-400 bg-red-500/20';
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-400';
    if (confidence >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getTimeRemaining = (expiresAt: number) => {
    const now = Date.now();
    const remaining = expiresAt - now;
    if (remaining <= 0) return 'Expired';
    const mins = Math.floor(remaining / 60000);
    const hours = Math.floor(mins / 60);
    if (hours > 0) return `${hours}h ${mins % 60}m left`;
    return `${mins}m left`;
  };

  return (
    <div className="bg-gray-800 rounded-xl p-6 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Trade Signals</h3>
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
          <span className="text-sm text-gray-400">Live</span>
        </div>
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-3 mb-4 pb-4 border-b border-gray-700">
          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
              className="bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600 focus:outline-none focus:border-blue-500"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="executed">Executed</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Direction Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Direction:</span>
            <select
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value as FilterDirection)}
              className="bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600 focus:outline-none focus:border-blue-500"
            >
              <option value="all">All</option>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'timestamp' | 'confidence')}
              className="bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600 focus:outline-none focus:border-blue-500"
            >
              <option value="timestamp">Latest</option>
              <option value="confidence">Confidence</option>
            </select>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="h-4 bg-gray-600 rounded w-1/3 mb-2" />
                <div className="h-3 bg-gray-600 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredSignals.length === 0 ? (
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
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          <p className="text-sm">No signals found</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
          {filteredSignals.map((signal) => (
            <div
              key={signal.id}
              onClick={() => onSignalClick?.(signal)}
              className={`bg-gray-700/50 rounded-lg p-4 border border-gray-600/50 transition-all hover:bg-gray-700 ${
                onSignalClick ? 'cursor-pointer' : ''
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 text-xs font-semibold rounded ${getDirectionColor(
                      signal.direction
                    )}`}
                  >
                    {signal.direction.toUpperCase()}
                  </span>
                  <span className="font-semibold text-white">{signal.symbol}</span>
                </div>
                <span
                  className={`px-2 py-0.5 text-xs rounded border ${getStatusColor(
                    signal.status
                  )}`}
                >
                  {signal.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <p className="text-xs text-gray-400">Entry Price</p>
                  <p className="text-sm font-medium text-white">
                    ${signal.entryPrice.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Confidence</p>
                  <p className={`text-sm font-medium ${getConfidenceColor(signal.confidence)}`}>
                    {signal.confidence.toFixed(1)}%
                  </p>
                </div>
                {signal.stopLoss && (
                  <div>
                    <p className="text-xs text-gray-400">Stop Loss</p>
                    <p className="text-sm font-medium text-red-400">
                      ${signal.stopLoss.toLocaleString()}
                    </p>
                  </div>
                )}
                {signal.takeProfit && (
                  <div>
                    <p className="text-xs text-gray-400">Take Profit</p>
                    <p className="text-sm font-medium text-green-400">
                      ${signal.takeProfit.toLocaleString()}
                    </p>
                  </div>
                )}
              </div>

              {signal.reasoning && (
                <p className="text-xs text-gray-400 mb-2 line-clamp-2">
                  {signal.reasoning}
                </p>
              )}

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{signal.modelName}</span>
                <div className="flex items-center gap-3">
                  {signal.expiresAt && signal.status === 'pending' && (
                    <span className="text-yellow-400">
                      {getTimeRemaining(signal.expiresAt)}
                    </span>
                  )}
                  <span>{formatTime(signal.timestamp)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary Stats */}
      {signals.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-gray-700">
          <div className="text-center">
            <p className="text-lg font-bold text-white">{signals.length}</p>
            <p className="text-xs text-gray-400">Total</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-yellow-400">
              {signals.filter((s) => s.status === 'pending').length}
            </p>
            <p className="text-xs text-gray-400">Pending</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-green-400">
              {signals.filter((s) => s.status === 'executed').length}
            </p>
            <p className="text-xs text-gray-400">Executed</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-gray-400">
              {signals.filter((s) => s.direction === 'long').length}/
              {signals.filter((s) => s.direction === 'short').length}
            </p>
            <p className="text-xs text-gray-400">Long/Short</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default TradeSignals;
