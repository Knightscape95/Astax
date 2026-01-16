"""
Checkpoint Manager Module
=========================

Provides HDF5-based checkpoint management for:
- Session recovery after Colab disconnections
- Saving/loading training state
- Automatic checkpointing during training
- Checkpoint versioning and cleanup

HDF5 is used because:
- Efficient storage for large numerical arrays
- Cross-platform compatibility
- Supports hierarchical data organization
- Faster I/O than pickle for large datasets
- Survives Python version changes

Example Usage:
    from trading_ml_utils.checkpoints import CheckpointManager
    
    # Initialize manager
    manager = CheckpointManager(
        checkpoint_dir='/content/drive/MyDrive/checkpoints',
        experiment_name='lstm_experiment'
    )
    
    # Save checkpoint
    manager.save({
        'config': config_dict,
        'data': X_train,
        'model_state': model.state_dict(),
        'epoch': 50,
        'best_loss': 0.001
    })
    
    # Load checkpoint
    checkpoint = manager.load()
    if checkpoint:
        X_train = checkpoint['data']
        model.load_state_dict(checkpoint['model_state'])
"""

import os
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime
from dataclasses import dataclass

import numpy as np

from ..utils.errors import CheckpointError

logger = logging.getLogger(__name__)


@dataclass
class CheckpointInfo:
    """
    Information about a saved checkpoint.
    
    Attributes:
        filepath: Path to the checkpoint file
        timestamp: When the checkpoint was created
        experiment_name: Name of the experiment
        step: Training step or epoch
        size_mb: File size in megabytes
        metadata: Additional checkpoint metadata
    """
    filepath: str
    timestamp: datetime
    experiment_name: str
    step: int
    size_mb: float
    metadata: Dict[str, Any]


