'use client';

import { useState } from 'react';
import ModelSelector from '@/components/ModelSelector';
import ModelComparison from '@/components/ModelComparison';

/**
 * Model Comparison Page
 * Allows users to select and compare multiple models side-by-side
 */
export default function ComparePage() {
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Model Comparison</h1>
        <p className="text-gray-400 text-sm mt-1">
          Compare performance metrics, correlations, and trading patterns across multiple models
        </p>
      </div>

      {/* Model Selector */}
      <div className="bg-gray-800 rounded-xl p-6 mb-6">
        <ModelSelector
          selectedModelIds={selectedModelIds}
          onSelectionChange={setSelectedModelIds}
          maxSelection={5}
        />
      </div>

      {/* Comparison Results */}
      {selectedModelIds.length > 0 ? (
        <div className="bg-gray-800 rounded-xl p-6">
          <ModelComparison selectedModelIds={selectedModelIds} />
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl p-12 text-center">
          <div className="max-w-md mx-auto">
            <svg
              className="mx-auto h-16 w-16 text-gray-500 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <h3 className="text-lg font-medium text-white mb-2">
              Get Started
            </h3>
            <p className="text-gray-400 mb-6">
              Select at least 2 models from above to start comparing their performance, view synchronized charts, and analyze correlations.
            </p>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 text-left">
              <h4 className="text-sm font-semibold text-emerald-400 mb-2">
                Comparison Features:
              </h4>
              <ul className="text-sm text-emerald-300/80 space-y-1">
                <li>• Side-by-side performance metrics</li>
                <li>• Synchronized time-series charts</li>
                <li>• Correlation and diversification analysis</li>
                <li>• Relative performance rankings</li>
                <li>• Signal agreement tracking</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
