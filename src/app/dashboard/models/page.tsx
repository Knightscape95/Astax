'use client';

import { useState } from 'react';
import ModelList from '@/components/ModelList';
import ModelUpload from '@/components/ModelUpload';

type TabType = 'list' | 'upload';

export default function ModelsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('list');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploadSuccess = () => {
    // Refresh the model list after successful upload
    setRefreshKey((prev) => prev + 1);
    setActiveTab('list');
  };

  return (
    <div>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Model Management</h1>
          <p className="text-gray-400 text-sm mt-1">
            Upload, manage, and monitor your ML trading models
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6 border-b border-gray-700">
        <button
          onClick={() => setActiveTab('list')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'list'
              ? 'text-emerald-400 border-emerald-400'
              : 'text-gray-400 border-transparent hover:text-white'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            All Models
          </span>
        </button>
        <button
          onClick={() => setActiveTab('upload')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'upload'
              ? 'text-emerald-400 border-emerald-400'
              : 'text-gray-400 border-transparent hover:text-white'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload Model
          </span>
        </button>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'list' ? (
          <ModelList
            key={refreshKey}
            showActions={true}
            onRefresh={() => setRefreshKey((prev) => prev + 1)}
          />
        ) : (
          <div className="max-w-3xl">
            <ModelUpload
              onUploadSuccess={handleUploadSuccess}
              onUploadError={(error) => console.error('Upload failed:', error)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
