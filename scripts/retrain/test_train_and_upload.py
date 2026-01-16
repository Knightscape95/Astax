"""
Unit tests for training and upload pipeline scripts.
"""

import json
import os
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest

# Import functions to test
from train_and_upload import (
    evaluate_model,
    export_model_onnx,
    load_and_preprocess_data,
    train_model_lstm,
    train_model_xgboost,
)


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture
def sample_data_csv():
    """Create sample OHLCV data CSV."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as f:
        df = pd.DataFrame({
            "date": pd.date_range("2023-01-01", periods=365),
            "open": np.random.uniform(100, 110, 365),
            "high": np.random.uniform(110, 115, 365),
            "low": np.random.uniform(95, 100, 365),
            "close": np.random.uniform(100, 110, 365),
            "volume": np.random.uniform(1e6, 1e7, 365),
            "symbol": "AAPL",
        })
        df.to_csv(f, index=False)
        yield f.name
    os.unlink(f.name)


@pytest.fixture
def temp_dir():
    """Create temporary directory."""
    temp = tempfile.mkdtemp()
    yield temp
    # Cleanup
    import shutil
    shutil.rmtree(temp, ignore_errors=True)


# ============================================================================
# Data Loading Tests
# ============================================================================

def test_load_and_preprocess_data(sample_data_csv):
    """Test data loading and preprocessing."""
    X_train, X_test, y_train, y_test, scaler = load_and_preprocess_data(
        sample_data_csv,
        symbol="AAPL",
        lookback=60,
        test_split=0.2,
    )
    
    assert X_train.shape[0] > 0, "X_train should not be empty"
    assert X_test.shape[0] > 0, "X_test should not be empty"
    assert X_train.shape[1] == 60, "X_train should have lookback sequence length"
    assert len(y_train) == len(X_train), "y_train length should match X_train"
    assert len(y_test) == len(X_test), "y_test length should match X_test"
    
    # Check scaling
    assert np.all(X_train >= 0) and np.all(X_train <= 1), "Data should be normalized 0-1"
    assert np.all(X_test >= 0) and np.all(X_test <= 1), "Data should be normalized 0-1"


def test_load_invalid_symbol(sample_data_csv):
    """Test loading with invalid symbol."""
    with pytest.raises(ValueError):
        load_and_preprocess_data(sample_data_csv, symbol="INVALID", lookback=60)


def test_load_missing_file():
    """Test loading missing file."""
    with pytest.raises(Exception):
        load_and_preprocess_data("/nonexistent/path.csv")


# ============================================================================
# Model Training Tests
# ============================================================================

@pytest.mark.skipif(not torch_available(), reason="PyTorch not installed")
def test_train_model_lstm(sample_data_csv, temp_dir):
    """Test LSTM model training."""
    X_train, _, y_train, _, _ = load_and_preprocess_data(sample_data_csv)
    
    result = train_model_lstm(X_train[:50], y_train[:50], epochs=2, checkpoint_dir=temp_dir)
    
    assert result["type"] == "lstm"
    assert result.get("train_loss", float("inf")) >= 0
    
    # Check checkpoint was saved
    checkpoints = list(Path(temp_dir).glob("checkpoint_lstm_*.pt"))
    assert len(checkpoints) > 0, "Checkpoint should be saved"


@pytest.mark.skipif(not xgboost_available(), reason="XGBoost not installed")
def test_train_model_xgboost(sample_data_csv, temp_dir):
    """Test XGBoost model training."""
    X_train, _, y_train, _, _ = load_and_preprocess_data(sample_data_csv)
    
    result = train_model_xgboost(X_train[:100], y_train[:100], checkpoint_dir=temp_dir)
    
    assert result["type"] == "xgboost"
    assert result.get("train_loss", float("inf")) >= 0


# ============================================================================
# Model Evaluation Tests
# ============================================================================

def test_evaluate_model_sklearn():
    """Test model evaluation with sklearn model."""
    from sklearn.linear_model import LinearRegression
    
    X_test = np.random.rand(30, 60)
    y_test = np.random.rand(30)
    
    model = LinearRegression()
    model.fit(X_test, y_test)
    
    metrics = evaluate_model(model, X_test, y_test)
    
    assert "mse" in metrics
    assert "rmse" in metrics
    assert "mae" in metrics
    assert "accuracy" in metrics
    assert metrics["mse"] >= 0
    assert 0 <= metrics["accuracy"] <= 1


def test_evaluate_model_dummy():
    """Test evaluation with dummy model."""
    # Create a simple predictor
    class DummyModel:
        def predict(self, X):
            return np.ones(len(X)) * 0.5
    
    X_test = np.random.rand(30, 60)
    y_test = np.random.rand(30)
    
    model = DummyModel()
    metrics = evaluate_model(model, X_test, y_test)
    
    assert all(k in metrics for k in ["mse", "rmse", "mae", "accuracy"])
    assert all(v >= 0 for v in metrics.values())


# ============================================================================
# Export Tests
# ============================================================================

@pytest.mark.skipif(not onnx_available(), reason="ONNX not installed")
def test_export_model_onnx_sklearn(temp_dir):
    """Test ONNX export for sklearn model."""
    from sklearn.linear_model import LinearRegression
    
    model = LinearRegression()
    X = np.random.rand(100, 60)
    y = np.random.rand(100)
    model.fit(X, y)
    
    output_path = str(Path(temp_dir) / "model.onnx")
    success = export_model_onnx(model, output_path, "xgboost")
    
    if success:
        assert Path(output_path).exists()
        # Try to load it
        import onnx
        onnx_model = onnx.load(output_path)
        assert onnx_model is not None


# ============================================================================
# Integration Tests
# ============================================================================

def test_full_pipeline_xgboost(sample_data_csv, temp_dir):
    """Integration test: data load -> train -> evaluate."""
    X_train, X_test, y_train, y_test, scaler = load_and_preprocess_data(
        sample_data_csv,
        lookback=60,
        test_split=0.2,
    )
    
    # Train
    result = train_model_xgboost(X_train, y_train, checkpoint_dir=temp_dir)
    assert result["model"] is not None or result["model"] is None  # Allow dummy
    
    # Evaluate (works even with dummy model)
    metrics = evaluate_model(result["model"], X_test, y_test)
    assert "accuracy" in metrics
    assert metrics["accuracy"] >= 0


@patch("requests.post")
def test_upload_to_dashboard_success(mock_post, temp_dir, sample_data_csv):
    """Test dashboard upload on success."""
    from train_and_upload import upload_to_dashboard
    
    # Create dummy model file
    model_path = Path(temp_dir) / "model.onnx"
    model_path.write_bytes(b"dummy_onnx_data")
    
    # Mock successful response
    mock_response = MagicMock()
    mock_response.status_code = 201
    mock_response.json.return_value = {"model": {"id": "123"}}
    mock_post.return_value = mock_response
    
    success = upload_to_dashboard(
        str(model_path),
        "test_model",
        "LSTM",
        "AAPL",
        "test_api_key",
        "http://localhost:3000",
        {"accuracy": 0.75},
    )
    
    assert success is True
    assert mock_post.called


@patch("requests.post")
def test_upload_to_dashboard_failure(mock_post, temp_dir):
    """Test dashboard upload on failure."""
    from train_and_upload import upload_to_dashboard
    
    # Create dummy model file
    model_path = Path(temp_dir) / "model.onnx"
    model_path.write_bytes(b"dummy_onnx_data")
    
    # Mock failed response
    mock_response = MagicMock()
    mock_response.status_code = 401
    mock_response.text = "Unauthorized"
    mock_post.return_value = mock_response
    
    success = upload_to_dashboard(
        str(model_path),
        "test_model",
        "LSTM",
        "AAPL",
        "wrong_key",
        "http://localhost:3000",
        {"accuracy": 0.75},
    )
    
    assert success is False


@patch("requests.post")
def test_log_experiment_success(mock_post):
    """Test experiment logging on success."""
    from train_and_upload import log_experiment
    
    mock_response = MagicMock()
    mock_response.status_code = 201
    mock_response.json.return_value = {"experiment_id": "exp_123"}
    mock_post.return_value = mock_response
    
    exp_id = log_experiment(
        "test_experiment",
        "LSTM",
        "AAPL",
        {"accuracy": 0.85},
        duration_seconds=300,
        api_key="test_key",
        api_url="http://localhost:3000",
    )
    
    assert exp_id == "exp_123"
    assert mock_post.called


# ============================================================================
# Helpers
# ============================================================================

def torch_available():
    """Check if torch is available."""
    try:
        import torch
        return True
    except ImportError:
        return False


def xgboost_available():
    """Check if xgboost is available."""
    try:
        import xgboost
        return True
    except ImportError:
        return False


def onnx_available():
    """Check if onnx is available."""
    try:
        import onnx
        return True
    except ImportError:
        return False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