class CheckpointManager:
    """
    HDF5-based checkpoint manager for training sessions.
    
    Handles saving and loading checkpoints with:
    - Automatic compression for large arrays
    - Session recovery after disconnections
    - Checkpoint versioning
    - Automatic cleanup of old checkpoints
    
    Args:
        checkpoint_dir: Directory to store checkpoints
        experiment_name: Name of the current experiment
        max_checkpoints: Maximum number of checkpoints to keep
        compression: HDF5 compression level (0-9)
        
    Example:
        manager = CheckpointManager(
            checkpoint_dir='/content/drive/MyDrive/checkpoints',
            experiment_name='my_experiment'
        )
        
        # Save during training
        for epoch in range(100):
            # ... training code ...
            manager.save({
                'epoch': epoch,
                'model_state': model.state_dict(),
                'optimizer_state': optimizer.state_dict(),
                'train_loss': train_loss
            })
            
        # Auto-resume in new session
        checkpoint = manager.auto_resume()
        if checkpoint:
            start_epoch = checkpoint['epoch']
            model.load_state_dict(checkpoint['model_state'])
    """
    
    def __init__(
        self,
        checkpoint_dir: str = './checkpoints',
        experiment_name: str = 'experiment',
        max_checkpoints: int = 5,
        compression: int = 4
    ):
        self.checkpoint_dir = checkpoint_dir
        self.experiment_name = experiment_name
        self.max_checkpoints = max_checkpoints
        self.compression = compression
        
        # Create checkpoint directory
        os.makedirs(checkpoint_dir, exist_ok=True)
        
        # Check for h5py
        self._h5py = None
        self._check_h5py()
        
    def _check_h5py(self):
        """Check that h5py is installed."""
        try:
            import h5py
            self._h5py = h5py
        except ImportError:
            raise CheckpointError(
                "h5py is not installed!\n\n"
                "💡 Fix: Run this command:\n"
                "   !pip install h5py\n\n"
                "h5py is required for efficient checkpoint storage."
            )
            
    def save(
        self,
        checkpoint_data: Dict[str, Any],
        step: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Save a checkpoint to disk.
        
        Supports saving:
        - NumPy arrays (efficiently compressed)
        - Python scalars (int, float, str, bool)
        - Dictionaries and lists (as JSON)
        - PyTorch state dicts (as nested arrays)
        
        Args:
            checkpoint_data: Dictionary of data to save
            step: Training step/epoch number
            metadata: Additional metadata to include
            
        Returns:
            Path to saved checkpoint file
            
        Example:
            manager.save({
                'config': {'learning_rate': 0.001},
                'X_train': X_train,
                'model_state': model.state_dict(),
                'epoch': 50
            })
        """
        # Generate filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        step_str = f'_step{step}' if step is not None else ''
        filename = f'{self.experiment_name}{step_str}_{timestamp}.h5'
        filepath = os.path.join(self.checkpoint_dir, filename)
        
        print(f"💾 Saving checkpoint to {filepath}...")
        
        # Prepare metadata
        full_metadata = {
            'experiment_name': self.experiment_name,
            'timestamp': timestamp,
            'step': step,
            'save_time': datetime.now().isoformat()
        }
        if metadata:
            full_metadata.update(metadata)
            
        # Save to HDF5
        with self._h5py.File(filepath, 'w') as f:
            # Save metadata as attributes
            for key, value in full_metadata.items():
                if value is not None:
                    f.attrs[key] = json.dumps(value) if isinstance(value, (dict, list)) else value
                    
            # Save checkpoint data
            self._save_recursive(f, checkpoint_data)
            
        # Get file size
        size_mb = os.path.getsize(filepath) / (1024 * 1024)
        print(f"   ✅ Checkpoint saved ({size_mb:.2f} MB)")
        
        # Cleanup old checkpoints
        self._cleanup_old_checkpoints()
        
        return filepath
        
    def _save_recursive(
        self,
        group,
        data: Dict[str, Any],
        path: str = ''
    ):
        """Recursively save data to HDF5 group."""
        for key, value in data.items():
            item_path = f'{path}/{key}' if path else key
            
            try:
                if isinstance(value, np.ndarray):
                    # Save numpy array with compression
                    group.create_dataset(
                        key,
                        data=value,
                        compression='gzip',
                        compression_opts=self.compression
                    )
                    
                elif isinstance(value, dict):
                    # Check if it's a PyTorch state dict
                    if self._is_torch_state_dict(value):
                        subgroup = group.create_group(key)
                        subgroup.attrs['_type'] = 'torch_state_dict'
                        self._save_torch_state_dict(subgroup, value)
                    else:
                        # Regular dict - create subgroup
                        subgroup = group.create_group(key)
                        subgroup.attrs['_type'] = 'dict'
                        self._save_recursive(subgroup, value, item_path)
                        
                elif isinstance(value, (list, tuple)):
                    # Save as JSON if contains non-numeric data
                    try:
                        arr = np.array(value)
                        group.create_dataset(key, data=arr)
                    except (ValueError, TypeError):
                        group.attrs[key] = json.dumps(value)
                        
                elif isinstance(value, (int, float, str, bool)):
                    # Save scalar as attribute
                    group.attrs[key] = value
                    
                elif value is None:
                    group.attrs[key] = 'null'
                    
                else:
                    # Try to serialize as JSON
                    try:
                        group.attrs[key] = json.dumps(value)
                    except (TypeError, ValueError):
                        logger.warning(f"Could not save {key}: unsupported type {type(value)}")
                        
            except Exception as e:
                logger.warning(f"Error saving {key}: {e}")
                
    def _is_torch_state_dict(self, d: dict) -> bool:
        """Check if a dict looks like a PyTorch state dict."""
        if not d:
            return False
        # State dicts typically have keys like 'layer.weight', 'layer.bias'
        first_value = next(iter(d.values()))
        try:
            import torch
            return isinstance(first_value, (torch.Tensor, np.ndarray))
        except ImportError:
            return isinstance(first_value, np.ndarray)
            
    def _save_torch_state_dict(self, group, state_dict: dict):
        """Save a PyTorch state dict."""
        for key, value in state_dict.items():
            # Convert tensor to numpy
            if hasattr(value, 'cpu'):
                value = value.cpu().numpy()
            elif hasattr(value, 'numpy'):
                value = value.numpy()
                
            if isinstance(value, np.ndarray):
                group.create_dataset(
                    key.replace('/', '_'),  # HDF5 doesn't like / in names
                    data=value,
                    compression='gzip',
                    compression_opts=self.compression
                )
            else:
                group.attrs[key] = value
                
    def load(
        self,
        filepath: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Load a checkpoint from disk.
        
        Args:
            filepath: Specific checkpoint file to load.
                     If None, loads the most recent checkpoint.
                     
        Returns:
            Dictionary containing checkpoint data, or None if not found
            
        Example:
            checkpoint = manager.load()
            if checkpoint:
                X_train = checkpoint['X_train']
                epoch = checkpoint['epoch']
        """
        if filepath is None:
            # Find most recent checkpoint
            checkpoints = self.list_checkpoints()
            if not checkpoints:
                print("📂 No checkpoints found")
                return None
            filepath = checkpoints[0].filepath
            
        if not os.path.exists(filepath):
            print(f"⚠️ Checkpoint not found: {filepath}")
            return None
            
        print(f"📂 Loading checkpoint from {filepath}...")
        
        checkpoint_data = {}
        
        with self._h5py.File(filepath, 'r') as f:
            # Load metadata from attributes
            metadata = {}
            for key, value in f.attrs.items():
                if key.startswith('_'):
                    continue
                try:
                    metadata[key] = json.loads(value) if isinstance(value, str) and value.startswith('{') else value
                except:
                    metadata[key] = value
            checkpoint_data['_metadata'] = metadata
            
            # Load data recursively
            self._load_recursive(f, checkpoint_data)
            
        print("   ✅ Checkpoint loaded successfully")
        
        return checkpoint_data
        
    def _load_recursive(
        self,
        group,
        data: dict
    ):
        """Recursively load data from HDF5 group."""
        for key in group.keys():
            item = group[key]
            
            if isinstance(item, self._h5py.Dataset):
                # Load array
                data[key] = item[:]
                
            elif isinstance(item, self._h5py.Group):
                # Check type
                item_type = item.attrs.get('_type', 'dict')
                
                if item_type == 'torch_state_dict':
                    data[key] = self._load_torch_state_dict(item)
                else:
                    data[key] = {}
                    self._load_recursive(item, data[key])
                    
        # Load attributes
        for key, value in group.attrs.items():
            if key.startswith('_'):
                continue
            if key not in data:
                try:
                    data[key] = json.loads(value) if isinstance(value, str) and value.startswith('[') else value
                except:
                    data[key] = value
                    
    def _load_torch_state_dict(self, group) -> dict:
        """Load a PyTorch state dict from HDF5 group."""
        state_dict = {}
        
        try:
            import torch
            
            for key in group.keys():
                # Restore original key (we replaced / with _)
                original_key = key.replace('_', '.')
                data = group[key][:]
                state_dict[original_key] = torch.from_numpy(data)
                
            for key, value in group.attrs.items():
                if not key.startswith('_'):
                    state_dict[key] = value
                    
        except ImportError:
            # Return numpy arrays if torch not available
            for key in group.keys():
                state_dict[key] = group[key][:]
                
        return state_dict
        
    def auto_resume(self) -> Optional[Dict[str, Any]]:
        """
        Automatically find and load the most recent checkpoint.
        
        Use this at the start of your notebook to resume from
        where you left off after a Colab disconnection.
        
        Returns:
            Most recent checkpoint data, or None if no checkpoints exist
            
        Example:
            manager = CheckpointManager(checkpoint_dir='...')
            
            # At notebook start
            checkpoint = manager.auto_resume()
            if checkpoint:
                print(f"Resuming from epoch {checkpoint['epoch']}")
                start_epoch = checkpoint['epoch']
            else:
                print("Starting fresh")
                start_epoch = 0
        """
        checkpoints = self.list_checkpoints()
        
        if not checkpoints:
            print("📂 No previous checkpoints found. Starting fresh!")
            return None
            
        latest = checkpoints[0]
        
        print("=" * 50)
        print("🔄 Found previous session!")
        print(f"   Experiment: {latest.experiment_name}")
        print(f"   Saved: {latest.timestamp}")
        print(f"   Step: {latest.step}")
        print(f"   Size: {latest.size_mb:.2f} MB")
        print("=" * 50)
        
        return self.load(latest.filepath)
        
    def list_checkpoints(self) -> List[CheckpointInfo]:
        """
        List all available checkpoints for this experiment.
        
        Returns:
            List of CheckpointInfo objects, sorted by timestamp (newest first)
        """
        checkpoints = []
        
        for filename in os.listdir(self.checkpoint_dir):
            if not filename.endswith('.h5'):
                continue
                
            filepath = os.path.join(self.checkpoint_dir, filename)
            
            try:
                with self._h5py.File(filepath, 'r') as f:
                    # Get metadata
                    exp_name = f.attrs.get('experiment_name', 'unknown')
                    timestamp_str = f.attrs.get('timestamp', '')
                    step = f.attrs.get('step', 0)
                    
                    try:
                        timestamp = datetime.strptime(timestamp_str, '%Y%m%d_%H%M%S')
                    except:
                        timestamp = datetime.fromtimestamp(os.path.getmtime(filepath))
                        
                    size_mb = os.path.getsize(filepath) / (1024 * 1024)
                    
                    checkpoints.append(CheckpointInfo(
                        filepath=filepath,
                        timestamp=timestamp,
                        experiment_name=str(exp_name),
                        step=int(step) if step else 0,
                        size_mb=size_mb,
                        metadata=dict(f.attrs)
                    ))
                    
            except Exception as e:
                logger.warning(f"Could not read checkpoint {filename}: {e}")
                
        # Sort by timestamp, newest first
        checkpoints.sort(key=lambda x: x.timestamp, reverse=True)
        
        # Filter by experiment name if specified
        if self.experiment_name:
            checkpoints = [c for c in checkpoints if c.experiment_name == self.experiment_name]
            
        return checkpoints
        
    def _cleanup_old_checkpoints(self):
        """Remove old checkpoints exceeding max_checkpoints limit."""
        checkpoints = self.list_checkpoints()
        
        if len(checkpoints) > self.max_checkpoints:
            to_remove = checkpoints[self.max_checkpoints:]
            
            for cp in to_remove:
                try:
                    os.remove(cp.filepath)
                    logger.info(f"Removed old checkpoint: {cp.filepath}")
                except Exception as e:
                    logger.warning(f"Could not remove checkpoint {cp.filepath}: {e}")
                    
    def delete_checkpoint(self, filepath: str) -> bool:
        """
        Delete a specific checkpoint.
        
        Args:
            filepath: Path to checkpoint file
            
        Returns:
            True if deleted successfully
        """
        try:
            os.remove(filepath)
            print(f"🗑️ Deleted checkpoint: {filepath}")
            return True
        except Exception as e:
            print(f"⚠️ Could not delete checkpoint: {e}")
            return False
            
    def clear_all_checkpoints(self) -> int:
        """
        Delete all checkpoints for this experiment.
        
        Returns:
            Number of checkpoints deleted
        """
        checkpoints = self.list_checkpoints()
        deleted = 0
        
        for cp in checkpoints:
            if self.delete_checkpoint(cp.filepath):
                deleted += 1
                
        print(f"🗑️ Deleted {deleted} checkpoints")
        return deleted
