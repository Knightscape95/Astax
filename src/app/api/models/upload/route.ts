/**
 * Model Upload API Route
 * 
 * POST /api/models/upload - Upload ONNX model file with validation
 * 
 * This endpoint handles:
 * - File upload via multipart form data
 * - ONNX file format validation
 * - File size limits
 * - Checksum verification
 * - Model metadata extraction
 * - Forwarding to AWS VM for deployment
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { createModel, updateModel } from '@/lib/db-utils';
import { 
  getModelService, 
  validateONNXFile, 
  calculateChecksum,
  isONNXFile,
  type ModelUploadPayload 
} from '@/lib/model-service';
import type { CreateModelInput } from '@/types/database';

// ============================================================================
// Configuration
// ============================================================================

const MAX_FILE_SIZE = parseInt(process.env.MAX_MODEL_FILE_SIZE || '524288000', 10); // 500MB default
const ALLOWED_EXTENSIONS = ['onnx'];

// ============================================================================
// POST - Upload Model
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

    // Parse multipart form data
    const formData = await request.formData();
    
    // Extract file
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file extension
    if (!isONNXFile(file.name)) {
      return NextResponse.json(
        { 
          error: 'Invalid file type. Only ONNX files are allowed.',
          allowedExtensions: ALLOWED_EXTENSIONS 
        },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { 
          error: `File too large. Maximum size is ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB`,
          maxSize: MAX_FILE_SIZE,
          fileSize: file.size 
        },
        { status: 400 }
      );
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate ONNX format
    const validation = validateONNXFile(buffer);
    if (!validation.valid) {
      return NextResponse.json(
        { 
          error: validation.error || 'Invalid ONNX file format',
          details: 'The uploaded file does not appear to be a valid ONNX model'
        },
        { status: 400 }
      );
    }

    // Extract model metadata from form
    const name = formData.get('name') as string;
    const version = formData.get('version') as string;
    const algorithm = formData.get('algorithm') as string;
    const targetAsset = formData.get('target_asset') as string;
    const description = formData.get('description') as string | null;
    const hyperparametersStr = formData.get('hyperparameters') as string | null;
    const featuresStr = formData.get('features') as string | null;

    // Validate required fields
    if (!name || !version || !algorithm || !targetAsset) {
      return NextResponse.json(
        { 
          error: 'Missing required fields',
          required: ['name', 'version', 'algorithm', 'target_asset']
        },
        { status: 400 }
      );
    }

    // Parse JSON fields
    let hyperparameters: Record<string, unknown> = {};
    let features: string[] = [];

    if (hyperparametersStr) {
      try {
        hyperparameters = JSON.parse(hyperparametersStr);
      } catch {
        return NextResponse.json(
          { error: 'Invalid hyperparameters JSON' },
          { status: 400 }
        );
      }
    }

    if (featuresStr) {
      try {
        features = JSON.parse(featuresStr);
        if (!Array.isArray(features)) {
          throw new Error('Features must be an array');
        }
      } catch {
        return NextResponse.json(
          { error: 'Invalid features JSON. Must be an array of strings' },
          { status: 400 }
        );
      }
    }

    // Calculate checksum
    const checksum = await calculateChecksum(buffer);

    // Create model entry in database
    const modelInput: CreateModelInput = {
      name,
      description: description || undefined,
      version,
      status: 'inactive', // Will be updated after successful deployment
      algorithm,
      hyperparameters,
      features,
      target_asset: targetAsset,
    };

    const model = await createModel(modelInput);

    // Prepare upload payload for AWS VM
    const uploadPayload: ModelUploadPayload = {
      modelId: model.id,
      name,
      version,
      algorithm,
      targetAsset,
      hyperparameters,
      features,
      fileBuffer: buffer,
      fileName: file.name,
      fileSize: file.size,
      checksum,
    };

    // Forward to AWS VM
    const modelService = getModelService();
    const deploymentResult = await modelService.uploadModel(uploadPayload);

    // Update model status based on deployment result
    if (deploymentResult.success) {
      await updateModel(model.id, { status: 'active' });
      model.status = 'active';
    } else {
      // Keep as inactive but log the error
      console.error('Model deployment to VM failed:', deploymentResult.error);
    }

    return NextResponse.json({
      message: deploymentResult.success 
        ? 'Model uploaded and deployed successfully'
        : 'Model uploaded but deployment to VM failed',
      model: {
        ...model,
        fileName: file.name,
        fileSize: file.size,
        checksum,
      },
      deployment: {
        success: deploymentResult.success,
        status: deploymentResult.status,
        deploymentId: deploymentResult.deploymentId,
        vmEndpoint: deploymentResult.vmEndpoint,
        error: deploymentResult.error,
      },
      validation: {
        onnxValid: true,
        metadata: validation.metadata,
      },
    }, { status: deploymentResult.success ? 201 : 207 });

  } catch (error) {
    console.error('Error uploading model:', error);
    return NextResponse.json(
      { 
        error: 'Failed to upload model',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET - Get upload configuration
// ============================================================================

export async function GET() {
  return NextResponse.json({
    maxFileSize: MAX_FILE_SIZE,
    maxFileSizeMB: Math.round(MAX_FILE_SIZE / 1024 / 1024),
    allowedExtensions: ALLOWED_EXTENSIONS,
    allowedMimeTypes: ['application/octet-stream', 'application/x-protobuf'],
  });
}
