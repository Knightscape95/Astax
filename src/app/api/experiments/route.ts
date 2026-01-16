/**
 * Experiments API Routes
 * 
 * POST   /api/experiments - Create a new experiment (from Colab)
 * GET    /api/experiments - List experiments with pagination and filters
 * 
 * Authentication:
 * - API key for Colab requests (X-API-Key header)
 * - Session-based for dashboard requests
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { createExperiment, getExperiments } from '@/lib/db-utils';
import { validateApiKey, checkRateLimit } from './auth';
import type { 
  CreateExperimentInput, 
  ExperimentFilters, 
  ExperimentStatus,
  ExperimentModelType,
  ExperimentDataSource 
} from '@/types/database';

// ============================================================================
// Validation Helpers
// ============================================================================

const VALID_STATUSES: ExperimentStatus[] = ['running', 'completed', 'failed', 'cancelled'];
const VALID_MODEL_TYPES: ExperimentModelType[] = ['LSTM', 'XGBoost', 'Transformer', 'DNN', 'RandomForest', 'RL'];
const VALID_DATA_SOURCES: ExperimentDataSource[] = ['yahoo', 'alpha_vantage', 'nse'];

function isValidStatus(status: string): status is ExperimentStatus {
  return VALID_STATUSES.includes(status as ExperimentStatus);
}

function isValidModelType(type: string): type is ExperimentModelType {
  return VALID_MODEL_TYPES.includes(type as ExperimentModelType);
}

function isValidDataSource(source: string): source is ExperimentDataSource {
  return VALID_DATA_SOURCES.includes(source as ExperimentDataSource);
}

function validateCreateExperimentInput(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return 'Request body is required';
  }

  const input = body as Record<string, unknown>;

  if (!input.name || typeof input.name !== 'string') {
    return 'name is required and must be a string';
  }

  if (!input.model_type || typeof input.model_type !== 'string') {
    return 'model_type is required and must be a string';
  }

  if (!isValidModelType(input.model_type) && !input.model_type) {
    // Allow custom model types but warn in the response
    console.warn(`Non-standard model_type: ${input.model_type}`);
  }

  if (!input.target_asset || typeof input.target_asset !== 'string') {
    return 'target_asset is required and must be a string';
  }

  if (!input.data_source || typeof input.data_source !== 'string') {
    return 'data_source is required and must be a string';
  }

  if (!input.date_range_start) {
    return 'date_range_start is required';
  }

  if (!input.date_range_end) {
    return 'date_range_end is required';
  }

  // Validate date formats
  const startDate = new Date(input.date_range_start as string);
  const endDate = new Date(input.date_range_end as string);
  
  if (isNaN(startDate.getTime())) {
    return 'date_range_start must be a valid date';
  }

  if (isNaN(endDate.getTime())) {
    return 'date_range_end must be a valid date';
  }

  if (startDate >= endDate) {
    return 'date_range_start must be before date_range_end';
  }

  if (input.train_test_split === undefined || input.train_test_split === null) {
    return 'train_test_split is required';
  }

  const trainTestSplit = parseFloat(input.train_test_split as string);
  if (isNaN(trainTestSplit) || trainTestSplit <= 0 || trainTestSplit >= 1) {
    return 'train_test_split must be a number between 0 and 1 (exclusive)';
  }

  // Validate optional fields
  if (input.hyperparameters !== undefined && typeof input.hyperparameters !== 'object') {
    return 'hyperparameters must be an object';
  }

  if (input.features !== undefined) {
    if (!Array.isArray(input.features)) {
      return 'features must be an array of strings';
    }
    if (!input.features.every(f => typeof f === 'string')) {
      return 'features must contain only strings';
    }
  }

  return null;
}

// ============================================================================
// Authentication Helper
// ============================================================================

async function authenticateRequest(request: NextRequest): Promise<{
  authenticated: boolean;
  source: 'api_key' | 'session' | null;
  error?: string;
}> {
  // First, check for API key (Colab requests)
  const apiKey = request.headers.get('X-API-Key');
  if (apiKey) {
    const isValid = await validateApiKey(apiKey);
    if (isValid) {
      return { authenticated: true, source: 'api_key' };
    }
    return { authenticated: false, source: null, error: 'Invalid API key' };
  }

  // Fall back to session authentication (dashboard requests)
  const session = await getServerSession();
  if (session) {
    return { authenticated: true, source: 'session' };
  }

  return { authenticated: false, source: null, error: 'Unauthorized' };
}

// ============================================================================
// GET - List Experiments
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    // Authenticate request
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check rate limit
    const clientId = request.headers.get('X-API-Key') || 'session';
    const rateLimitResult = await checkRateLimit(clientId, 'list');
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded',
          retryAfter: rateLimitResult.retryAfter 
        },
        { 
          status: 429,
          headers: {
            'Retry-After': String(rateLimitResult.retryAfter || 60),
          }
        }
      );
    }

    const { searchParams } = new URL(request.url);

    // Parse pagination params
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100); // Max 100
    const sortBy = searchParams.get('sortBy') || 'created_at';
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';

    // Validate sort params
    const allowedSortFields = ['created_at', 'started_at', 'name', 'status', 'model_type'];
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const validSortOrder = ['asc', 'desc'].includes(sortOrder) ? sortOrder : 'desc';

    // Parse filter params
    const filters: ExperimentFilters = {};
    
    const status = searchParams.get('status');
    if (status && isValidStatus(status)) {
      filters.status = status;
    }

    const modelType = searchParams.get('model_type');
    if (modelType) {
      filters.model_type = modelType;
    }

    const targetAsset = searchParams.get('target_asset');
    if (targetAsset) {
      filters.target_asset = targetAsset;
    }

    const dataSource = searchParams.get('data_source');
    if (dataSource) {
      filters.data_source = dataSource;
    }

    const modelId = searchParams.get('model_id');
    if (modelId) {
      filters.model_id = modelId;
    }

    const startDate = searchParams.get('start_date');
    if (startDate) {
      const date = new Date(startDate);
      if (!isNaN(date.getTime())) {
        filters.start_date = date;
      }
    }

    const endDate = searchParams.get('end_date');
    if (endDate) {
      const date = new Date(endDate);
      if (!isNaN(date.getTime())) {
        filters.end_date = date;
      }
    }

    const result = await getExperiments(filters, {
      page,
      limit,
      sortBy: validSortBy,
      sortOrder: validSortOrder,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching experiments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch experiments' },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST - Create Experiment
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Authenticate request
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check rate limit
    const clientId = request.headers.get('X-API-Key') || 'session';
    const rateLimitResult = await checkRateLimit(clientId, 'create');
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded',
          retryAfter: rateLimitResult.retryAfter 
        },
        { 
          status: 429,
          headers: {
            'Retry-After': String(rateLimitResult.retryAfter || 60),
          }
        }
      );
    }

    const body = await request.json();

    // Validate input
    const validationError = validateCreateExperimentInput(body);
    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 }
      );
    }

    // Prepare input
    const input: CreateExperimentInput = {
      name: body.name,
      model_type: body.model_type,
      target_asset: body.target_asset,
      data_source: body.data_source,
      date_range_start: new Date(body.date_range_start),
      date_range_end: new Date(body.date_range_end),
      train_test_split: parseFloat(body.train_test_split),
      hyperparameters: body.hyperparameters || {},
      features: body.features || [],
      gpu_used: body.gpu_used || false,
      colab_session_id: body.colab_session_id,
      wandb_run_id: body.wandb_run_id,
    };

    const experiment = await createExperiment(input);

    return NextResponse.json(
      {
        success: true,
        experiment_id: experiment.id,
        experiment,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating experiment:', error);
    
    // Check for duplicate key error (idempotency)
    if (error instanceof Error && error.message.includes('duplicate key')) {
      return NextResponse.json(
        { error: 'An experiment with this configuration already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create experiment' },
      { status: 500 }
    );
  }
}
