/**
 * Models API Routes - CRUD Operations
 * 
 * GET    /api/models       - List all models with pagination and filters
 * POST   /api/models       - Create a new model entry
 * PATCH  /api/models       - Update model status (batch update)
 * DELETE /api/models       - Delete a model
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { 
  createModel, 
  getModels, 
  getModelById, 
  updateModel, 
  deleteModel 
} from '@/lib/db-utils';
import { getModelService } from '@/lib/model-service';
import type { ModelStatus, CreateModelInput, UpdateModelInput, ModelFilters } from '@/types/database';

// ============================================================================
// GET - List Models
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    
    // Parse pagination params
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const sortBy = searchParams.get('sortBy') || 'created_at';
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';

    // Parse filter params
    const filters: ModelFilters = {};
    const status = searchParams.get('status');
    const algorithm = searchParams.get('algorithm');
    const targetAsset = searchParams.get('target_asset');

    if (status && isValidStatus(status)) {
      filters.status = status;
    }
    if (algorithm) {
      filters.algorithm = algorithm;
    }
    if (targetAsset) {
      filters.target_asset = targetAsset;
    }

    const result = await getModels(filters, {
      page,
      limit,
      sortBy,
      sortOrder,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching models:', error);
    return NextResponse.json(
      { error: 'Failed to fetch models' },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST - Create Model
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // Validate required fields
    const validationError = validateCreateModelInput(body);
    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 }
      );
    }

    const input: CreateModelInput = {
      name: body.name,
      description: body.description,
      version: body.version,
      status: body.status || 'inactive',
      algorithm: body.algorithm,
      hyperparameters: body.hyperparameters || {},
      features: body.features || [],
      target_asset: body.target_asset,
      training_start_date: body.training_start_date ? new Date(body.training_start_date) : undefined,
      training_end_date: body.training_end_date ? new Date(body.training_end_date) : undefined,
    };

    const model = await createModel(input);

    return NextResponse.json(
      { 
        message: 'Model created successfully',
        model 
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating model:', error);
    return NextResponse.json(
      { error: 'Failed to create model' },
      { status: 500 }
    );
  }
}

// ============================================================================
// PATCH - Update Model Status
// ============================================================================

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Model ID is required' },
        { status: 400 }
      );
    }

    // Check if model exists
    const existingModel = await getModelById(id);
    if (!existingModel) {
      return NextResponse.json(
        { error: 'Model not found' },
        { status: 404 }
      );
    }

    // Validate status if provided
    if (updates.status && !isValidStatus(updates.status)) {
      return NextResponse.json(
        { error: 'Invalid status value' },
        { status: 400 }
      );
    }

    const updateInput: UpdateModelInput = {};
    
    if (updates.name !== undefined) updateInput.name = updates.name;
    if (updates.description !== undefined) updateInput.description = updates.description;
    if (updates.version !== undefined) updateInput.version = updates.version;
    if (updates.status !== undefined) updateInput.status = updates.status;
    if (updates.algorithm !== undefined) updateInput.algorithm = updates.algorithm;
    if (updates.hyperparameters !== undefined) updateInput.hyperparameters = updates.hyperparameters;
    if (updates.features !== undefined) updateInput.features = updates.features;
    if (updates.target_asset !== undefined) updateInput.target_asset = updates.target_asset;

    const updatedModel = await updateModel(id, updateInput);

    // If status changed, notify AWS VM
    if (updates.status && updates.status !== existingModel.status) {
      const modelService = getModelService();
      await modelService.updateModelStatus({
        modelId: id,
        status: updates.status,
        previousStatus: existingModel.status,
        reason: updates.reason || 'Manual status update',
      });
    }

    return NextResponse.json({
      message: 'Model updated successfully',
      model: updatedModel,
    });
  } catch (error) {
    console.error('Error updating model:', error);
    return NextResponse.json(
      { error: 'Failed to update model' },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE - Delete Model
// ============================================================================

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Model ID is required' },
        { status: 400 }
      );
    }

    // Check if model exists
    const existingModel = await getModelById(id);
    if (!existingModel) {
      return NextResponse.json(
        { error: 'Model not found' },
        { status: 404 }
      );
    }

    // Remove from AWS VM first
    const modelService = getModelService();
    const vmRemoved = await modelService.removeModel(id);
    
    if (!vmRemoved) {
      console.warn(`Failed to remove model ${id} from AWS VM, proceeding with database deletion`);
    }

    // Delete from database
    const deleted = await deleteModel(id);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Failed to delete model' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Model deleted successfully',
      id,
      vmRemoved,
    });
  } catch (error) {
    console.error('Error deleting model:', error);
    return NextResponse.json(
      { error: 'Failed to delete model' },
      { status: 500 }
    );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function isValidStatus(status: string): status is ModelStatus {
  return ['active', 'inactive', 'training', 'deprecated'].includes(status);
}

function validateCreateModelInput(body: Record<string, unknown>): string | null {
  if (!body.name || typeof body.name !== 'string') {
    return 'Name is required and must be a string';
  }
  if (!body.version || typeof body.version !== 'string') {
    return 'Version is required and must be a string';
  }
  if (!body.algorithm || typeof body.algorithm !== 'string') {
    return 'Algorithm is required and must be a string';
  }
  if (!body.target_asset || typeof body.target_asset !== 'string') {
    return 'Target asset is required and must be a string';
  }
  if (body.status && !isValidStatus(body.status as string)) {
    return 'Invalid status value. Must be one of: active, inactive, training, deprecated';
  }
  if (body.hyperparameters && typeof body.hyperparameters !== 'object') {
    return 'Hyperparameters must be an object';
  }
  if (body.features && !Array.isArray(body.features)) {
    return 'Features must be an array';
  }
  return null;
}
