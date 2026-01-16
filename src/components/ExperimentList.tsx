'use client';

/**
 * ExperimentList Component
 * 
 * Displays a list of training experiments with:
 * - Status indicators (running, completed, failed, cancelled)
 * - Filtering by status, model type, date range
 * - Sorting by date, accuracy, duration
 * - Pagination
 * - Click to view details
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { Experiment, ExperimentStatus, ExperimentModelType } from '@/types/database';

// ============================================================================
// Types
// ============================================================================

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ExperimentListProps {
  onExperimentSelect?: (experiment: Experiment) => void;
  onRefresh?: () => void;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  selectionMode?: boolean;
}

interface FilterState {
  status: ExperimentStatus | 'all';
  modelType: ExperimentModelType | string | 'all';
  startDate: string;
  endDate: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

// ============================================================================
// Constants
// ============================================================================

const STATUS_COLORS: Record<ExperimentStatus, { bg: string; text: string; dot: string }> = {
  running: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-800 dark:text-blue-300',
    dot: 'bg-blue-500 animate-pulse',
  },
  completed: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-800 dark:text-green-300',
    dot: 'bg-green-500',
  },
  failed: {
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-800 dark:text-red-300',
    dot: 'bg-red-500',
  },
  cancelled: {
    bg: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-800 dark:text-gray-300',
    dot: 'bg-gray-500',
  },
};

const STATUS_OPTIONS: { value: ExperimentStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Status' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const MODEL_TYPE_OPTIONS: { value: ExperimentModelType | 'all'; label: string }[] = [
  { value: 'all', label: 'All Models' },
  { value: 'LSTM', label: 'LSTM' },
  { value: 'XGBoost', label: 'XGBoost' },
  { value: 'Transformer', label: 'Transformer' },
  { value: 'DNN', label: 'DNN' },
  { value: 'RandomForest', label: 'Random Forest' },
  { value: 'RL', label: 'Reinforcement Learning' },
];

const SORT_OPTIONS = [
  { value: 'started_at', label: 'Start Date' },
  { value: 'test_accuracy', label: 'Accuracy' },
  { value: 'training_duration_seconds', label: 'Duration' },
  { value: 'name', label: 'Name' },
];

// ============================================================================
// Component
// ============================================================================

export default function ExperimentList({ 
  onExperimentSelect, 
  onRefresh,
  selectedIds = [],
  onSelectionChange,
  selectionMode = false,
}: ExperimentListProps) {
  // State
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    status: 'all',
    modelType: 'all',
    startDate: '',
    endDate: '',
    sortBy: 'started_at',
    sortOrder: 'desc',
  });
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch experiments
  const fetchExperiments = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
      });

      if (filters.status !== 'all') {
        params.append('status', filters.status);
      }
      if (filters.modelType !== 'all') {
        params.append('model_type', filters.modelType);
      }
      if (filters.startDate) {
        params.append('start_date', filters.startDate);
      }
      if (filters.endDate) {
        params.append('end_date', filters.endDate);
      }

      const response = await fetch(`/api/experiments?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch experiments');
      }

      const data = await response.json();
      setExperiments(data.data || []);
      setPagination(prev => ({
        ...prev,
        total: data.pagination?.total || 0,
        totalPages: data.pagination?.totalPages || 0,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load experiments');
    } finally {
      setIsLoading(false);
    }
  }, [pagination.page, pagination.limit, filters]);

  // Initial fetch and refresh
  useEffect(() => {
    fetchExperiments();
  }, [fetchExperiments]);

  // Filter change handlers
  const handleFilterChange = useCallback((
    key: keyof FilterState,
    value: string
  ) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  }, []);

  // Toggle selection
  const handleToggleSelection = useCallback((id: string) => {
    if (!onSelectionChange) return;
    
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(selectedId => selectedId !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  }, [selectedIds, onSelectionChange]);

  // Filter experiments by search query (client-side)
  const filteredExperiments = experiments.filter(experiment => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      experiment.name.toLowerCase().includes(query) ||
      experiment.model_type.toLowerCase().includes(query) ||
      experiment.target_asset.toLowerCase().includes(query)
    );
  });

  // Format date
  const formatDate = (date: Date | string): string => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Format duration
  const formatDuration = (seconds: number | null): string => {
    if (seconds === null) return '-';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  // Format percentage
  const formatPercent = (value: number | null): string => {
    if (value === null) return '-';
    return `${(value * 100).toFixed(2)}%`;
  };

  // Loading state
  if (isLoading && experiments.length === 0) {
    return (
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-8">
        <div className="flex items-center justify-center">
          <svg className="animate-spin h-8 w-8 text-emerald-400 mr-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-gray-400">Loading experiments...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700">
      {/* Header with search and filters */}
      <div className="p-4 border-b border-gray-700">
        {/* Search bar */}
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search experiments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 pl-10 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
            <svg className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Refresh button */}
          <button
            onClick={() => {
              fetchExperiments();
              onRefresh?.();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            <svg className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mt-4">
          {/* Status filter */}
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
          >
            {STATUS_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          {/* Model type filter */}
          <select
            value={filters.modelType}
            onChange={(e) => handleFilterChange('modelType', e.target.value)}
            className="px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
          >
            {MODEL_TYPE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          {/* Date range filters */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              className="px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
              placeholder="Start Date"
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              className="px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
              placeholder="End Date"
            />
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2 ml-auto">
            <select
              value={filters.sortBy}
              onChange={(e) => handleFilterChange('sortBy', e.target.value)}
              className="px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
            >
              {SORT_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button
              onClick={() => handleFilterChange('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
              className="p-2 bg-gray-700/50 border border-gray-600 rounded-lg text-gray-400 hover:text-white transition-colors"
              title={filters.sortOrder === 'asc' ? 'Sort Ascending' : 'Sort Descending'}
            >
              {filters.sortOrder === 'asc' ? (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 mx-4 mt-4 bg-red-900/30 border border-red-700 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Experiment list */}
      {filteredExperiments.length === 0 ? (
        <div className="p-8 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
          <p className="text-gray-400">No experiments found</p>
          <p className="text-gray-500 text-sm mt-1">Try adjusting your filters or run a new experiment from Colab</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700/30">
              <tr>
                {selectionMode && (
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-12">
                    Select
                  </th>
                )}
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Model</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Asset</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Accuracy</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Duration</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {filteredExperiments.map((experiment) => (
                <tr
                  key={experiment.id}
                  className={`hover:bg-gray-700/30 transition-colors cursor-pointer ${
                    selectedIds.includes(experiment.id) ? 'bg-emerald-900/20' : ''
                  }`}
                  onClick={() => selectionMode ? handleToggleSelection(experiment.id) : onExperimentSelect?.(experiment)}
                >
                  {selectionMode && (
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(experiment.id)}
                        onChange={() => handleToggleSelection(experiment.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-emerald-500 focus:ring-emerald-500"
                      />
                    </td>
                  )}
                  <td className="px-4 py-4">
                    <div className="flex flex-col">
                      <span className="text-white font-medium">{experiment.name}</span>
                      {experiment.wandb_run_id && (
                        <span className="text-xs text-gray-500 mt-0.5">
                          W&B: {experiment.wandb_run_id.slice(0, 8)}...
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[experiment.status].bg} ${STATUS_COLORS[experiment.status].text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[experiment.status].dot}`} />
                      {experiment.status.charAt(0).toUpperCase() + experiment.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="inline-flex items-center px-2 py-1 rounded bg-gray-700 text-gray-300 text-xs font-mono">
                      {experiment.model_type}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-gray-300 text-sm">{experiment.target_asset}</td>
                  <td className="px-4 py-4">
                    <span className={`text-sm font-medium ${
                      experiment.test_accuracy !== null && experiment.test_accuracy >= 0.6 
                        ? 'text-green-400' 
                        : experiment.test_accuracy !== null && experiment.test_accuracy >= 0.5 
                          ? 'text-yellow-400' 
                          : 'text-gray-400'
                    }`}>
                      {formatPercent(experiment.test_accuracy)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-gray-400 text-sm">
                    {formatDuration(experiment.training_duration_seconds)}
                  </td>
                  <td className="px-4 py-4 text-gray-400 text-sm">
                    {formatDate(experiment.started_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700">
          <p className="text-sm text-gray-400">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} experiments
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              disabled={pagination.page === 1}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
            >
              Previous
            </button>
            <span className="text-gray-400 text-sm">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              disabled={pagination.page >= pagination.totalPages}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
