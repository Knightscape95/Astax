'use client';

/**
 * Experiments Page
 * 
 * Main dashboard page for viewing, analyzing, and comparing training experiments.
 * Features:
 * - Experiment list with filtering and sorting
 * - Detail view for individual experiments
 * - Comparison view for multiple experiments
 * - Deploy as model functionality
 */

import { useState, useCallback } from 'react';
import ExperimentList from '@/components/ExperimentList';
import ExperimentDetail from '@/components/ExperimentDetail';
import ExperimentComparison from '@/components/ExperimentComparison';
import type { Experiment } from '@/types/database';

// ============================================================================
// Types
// ============================================================================

type ViewMode = 'list' | 'detail' | 'compare';

// ============================================================================
// Component
// ============================================================================

export default function ExperimentsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedExperiment, setSelectedExperiment] = useState<Experiment | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [deploySuccess, setDeploySuccess] = useState<string | null>(null);

  // Handle experiment selection from list
  const handleExperimentSelect = useCallback((experiment: Experiment) => {
    if (comparisonMode) {
      // In comparison mode, toggle selection
      setSelectedIds(prev =>
        prev.includes(experiment.id)
          ? prev.filter(id => id !== experiment.id)
          : [...prev, experiment.id]
      );
    } else {
      // Normal mode, open detail view
      setSelectedExperiment(experiment);
      setViewMode('detail');
    }
  }, [comparisonMode]);

  // Handle close detail view
  const handleCloseDetail = useCallback(() => {
    setSelectedExperiment(null);
    setViewMode('list');
  }, []);

  // Handle close comparison view
  const handleCloseComparison = useCallback(() => {
    setViewMode('list');
    setComparisonMode(false);
    setSelectedIds([]);
  }, []);

  // Toggle comparison mode
  const handleToggleComparisonMode = useCallback(() => {
    if (comparisonMode) {
      // Exit comparison mode
      setComparisonMode(false);
      setSelectedIds([]);
    } else {
      // Enter comparison mode
      setComparisonMode(true);
      setSelectedIds([]);
    }
  }, [comparisonMode]);

  // Start comparison
  const handleStartComparison = useCallback(() => {
    if (selectedIds.length >= 2) {
      setViewMode('compare');
    }
  }, [selectedIds]);

  // Handle deploy as model
  const handleDeploy = useCallback(async (experiment: Experiment) => {
    // Navigate to model upload with experiment data pre-filled
    // For now, we'll simulate success and show the model upload page
    try {
      // Create model from experiment via API
      const response = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${experiment.name} - Deployed`,
          description: `Model deployed from experiment: ${experiment.name}`,
          version: '1.0.0',
          status: 'inactive',
          algorithm: experiment.model_type,
          hyperparameters: experiment.hyperparameters,
          features: experiment.features,
          target_asset: experiment.target_asset,
          training_start_date: experiment.date_range_start,
          training_end_date: experiment.date_range_end,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create model');
      }

      const data = await response.json();

      // Update experiment with model_id
      await fetch(`/api/experiments/${experiment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: data.model.id }),
      });

      setDeploySuccess(`Successfully deployed "${experiment.name}" as a model!`);
      setRefreshKey(prev => prev + 1);

      // Clear success message after 5 seconds
      setTimeout(() => setDeploySuccess(null), 5000);
    } catch (err) {
      console.error('Failed to deploy model:', err);
      alert('Failed to deploy model. Please try again.');
    }
  }, []);

  return (
    <div>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Experiments</h1>
          <p className="text-gray-400 text-sm mt-1">
            View, analyze, and compare ML training experiments from Colab
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {viewMode === 'list' && (
            <>
              <button
                onClick={handleToggleComparisonMode}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  comparisonMode
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                {comparisonMode ? 'Cancel Compare' : 'Compare'}
              </button>

              {comparisonMode && selectedIds.length >= 2 && (
                <button
                  onClick={handleStartComparison}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  Compare {selectedIds.length} Experiments
                </button>
              )}
            </>
          )}

          {viewMode !== 'list' && (
            <button
              onClick={viewMode === 'compare' ? handleCloseComparison : handleCloseDetail}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to List
            </button>
          )}
        </div>
      </div>

      {/* Success Alert */}
      {deploySuccess && (
        <div className="mb-6 p-4 bg-green-900/30 border border-green-700 rounded-lg flex items-center gap-3">
          <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-green-400">{deploySuccess}</p>
          <button
            onClick={() => setDeploySuccess(null)}
            className="ml-auto text-green-400 hover:text-green-300"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Comparison mode indicator */}
      {comparisonMode && viewMode === 'list' && (
        <div className="mb-6 p-4 bg-blue-900/30 border border-blue-700 rounded-lg">
          <p className="text-blue-400 text-sm">
            <span className="font-medium">Comparison Mode:</span> Select 2 or more experiments to compare.
            {selectedIds.length > 0 && (
              <span className="ml-2">
                {selectedIds.length} experiment{selectedIds.length !== 1 ? 's' : ''} selected
              </span>
            )}
          </p>
        </div>
      )}

      {/* Content */}
      {viewMode === 'list' && (
        <ExperimentList
          key={refreshKey}
          onExperimentSelect={handleExperimentSelect}
          onRefresh={() => setRefreshKey(prev => prev + 1)}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          selectionMode={comparisonMode}
        />
      )}

      {viewMode === 'detail' && selectedExperiment && (
        <ExperimentDetail
          experiment={selectedExperiment}
          onClose={handleCloseDetail}
          onDeploy={handleDeploy}
        />
      )}

      {viewMode === 'compare' && (
        <ExperimentComparison
          experimentIds={selectedIds}
          onClose={handleCloseComparison}
        />
      )}
    </div>
  );
}
