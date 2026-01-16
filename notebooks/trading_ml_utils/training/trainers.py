"""
Model Trainers Module
=====================

Provides training loops and utilities for neural network and tree-based models.

Features:
- Training loops with progress tracking
- Early stopping
- Learning rate scheduling
- Checkpoint saving during training
- Verbose and quiet training modes

Example Usage:
    from trading_ml_utils.training import Trainer, train_model
    
    # Using Trainer class
    trainer = Trainer(model, verbose=True)
    history = trainer.fit(X_train, y_train, X_val, y_val, epochs=100)
    
    # Or use convenience function
    model, history = train_model(model, X_train, y_train, epochs=100)
"""

import time
import logging
from typing import Optional, Dict, Any, Callable, List, Tuple

import numpy as np

logger = logging.getLogger(__name__)


class TrainingHistory:
    """
    Stores training history and metrics.
    
    Attributes:
        train_loss: List of training losses per epoch
        val_loss: List of validation losses per epoch
        train_metrics: Dictionary of additional training metrics
        val_metrics: Dictionary of additional validation metrics
        metadata: Training metadata
    """
    
    def __init__(self):
        self.train_loss: List[float] = []
        self.val_loss: List[float] = []
        self.train_metrics: Dict[str, List[float]] = {}
        self.val_metrics: Dict[str, List[float]] = {}
        self.metadata: Dict[str, Any] = {}
        self.best_epoch: int = 0
        self.best_val_loss: float = float('inf')
        
    def add_epoch(
        self,
        train_loss: float,
        val_loss: Optional[float] = None,
        **metrics
    ):
        """Record metrics for one epoch."""
        self.train_loss.append(train_loss)
        
        if val_loss is not None:
            self.val_loss.append(val_loss)
            if val_loss < self.best_val_loss:
                self.best_val_loss = val_loss
                self.best_epoch = len(self.train_loss) - 1
                
        for name, value in metrics.items():
            if name.startswith('val_'):
                if name not in self.val_metrics:
                    self.val_metrics[name] = []
                self.val_metrics[name].append(value)
            else:
                if name not in self.train_metrics:
                    self.train_metrics[name] = []
                self.train_metrics[name].append(value)
                
    def to_dict(self) -> Dict[str, Any]:
        """Convert history to dictionary."""
        return {
            'train_loss': self.train_loss,
            'val_loss': self.val_loss,
            'train_metrics': self.train_metrics,
            'val_metrics': self.val_metrics,
            'best_epoch': self.best_epoch,
            'best_val_loss': self.best_val_loss,
            'metadata': self.metadata
        }


class EarlyStopping:
    """
    Early stopping callback to prevent overfitting.
    
    Monitors validation loss and stops training if it doesn't improve
    for a specified number of epochs.
    
    Args:
        patience: Number of epochs to wait for improvement
        min_delta: Minimum change to qualify as improvement
        restore_best: Whether to restore best model weights
        
    Example:
        early_stop = EarlyStopping(patience=10)
        
        for epoch in range(epochs):
            # ... training code ...
            if early_stop(val_loss):
                print("Early stopping triggered!")
                break
    """
    
    def __init__(
        self,
        patience: int = 10,
        min_delta: float = 1e-4,
        restore_best: bool = True
    ):
        self.patience = patience
        self.min_delta = min_delta
        self.restore_best = restore_best
        self.counter = 0
        self.best_loss = float('inf')
        self.best_weights = None
        self.stopped_epoch = 0
        
    def __call__(self, val_loss: float, model: Any = None) -> bool:
        """
        Check if training should stop.
        
        Args:
            val_loss: Current validation loss
            model: Model to save weights from
            
        Returns:
            True if training should stop
        """
        if val_loss < self.best_loss - self.min_delta:
            self.best_loss = val_loss
            self.counter = 0
            if self.restore_best and model is not None:
                self.best_weights = self._get_weights(model)
        else:
            self.counter += 1
            if self.counter >= self.patience:
                return True
        return False
        
    def _get_weights(self, model):
        """Get model weights for restoration."""
        if hasattr(model, 'state_dict'):
            import torch
            return {k: v.cpu().clone() for k, v in model.state_dict().items()}
        return None
        
    def restore_weights(self, model):
        """Restore best weights to model."""
        if self.best_weights is not None and hasattr(model, 'load_state_dict'):
            model.load_state_dict(self.best_weights)


