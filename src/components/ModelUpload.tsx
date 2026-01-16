'use client';

/**
 * ModelUpload Component
 * 
 * A drag-and-drop file upload component for ONNX models with:
 * - Drag and drop support
 * - File validation
 * - Upload progress tracking
 * - Model metadata form
 */

import React, { useState, useCallback, useRef } from 'react';

// ============================================================================
// Types
// ============================================================================

interface ModelMetadata {
  name: string;
  version: string;
  algorithm: string;
  target_asset: string;
  description: string;
  hyperparameters: string;
  features: string;
}

interface UploadConfig {
  maxFileSize: number;
  maxFileSizeMB: number;
  allowedExtensions: string[];
}

interface UploadResult {
  success: boolean;
  model?: {
    id: string;
    name: string;
    status: string;
    fileName: string;
    fileSize: number;
  };
  deployment?: {
    success: boolean;
    status: string;
    error?: string;
  };
  error?: string;
}

interface ModelUploadProps {
  onUploadSuccess?: (result: UploadResult) => void;
  onUploadError?: (error: string) => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: UploadConfig = {
  maxFileSize: 524288000, // 500MB
  maxFileSizeMB: 500,
  allowedExtensions: ['onnx'],
};

const ALGORITHM_OPTIONS = [
  'LSTM',
  'GRU',
  'Transformer',
  'XGBoost',
  'LightGBM',
  'CatBoost',
  'RandomForest',
  'CNN',
  'ResNet',
  'Custom',
];

const TARGET_ASSET_OPTIONS = [
  'BTC/USD',
  'ETH/USD',
  'BTC/USDT',
  'ETH/USDT',
  'SPY',
  'QQQ',
  'AAPL',
  'GOOGL',
  'Custom',
];

// ============================================================================
// Component
// ============================================================================

export default function ModelUpload({ onUploadSuccess, onUploadError }: ModelUploadProps) {
  // State
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadConfig, setUploadConfig] = useState<UploadConfig>(DEFAULT_CONFIG);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ModelMetadata>({
    name: '',
    version: '1.0.0',
    algorithm: 'LSTM',
    target_asset: 'BTC/USD',
    description: '',
    hyperparameters: '{}',
    features: '[]',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch upload config on mount
  React.useEffect(() => {
    fetchUploadConfig();
  }, []);

  const fetchUploadConfig = async () => {
    try {
      const response = await fetch('/api/models/upload');
      if (response.ok) {
        const config = await response.json();
        setUploadConfig(config);
      }
    } catch (err) {
      console.error('Failed to fetch upload config:', err);
    }
  };

  // File validation
  const validateFile = useCallback((file: File): string | null => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    if (!extension || !uploadConfig.allowedExtensions.includes(extension)) {
      return `Invalid file type. Allowed: ${uploadConfig.allowedExtensions.join(', ')}`;
    }
    
    if (file.size > uploadConfig.maxFileSize) {
      return `File too large. Maximum size: ${uploadConfig.maxFileSizeMB}MB`;
    }
    
    return null;
  }, [uploadConfig]);

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setError(null);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const validationError = validateFile(file);
      
      if (validationError) {
        setError(validationError);
        return;
      }
      
      setSelectedFile(file);
      // Auto-fill name from filename
      if (!metadata.name) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        setMetadata(prev => ({ ...prev, name: nameWithoutExt }));
      }
    }
  }, [validateFile, metadata.name]);

  // File input handler
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = e.target.files;
    
    if (files && files.length > 0) {
      const file = files[0];
      const validationError = validateFile(file);
      
      if (validationError) {
        setError(validationError);
        return;
      }
      
      setSelectedFile(file);
      // Auto-fill name from filename
      if (!metadata.name) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        setMetadata(prev => ({ ...prev, name: nameWithoutExt }));
      }
    }
  }, [validateFile, metadata.name]);

  // Metadata change handler
  const handleMetadataChange = useCallback((
    field: keyof ModelMetadata,
    value: string
  ) => {
    setMetadata(prev => ({ ...prev, [field]: value }));
  }, []);

  // Upload handler
  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file to upload');
      return;
    }

    // Validate metadata
    if (!metadata.name.trim()) {
      setError('Model name is required');
      return;
    }
    if (!metadata.version.trim()) {
      setError('Version is required');
      return;
    }

    // Validate JSON fields
    try {
      JSON.parse(metadata.hyperparameters);
    } catch {
      setError('Invalid hyperparameters JSON');
      return;
    }

    try {
      const features = JSON.parse(metadata.features);
      if (!Array.isArray(features)) {
        throw new Error('Features must be an array');
      }
    } catch {
      setError('Invalid features JSON. Must be an array');
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('name', metadata.name);
      formData.append('version', metadata.version);
      formData.append('algorithm', metadata.algorithm);
      formData.append('target_asset', metadata.target_asset);
      formData.append('description', metadata.description);
      formData.append('hyperparameters', metadata.hyperparameters);
      formData.append('features', metadata.features);

      // Use XMLHttpRequest for progress tracking
      const result = await uploadWithProgress(formData);

      if (result.error) {
        setError(result.error);
        onUploadError?.(result.error);
      } else {
        onUploadSuccess?.(result);
        // Reset form
        setSelectedFile(null);
        setMetadata({
          name: '',
          version: '1.0.0',
          algorithm: 'LSTM',
          target_asset: 'BTC/USD',
          description: '',
          hyperparameters: '{}',
          features: '[]',
        });
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setError(errorMessage);
      onUploadError?.(errorMessage);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Upload with progress tracking
  const uploadWithProgress = (formData: FormData): Promise<UploadResult> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        try {
          const response = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({ success: true, ...response });
          } else {
            resolve({ success: false, error: response.error || 'Upload failed' });
          }
        } catch {
          resolve({ success: false, error: 'Invalid response from server' });
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload aborted'));
      });

      xhr.open('POST', '/api/models/upload');
      xhr.send(formData);
    });
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  // Render
  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
        Upload ONNX Model
      </h2>

      {/* Drag and Drop Zone */}
      <div
        className={`
          relative border-2 border-dashed rounded-lg p-8 text-center
          transition-colors cursor-pointer
          ${isDragging 
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
          }
          ${selectedFile ? 'bg-green-50 dark:bg-green-900/20 border-green-500' : ''}
        `}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".onnx"
          onChange={handleFileSelect}
          className="hidden"
        />

        {selectedFile ? (
          <div className="space-y-2">
            <svg className="w-12 h-12 mx-auto text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-lg font-medium text-gray-900 dark:text-white">
              {selectedFile.name}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {formatFileSize(selectedFile.size)}
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedFile(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }}
              className="text-sm text-red-600 hover:text-red-800 dark:text-red-400"
            >
              Remove file
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <svg className="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-lg font-medium text-gray-900 dark:text-white">
              Drop your ONNX model here
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              or click to browse
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Max file size: {uploadConfig.maxFileSizeMB}MB
            </p>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Model Metadata Form */}
      {selectedFile && (
        <div className="mt-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Model Details
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Model Name *
              </label>
              <input
                type="text"
                value={metadata.name}
                onChange={(e) => handleMetadataChange('name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                  bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                  focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="My Trading Model"
              />
            </div>

            {/* Version */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Version *
              </label>
              <input
                type="text"
                value={metadata.version}
                onChange={(e) => handleMetadataChange('version', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                  bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                  focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="1.0.0"
              />
            </div>

            {/* Algorithm */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Algorithm *
              </label>
              <select
                value={metadata.algorithm}
                onChange={(e) => handleMetadataChange('algorithm', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                  bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                  focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {ALGORITHM_OPTIONS.map((algo) => (
                  <option key={algo} value={algo}>{algo}</option>
                ))}
              </select>
            </div>

            {/* Target Asset */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Target Asset *
              </label>
              <select
                value={metadata.target_asset}
                onChange={(e) => handleMetadataChange('target_asset', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                  bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                  focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {TARGET_ASSET_OPTIONS.map((asset) => (
                  <option key={asset} value={asset}>{asset}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={metadata.description}
              onChange={(e) => handleMetadataChange('description', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Describe your model's purpose and capabilities..."
            />
          </div>

          {/* Hyperparameters */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Hyperparameters (JSON)
            </label>
            <textarea
              value={metadata.hyperparameters}
              onChange={(e) => handleMetadataChange('hyperparameters', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono text-sm
                focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder='{"learning_rate": 0.001, "epochs": 100}'
            />
          </div>

          {/* Features */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Features (JSON Array)
            </label>
            <textarea
              value={metadata.features}
              onChange={(e) => handleMetadataChange('features', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono text-sm
                focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder='["open", "high", "low", "close", "volume"]'
            />
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Upload Button */}
          <button
            type="button"
            onClick={handleUpload}
            disabled={isUploading || !selectedFile}
            className={`
              w-full py-3 px-4 rounded-lg font-medium text-white
              transition-colors
              ${isUploading || !selectedFile
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
              }
            `}
          >
            {isUploading ? 'Uploading...' : 'Upload Model'}
          </button>
        </div>
      )}
    </div>
  );
}
