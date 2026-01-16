"""
Trading ML Utilities Package
===========================

A comprehensive Python package for ML model training in Google Colab,
designed for the Traycer trading dashboard.

This package provides:
- Data fetching from multiple market data sources
- Data preprocessing and feature engineering
- Neural network and tree-based model architectures
- Training loops with progress tracking
- HDF5-based checkpoint system for session recovery
- Dashboard API client for experiment tracking
- Interactive widgets for Colab notebooks
- Beginner-friendly error handling

Usage in Colab:
    # Mount Google Drive first
    from google.colab import drive
    drive.mount('/content/drive')
    
    # Add package to path
    import sys
    sys.path.append('/content/drive/MyDrive/trading_ml_utils')
    
    # Import modules
    from trading_ml_utils.data import DataFetcher
    from trading_ml_utils.checkpoints import CheckpointManager
    from trading_ml_utils.dashboard import DashboardClient
"""

__version__ = "1.0.0"
__author__ = "Traycer Team"

from .data import DataFetcher, DataPreprocessor, DataValidator
from .checkpoints import CheckpointManager
from .dashboard import DashboardClient
from .utils.errors import TradingMLError, DataFetchError, CheckpointError, DashboardAPIError

__all__ = [
    "DataFetcher",
    "DataPreprocessor", 
    "DataValidator",
    "CheckpointManager",
    "DashboardClient",
    "TradingMLError",
    "DataFetchError",
    "CheckpointError",
    "DashboardAPIError",
]