class Trainer:
    """
    Unified trainer for neural network models.
    
    Handles training loops with:
    - Progress tracking and logging
    - Early stopping
    - Learning rate scheduling
    - Checkpoint saving
    - Verbose/quiet modes
    
    Args:
        model: Neural network model to train
        optimizer: Optimizer (default: Adam)
        criterion: Loss function (default: MSE)
        device: Device to train on ('cuda' or 'cpu')
        verbose: Print training progress
        
    Example:
        trainer = Trainer(model, verbose=True)
        
        history = trainer.fit(
            X_train, y_train,
            X_val, y_val,
            epochs=100,
            batch_size=32,
            early_stopping=True,
            patience=10
        )
        
        print(f"Best validation loss: {history.best_val_loss:.4f}")
    """
    
    def __init__(
        self,
        model: Any,
        optimizer: Any = None,
        criterion: Any = None,
        device: Optional[str] = None,
        verbose: bool = True
    ):
        import torch
        import torch.nn as nn
        
        self.model = model
        self.verbose = verbose
        
        # Set device
        if device is None:
            self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        else:
            self.device = torch.device(device)
            
        # Get the actual torch module
        if hasattr(model, 'module'):
            self._torch_model = model.module
        elif hasattr(model, '_model'):
            self._torch_model = model._model
        else:
            self._torch_model = model
            
        self._torch_model.to(self.device)
        
        # Set optimizer
        if optimizer is None:
            self.optimizer = torch.optim.Adam(self._torch_model.parameters(), lr=0.001)
        else:
            self.optimizer = optimizer
            
        # Set criterion
        if criterion is None:
            self.criterion = nn.MSELoss()
        else:
            self.criterion = criterion
            
        self.history = TrainingHistory()
        
    def fit(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: Optional[np.ndarray] = None,
        y_val: Optional[np.ndarray] = None,
        epochs: int = 100,
        batch_size: int = 32,
        learning_rate: float = 0.001,
        early_stopping: bool = True,
        patience: int = 10,
        checkpoint_callback: Optional[Callable] = None
    ) -> TrainingHistory:
        """
        Train the model.
        
        Args:
            X_train: Training features
            y_train: Training targets
            X_val: Validation features (optional)
            y_val: Validation targets (optional)
            epochs: Number of training epochs
            batch_size: Batch size
            learning_rate: Learning rate
            early_stopping: Enable early stopping
            patience: Early stopping patience
            checkpoint_callback: Function called after each epoch
            
        Returns:
            TrainingHistory object
        """
        import torch
        
        if self.verbose:
            print("🚀 Starting training...")
            print(f"   Device: {self.device}")
            print(f"   Epochs: {epochs}")
            print(f"   Batch size: {batch_size}")
            print(f"   Learning rate: {learning_rate}")
            print("=" * 50)
            
        # Update learning rate
        for param_group in self.optimizer.param_groups:
            param_group['lr'] = learning_rate
            
        # Convert to tensors
        X_train = torch.FloatTensor(X_train).to(self.device)
        y_train = torch.FloatTensor(y_train).to(self.device)
        
        if y_train.dim() == 1:
            y_train = y_train.unsqueeze(-1)
            
        has_validation = X_val is not None and y_val is not None
        if has_validation:
            X_val = torch.FloatTensor(X_val).to(self.device)
            y_val = torch.FloatTensor(y_val).to(self.device)
            if y_val.dim() == 1:
                y_val = y_val.unsqueeze(-1)
                
        # Setup early stopping
        early_stopper = None
        if early_stopping and has_validation:
            early_stopper = EarlyStopping(patience=patience)
            
        # Training loop
        n_samples = len(X_train)
        n_batches = (n_samples + batch_size - 1) // batch_size
        
        start_time = time.time()
        best_model_state = None
        
        for epoch in range(epochs):
            epoch_start = time.time()
            
            # Training
            self._torch_model.train()
            train_loss = 0.0
            
            # Shuffle data
            indices = torch.randperm(n_samples)
            X_train_shuffled = X_train[indices]
            y_train_shuffled = y_train[indices]
            
            for i in range(0, n_samples, batch_size):
                batch_X = X_train_shuffled[i:i+batch_size]
                batch_y = y_train_shuffled[i:i+batch_size]
                
                self.optimizer.zero_grad()
                outputs = self._torch_model(batch_X)
                loss = self.criterion(outputs, batch_y)
                loss.backward()
                self.optimizer.step()
                
                train_loss += loss.item()
                
            train_loss /= n_batches
            
            # Validation
            val_loss = None
            if has_validation:
                self._torch_model.eval()
                with torch.no_grad():
                    val_outputs = self._torch_model(X_val)
                    val_loss = self.criterion(val_outputs, y_val).item()
                    
            # Record history
            self.history.add_epoch(train_loss, val_loss)
            
            # Save best model
            if val_loss is not None and val_loss <= self.history.best_val_loss:
                best_model_state = {k: v.cpu().clone() for k, v in self._torch_model.state_dict().items()}
                
            # Print progress
            if self.verbose:
                epoch_time = time.time() - epoch_start
                if val_loss is not None:
                    print(f"Epoch {epoch+1:3d}/{epochs} | "
                          f"Train Loss: {train_loss:.6f} | "
                          f"Val Loss: {val_loss:.6f} | "
                          f"Time: {epoch_time:.1f}s")
                else:
                    print(f"Epoch {epoch+1:3d}/{epochs} | "
                          f"Train Loss: {train_loss:.6f} | "
                          f"Time: {epoch_time:.1f}s")
                          
            # Checkpoint callback
            if checkpoint_callback:
                checkpoint_callback(epoch, train_loss, val_loss)
                
            # Early stopping
            if early_stopper and val_loss is not None:
                if early_stopper(val_loss, self._torch_model):
                    if self.verbose:
                        print(f"\n⚡ Early stopping at epoch {epoch+1}")
                    break
                    
        # Restore best model
        if best_model_state is not None:
            self._torch_model.load_state_dict(best_model_state)
            
        total_time = time.time() - start_time
        self.history.metadata['total_time_seconds'] = total_time
        self.history.metadata['epochs_trained'] = len(self.history.train_loss)
        
        if self.verbose:
            print("=" * 50)
            print(f"✅ Training complete!")
            print(f"   Total time: {total_time:.1f}s")
            print(f"   Best validation loss: {self.history.best_val_loss:.6f} (epoch {self.history.best_epoch + 1})")
            
        return self.history
        
    def predict(self, X: np.ndarray) -> np.ndarray:
        """Make predictions with the trained model."""
        import torch
        
        self._torch_model.eval()
        with torch.no_grad():
            X_tensor = torch.FloatTensor(X).to(self.device)
            predictions = self._torch_model(X_tensor)
            return predictions.cpu().numpy()


