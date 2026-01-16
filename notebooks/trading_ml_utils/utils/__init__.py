"""
Utils Module
============

Provides utility functions and helpers:
- Custom error classes with beginner-friendly messages
- Interactive widgets for Colab notebooks
- Visualization utilities
"""

from .errors import (
    TradingMLError,
    DataFetchError,
    PreprocessingError,
    CheckpointError,
    DashboardAPIError,
    RateLimitError,
    ModelError
)
from .widgets import ConfigWidget, ProgressWidget
from .visualizers import TrainingVisualizer, plot_training_history

__all__ = [
    "TradingMLError",
    "DataFetchError",
    "PreprocessingError",
    "CheckpointError",
    "DashboardAPIError",
    "RateLimitError",
    "ModelError",
    "ConfigWidget",
    "ProgressWidget",
    "TrainingVisualizer",
    "plot_training_history",
]
