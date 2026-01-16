"""
ONNX Model Exporters Module
===========================

Provides utilities for exporting trained models to ONNX format
for deployment in the Traycer dashboard.

ONNX (Open Neural Network Exchange) is a standard format that
allows models to be used across different frameworks and platforms.

Example Usage:
    from trading_ml_utils.models import export_to_onnx, ONNXExporter
    
    # Simple export
    export_to_onnx(model, 'model.onnx', model_type='lstm', lookback=60)
    
    # Advanced export with validation
    exporter = ONNXExporter()
    exporter.export(model, 'model.onnx')
    exporter.validate('model.onnx')
"""

import os
import logging
from typing import Optional, Dict, Any, Union, Tuple

import numpy as np

logger = logging.getLogger(__name__)


class ONNXExporter:
    """
    Export models to ONNX format for deployment.
    
    Supports:
    - PyTorch neural networks (LSTM, DNN, Transformer)
    - Scikit-learn models (Random Forest)
    - XGBoost models
    
    Example:
        exporter = ONNXExporter()
        
        # Export PyTorch model
        exporter.export(
            model=lstm_model,
            filepath='lstm.onnx',
            model_type='lstm',
            input_shape=(1, 60, 1)  # (batch, sequence, features)
        )
        
        # Export with validation
        is_valid = exporter.validate('lstm.onnx')
    """
    
    def __init__(self, opset_version: int = 14):
        """
        Initialize the ONNX exporter.
        
        Args:
            opset_version: ONNX opset version (14 is well-supported)
        """
        self.opset_version = opset_version
        self._check_dependencies()
        
    def _check_dependencies(self):
        """Check that required packages are installed."""
        try:
            import onnx
        except ImportError:
            raise ImportError(
                "ONNX is not installed!\n\n"
                "💡 Fix: Run this command:\n"
                "   !pip install onnx onnxruntime"
            )
            
    def export(
        self,
        model: Any,
        filepath: str,
        model_type: str,
        input_shape: Optional[Tuple[int, ...]] = None,
        lookback: int = 60,
        n_features: int = 1,
        metadata: Optional[Dict[str, str]] = None,
        validate: bool = True
    ) -> str:
        """
        Export a model to ONNX format.
        
        Args:
            model: The trained model to export
            filepath: Output file path (.onnx)
            model_type: Type of model ('lstm', 'dnn', 'transformer', 'random_forest', 'xgboost')
            input_shape: Input tensor shape (auto-calculated if None)
            lookback: Sequence length for time series models
            n_features: Number of input features
            metadata: Additional metadata to include
            validate: Whether to validate the exported model
            
        Returns:
            Path to the exported ONNX file
            
        Example:
            path = exporter.export(
                model=my_lstm,
                filepath='model.onnx',
                model_type='lstm',
                lookback=60
            )
        """
        model_type = model_type.lower()
        
        print(f"📦 Exporting {model_type} model to ONNX...")
        
        # Ensure .onnx extension
        if not filepath.endswith('.onnx'):
            filepath += '.onnx'
            
        # Create directory if needed
        os.makedirs(os.path.dirname(filepath) or '.', exist_ok=True)
        
        # Export based on model type
        if model_type in ['lstm', 'dnn', 'transformer']:
            self._export_pytorch(model, filepath, model_type, lookback, n_features)
        elif model_type in ['random_forest', 'rf']:
            self._export_sklearn(model, filepath, lookback, n_features)
        elif model_type in ['xgboost', 'xgb']:
            self._export_xgboost(model, filepath, lookback, n_features)
        else:
            raise ValueError(
                f"Unsupported model type: '{model_type}'\n\n"
                "💡 Supported types:\n"
                "   - Neural: 'lstm', 'dnn', 'transformer'\n"
                "   - Tree: 'random_forest', 'xgboost'"
            )
            
        # Add metadata
        if metadata:
            self._add_metadata(filepath, metadata)
            
        # Validate
        if validate:
            is_valid = self.validate(filepath)
            if not is_valid:
                logger.warning(f"ONNX validation failed for {filepath}")
                
        print(f"✅ Model exported to: {filepath}")
        file_size = os.path.getsize(filepath) / (1024 * 1024)
        print(f"   File size: {file_size:.2f} MB")
        
        return filepath
        
    def _export_pytorch(
        self,
        model: Any,
        filepath: str,
        model_type: str,
        lookback: int,
        n_features: int
    ):
        """Export PyTorch model to ONNX."""
        try:
            import torch
        except ImportError:
            raise ImportError("PyTorch is required for exporting neural networks")
            
        # Get the actual PyTorch module
        if hasattr(model, 'module'):
            torch_model = model.module
        elif hasattr(model, '_model'):
            torch_model = model._model
        else:
            torch_model = model
            
        # Set to eval mode
        torch_model.eval()
        
        # Create dummy input based on model type
        device = next(torch_model.parameters()).device
        
        if model_type == 'lstm':
            dummy_input = torch.randn(1, lookback, n_features).to(device)
        elif model_type == 'transformer':
            dummy_input = torch.randn(1, lookback, n_features).to(device)
        elif model_type == 'dnn':
            dummy_input = torch.randn(1, lookback * n_features).to(device)
        else:
            dummy_input = torch.randn(1, lookback, n_features).to(device)
            
        # Export to ONNX
        torch.onnx.export(
            torch_model,
            dummy_input,
            filepath,
            export_params=True,
            opset_version=self.opset_version,
            do_constant_folding=True,
            input_names=['input'],
            output_names=['output'],
            dynamic_axes={
                'input': {0: 'batch_size'},
                'output': {0: 'batch_size'}
            }
        )
        
    def _export_sklearn(
        self,
        model: Any,
        filepath: str,
        lookback: int,
        n_features: int
    ):
        """Export scikit-learn model to ONNX."""
        try:
            from skl2onnx import convert_sklearn
            from skl2onnx.common.data_types import FloatTensorType
        except ImportError:
            raise ImportError(
                "skl2onnx is required for exporting sklearn models!\n\n"
                "💡 Fix: Run this command:\n"
                "   !pip install skl2onnx"
            )
            
        # Get sklearn model
        if hasattr(model, 'sklearn_model'):
            sklearn_model = model.sklearn_model
        elif hasattr(model, '_model'):
            sklearn_model = model._model
        else:
            sklearn_model = model
            
        # Define input type
        input_dim = lookback * n_features
        initial_type = [('input', FloatTensorType([None, input_dim]))]
        
        # Convert to ONNX
        onnx_model = convert_sklearn(
            sklearn_model,
            initial_types=initial_type,
            target_opset=self.opset_version
        )
        
        # Save
        import onnx
        onnx.save_model(onnx_model, filepath)
        
    def _export_xgboost(
        self,
        model: Any,
        filepath: str,
        lookback: int,
        n_features: int
    ):
        """Export XGBoost model to ONNX."""
        try:
            import onnxmltools
            from onnxmltools.convert.common.data_types import FloatTensorType
        except ImportError:
            raise ImportError(
                "onnxmltools is required for exporting XGBoost models!\n\n"
                "💡 Fix: Run this command:\n"
                "   !pip install onnxmltools"
            )
            
        # Get XGBoost model
        if hasattr(model, 'xgb_model'):
            xgb_model = model.xgb_model
        elif hasattr(model, '_model'):
            xgb_model = model._model
        else:
            xgb_model = model
            
        # Define input type
        input_dim = lookback * n_features
        initial_type = [('input', FloatTensorType([None, input_dim]))]
        
        # Convert to ONNX
        onnx_model = onnxmltools.convert_xgboost(
            xgb_model,
            initial_types=initial_type,
            target_opset=self.opset_version
        )
        
        # Save
        import onnx
        onnx.save_model(onnx_model, filepath)
        
    def _add_metadata(self, filepath: str, metadata: Dict[str, str]):
        """Add metadata to ONNX model."""
        import onnx
        
        model = onnx.load(filepath)
        
        for key, value in metadata.items():
            meta = model.metadata_props.add()
            meta.key = key
            meta.value = str(value)
            
        onnx.save(model, filepath)
        
    def validate(self, filepath: str) -> bool:
        """
        Validate an ONNX model file.
        
        Args:
            filepath: Path to ONNX file
            
        Returns:
            True if model is valid
        """
        import onnx
        
        print(f"🔍 Validating ONNX model...")
        
        try:
            model = onnx.load(filepath)
            onnx.checker.check_model(model)
            print("   ✅ Model structure is valid")
            return True
        except Exception as e:
            print(f"   ❌ Validation failed: {e}")
            return False
            
    def test_inference(
        self,
        filepath: str,
        input_data: np.ndarray
    ) -> np.ndarray:
        """
        Test inference with the exported model.
        
        Args:
            filepath: Path to ONNX file
            input_data: Test input data
            
        Returns:
            Model predictions
        """
        try:
            import onnxruntime as ort
        except ImportError:
            raise ImportError(
                "ONNX Runtime is required for inference testing!\n\n"
                "💡 Fix: Run this command:\n"
                "   !pip install onnxruntime"
            )
            
        print("🧪 Testing ONNX inference...")
        
        # Create session
        session = ort.InferenceSession(filepath)
        
        # Get input name
        input_name = session.get_inputs()[0].name
        
        # Run inference
        input_data = input_data.astype(np.float32)
        result = session.run(None, {input_name: input_data})
        
        print(f"   ✅ Inference successful")
        print(f"   Output shape: {result[0].shape}")
        
        return result[0]
        
    def get_model_info(self, filepath: str) -> Dict[str, Any]:
        """
        Get information about an ONNX model.
        
        Args:
            filepath: Path to ONNX file
            
        Returns:
            Dictionary with model information
        """
        import onnx
        
        model = onnx.load(filepath)
        
        info = {
            'ir_version': model.ir_version,
            'opset_version': model.opset_import[0].version,
            'producer_name': model.producer_name,
            'inputs': [],
            'outputs': [],
            'metadata': {}
        }
        
        # Get inputs
        for inp in model.graph.input:
            shape = [d.dim_value for d in inp.type.tensor_type.shape.dim]
            info['inputs'].append({
                'name': inp.name,
                'shape': shape
            })
            
        # Get outputs
        for out in model.graph.output:
            shape = [d.dim_value for d in out.type.tensor_type.shape.dim]
            info['outputs'].append({
                'name': out.name,
                'shape': shape
            })
            
        # Get metadata
        for prop in model.metadata_props:
            info['metadata'][prop.key] = prop.value
            
        return info


def export_to_onnx(
    model: Any,
    filepath: str,
    model_type: str,
    lookback: int = 60,
    n_features: int = 1,
    **kwargs
) -> str:
    """
    Convenience function to export a model to ONNX.
    
    This is a simple wrapper around ONNXExporter for quick exports.
    
    Args:
        model: The trained model
        filepath: Output file path
        model_type: Type of model
        lookback: Sequence length
        n_features: Number of features
        **kwargs: Additional arguments for ONNXExporter.export()
        
    Returns:
        Path to exported file
        
    Example:
        # Export LSTM
        export_to_onnx(lstm_model, 'model.onnx', 'lstm', lookback=60)
        
        # Export XGBoost
        export_to_onnx(xgb_model, 'model.onnx', 'xgboost', lookback=60)
    """
    exporter = ONNXExporter()
    return exporter.export(
        model=model,
        filepath=filepath,
        model_type=model_type,
        lookback=lookback,
        n_features=n_features,
        **kwargs
    )
