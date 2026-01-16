"""
Checkpoints Module
==================

Provides HDF5-based checkpoint management for session recovery
and model persistence.
"""

from .manager import CheckpointManager

__all__ = ["CheckpointManager"]