def train_model(
    model: Any,
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_val: Optional[np.ndarray] = None,
    y_val: Optional[np.ndarray] = None,
    epochs: int = 100,
    batch_size: int = 32,
    learning_rate: float = 0.001,
    verbose: bool = True,
    **kwargs
) -> Tuple[Any, TrainingHistory]:
    """
    Convenience function to train a model.
    
    This is a simpler interface than using the Trainer class directly.
    
    Args:
        model: Model to train (neural network or tree-based)
        X_train: Training features
        y_train: Training targets
        X_val: Validation features
        y_val: Validation targets
        epochs: Number of epochs (neural networks only)
        batch_size: Batch size (neural networks only)
        learning_rate: Learning rate (neural networks only)
        verbose: Print progress
        **kwargs: Additional training arguments
        
    Returns:
        Tuple of (trained_model, history)
        
    Example:
        # Train neural network
        model, history = train_model(lstm_model, X_train, y_train, epochs=100)
        
        # Train tree model
        model, history = train_model(rf_model, X_train, y_train)
    """
    # Check if it's a tree-based model
    is_tree_model = (
        hasattr(model, 'sklearn_model') or 
        hasattr(model, 'xgb_model') or
        (hasattr(model, '_model') and hasattr(model._model, 'fit'))
    )
    
    if is_tree_model:
        # Train tree-based model
        history = TrainingHistory()
        start_time = time.time()
        
        eval_set = [(X_val, y_val)] if X_val is not None else None
        model.fit(X_train, y_train, eval_set=eval_set, verbose=verbose)
        
        # Create simple history
        history.metadata['total_time_seconds'] = time.time() - start_time
        history.metadata['model_type'] = 'tree'
        
        return model, history
        
    else:
        # Train neural network
        trainer = Trainer(model, verbose=verbose)
        history = trainer.fit(
            X_train, y_train,
            X_val, y_val,
            epochs=epochs,
            batch_size=batch_size,
            learning_rate=learning_rate,
            **kwargs
        )
        
        return model, history
