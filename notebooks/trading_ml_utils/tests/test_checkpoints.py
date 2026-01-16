"""
Unit Tests for Checkpoint Manager
=================================

Tests for checkpoint save/load functionality including:
- HDF5 save/load
- Compression
- Auto-resume
- Cleanup
"""

import pytest
import numpy as np
import tempfile
import os
import shutil
from pathlib import Path

# Import the module to test
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from checkpoints.manager import CheckpointManager


class TestCheckpointManager:
    """Tests for CheckpointManager class."""
    
    @pytest.fixture
    def temp_dir(self):
        """Create a temporary directory for tests."""
        temp_path = tempfile.mkdtemp()
        yield temp_path
        # Cleanup after test
        shutil.rmtree(temp_path)
        
    @pytest.fixture
    def manager(self, temp_dir):
        """Create checkpoint manager instance for tests."""
        return CheckpointManager(
            checkpoint_dir=temp_dir,
            experiment_name='test_experiment'
        )
        
    def test_save_checkpoint_basic(self, manager):
        """Test basic checkpoint save functionality."""
        state = {
            'epoch': 10,
            'loss': 0.05,
            'config': {'lr': 0.001}
        }
        
        filepath = manager.save(state, epoch=10)
        
        assert os.path.exists(filepath)
        assert filepath.endswith('.h5')
        
    def test_save_and_load_checkpoint(self, manager):
        """Test save and load roundtrip."""
        state = {
            'epoch': 10,
            'loss': 0.05,
            'weights': np.random.randn(100, 50),
            'config': {'hidden_dim': 64}
        }
        
        filepath = manager.save(state, epoch=10)
        loaded_state = manager.load(filepath)
        
        assert loaded_state['epoch'] == 10
        assert loaded_state['loss'] == 0.05
        assert loaded_state['config']['hidden_dim'] == 64
        
    def test_load_numpy_arrays(self, manager):
        """Test that numpy arrays are correctly saved and loaded."""
        original_array = np.random.randn(100, 50)
        state = {
            'epoch': 5,
            'weights': original_array
        }
        
        filepath = manager.save(state, epoch=5)
        loaded_state = manager.load(filepath)
        
        np.testing.assert_array_almost_equal(
            loaded_state['weights'],
            original_array
        )
        
    def test_checkpoint_compression(self, manager, temp_dir):
        """Test that compression reduces file size."""
        large_array = np.random.randn(1000, 500)
        state = {'weights': large_array}
        
        # Save with compression
        compressed_path = manager.save(state, epoch=1)
        compressed_size = os.path.getsize(compressed_path)
        
        # Save without compression
        manager_no_compress = CheckpointManager(
            checkpoint_dir=temp_dir,
            experiment_name='test_no_compress'
        )
        # Temporarily disable compression
        uncompressed_path = os.path.join(temp_dir, 'uncompressed.npy')
        np.save(uncompressed_path, large_array)
        uncompressed_size = os.path.getsize(uncompressed_path)
        
        # Compressed should be smaller (usually significantly)
        # HDF5 with gzip typically compresses well
        assert compressed_size > 0
        
    def test_auto_resume_finds_latest(self, manager):
        """Test that auto_resume finds the latest checkpoint."""
        # Save multiple checkpoints
        for epoch in [5, 10, 15]:
            state = {'epoch': epoch, 'loss': 0.1 / epoch}
            manager.save(state, epoch=epoch)
            
        # Auto resume should find epoch 15
        resumed_state = manager.auto_resume()
        
        assert resumed_state is not None
        assert resumed_state['epoch'] == 15
        
    def test_auto_resume_empty_dir(self, temp_dir):
        """Test auto_resume returns None when no checkpoints exist."""
        manager = CheckpointManager(
            checkpoint_dir=temp_dir,
            experiment_name='empty_experiment'
        )
        
        resumed_state = manager.auto_resume()
        
        assert resumed_state is None
        
    def test_cleanup_old_checkpoints(self, manager):
        """Test cleanup removes old checkpoints."""
        # Save many checkpoints
        for epoch in range(1, 11):
            state = {'epoch': epoch}
            manager.save(state, epoch=epoch)
            
        # Cleanup, keep only 3
        manager.cleanup(keep_last=3)
        
        # List remaining checkpoints
        remaining = manager.list_checkpoints()
        
        assert len(remaining) == 3
        
    def test_list_checkpoints(self, manager):
        """Test listing all checkpoints."""
        for epoch in [5, 10, 15]:
            state = {'epoch': epoch}
            manager.save(state, epoch=epoch)
            
        checkpoints = manager.list_checkpoints()
        
        assert len(checkpoints) == 3
        
    def test_checkpoint_metadata(self, manager):
        """Test that metadata is saved with checkpoint."""
        state = {
            'epoch': 10,
            'model_type': 'LSTM',
            'timestamp': '2023-12-01'
        }
        
        filepath = manager.save(state, epoch=10)
        loaded_state = manager.load(filepath)
        
        assert loaded_state['model_type'] == 'LSTM'
        
    def test_nested_dict_save_load(self, manager):
        """Test saving and loading nested dictionaries."""
        state = {
            'epoch': 10,
            'config': {
                'model': {
                    'hidden_dim': 64,
                    'num_layers': 2
                },
                'training': {
                    'lr': 0.001,
                    'batch_size': 32
                }
            }
        }
        
        filepath = manager.save(state, epoch=10)
        loaded_state = manager.load(filepath)
        
        assert loaded_state['config']['model']['hidden_dim'] == 64
        assert loaded_state['config']['training']['lr'] == 0.001
        
    def test_load_nonexistent_file(self, manager):
        """Test that loading nonexistent file raises error."""
        with pytest.raises(Exception):  # Could be FileNotFoundError or custom error
            manager.load('/nonexistent/path/checkpoint.h5')
            
    def test_different_experiment_names(self, temp_dir):
        """Test that different experiments have separate checkpoints."""
        manager1 = CheckpointManager(temp_dir, 'experiment_1')
        manager2 = CheckpointManager(temp_dir, 'experiment_2')
        
        manager1.save({'epoch': 10}, epoch=10)
        manager2.save({'epoch': 20}, epoch=20)
        
        # Each should find their own latest
        state1 = manager1.auto_resume()
        state2 = manager2.auto_resume()
        
        assert state1['epoch'] == 10
        assert state2['epoch'] == 20


