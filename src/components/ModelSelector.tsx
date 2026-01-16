'use client';

import React, { useEffect, useState } from 'react';
import { Model } from '@/types/database';

interface ModelSelectorProps {
  selectedModelIds: string[];
  onSelectionChange: (ids: string[]) => void;
  maxSelection?: number;
}

export default function ModelSelector({
  selectedModelIds,
  onSelectionChange,
  maxSelection = 3
}: ModelSelectorProps) {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchModels() {
      try {
        const response = await fetch('/api/models?limit=100'); // Fetch enough for selection
        if (!response.ok) throw new Error('Failed to fetch models');
        const data = await response.json();
        // The API returns a PaginatedResult structure: { data: Model[], pagination: ... }
        setModels(data.data || []);
      } catch (err) {
        setError('Error loading models');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchModels();
  }, []);

  const handleToggle = (modelId: string) => {
    if (selectedModelIds.includes(modelId)) {
      onSelectionChange(selectedModelIds.filter(id => id !== modelId));
    } else {
      if (selectedModelIds.length >= maxSelection) {
        return; // Max selection reached
      }
      onSelectionChange([...selectedModelIds, modelId]);
    }
  };

  if (loading) return <div className="text-sm text-gray-500">Loading models...</div>;
  if (error) return <div className="text-sm text-red-500">{error}</div>;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Select Models to Compare (Max {maxSelection})</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {models.map(model => (
          <div
            key={model.id}
            onClick={() => handleToggle(model.id)}
            className={`
              cursor-pointer p-4 rounded-lg border-2 transition-all
              ${selectedModelIds.includes(model.id)
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'
              }
            `}
          >
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-gray-100">{model.name}</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1">v{model.version}</p>
              </div>
              <div className={`
                w-5 h-5 rounded-full border flex items-center justify-center
                ${selectedModelIds.includes(model.id)
                  ? 'bg-blue-500 border-blue-500 text-white'
                  : 'border-gray-300'
                }
              `}>
                {selectedModelIds.includes(model.id) && (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-500">
              <div>
                <span className="block text-gray-400">Algorithm</span>
                {model.algorithm}
              </div>
              <div>
                <span className="block text-gray-400">Target</span>
                {model.target_asset}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