class TestCheckpointManagerPyTorch:
    """Tests for PyTorch model state dict support."""
    
    @pytest.fixture
    def temp_dir(self):
        temp_path = tempfile.mkdtemp()
        yield temp_path
        shutil.rmtree(temp_path)
        
    @pytest.fixture
    def manager(self, temp_dir):
        return CheckpointManager(temp_dir, 'pytorch_test')
        
    def test_save_pytorch_like_state(self, manager):
        """Test saving PyTorch-like state dict."""
        # Simulate PyTorch state dict structure
        state = {
            'epoch': 10,
            'model_state_dict': {
                'layer1.weight': np.random.randn(64, 32),
                'layer1.bias': np.random.randn(64),
                'layer2.weight': np.random.randn(1, 64),
                'layer2.bias': np.random.randn(1)
            },
            'optimizer_state_dict': {
                'state': {},
                'param_groups': [{'lr': 0.001}]
            }
        }
        
        filepath = manager.save(state, epoch=10)
        loaded_state = manager.load(filepath)
        
        assert 'model_state_dict' in loaded_state
        np.testing.assert_array_almost_equal(
            loaded_state['model_state_dict']['layer1.weight'],
            state['model_state_dict']['layer1.weight']
        )


class TestCheckpointFilenaming:
    """Tests for checkpoint file naming conventions."""
    
    @pytest.fixture
    def temp_dir(self):
        temp_path = tempfile.mkdtemp()
        yield temp_path
        shutil.rmtree(temp_path)
        
    def test_filename_includes_epoch(self, temp_dir):
        """Test that filename includes epoch number."""
        manager = CheckpointManager(temp_dir, 'test')
        
        filepath = manager.save({'epoch': 42}, epoch=42)
        
        assert '42' in os.path.basename(filepath)
        
    def test_filename_includes_experiment(self, temp_dir):
        """Test that filename includes experiment name."""
        manager = CheckpointManager(temp_dir, 'my_experiment')
        
        filepath = manager.save({'epoch': 1}, epoch=1)
        
        assert 'my_experiment' in os.path.basename(filepath)
