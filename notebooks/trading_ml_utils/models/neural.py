"""
Neural Network Models Module
============================

Provides PyTorch-based neural network architectures for trading ML:
- LSTM: Long Short-Term Memory for sequence prediction
- DNN: Deep Neural Network for feature-based prediction
- Transformer: Attention-based model for sequence data

Example Usage:
    from trading_ml_utils.models import LSTMModel, create_neural_model
    
    # Create LSTM model
    model = LSTMModel(input_dim=1, hidden_dim=64, num_layers=2)
    
    # Or use factory function
    model = create_neural_model('lstm', input_dim=1, hidden_dim=64)
"""

import logging
from typing import Optional, Tuple, Dict, Any

import numpy as np

logger = logging.getLogger(__name__)

# Lazy imports to handle missing PyTorch gracefully
_torch = None
_nn = None


def _get_torch():
    """Lazy import torch to handle missing installation."""
    global _torch, _nn
    if _torch is None:
        try:
            import torch
            import torch.nn as nn
            _torch = torch
            _nn = nn
        except ImportError:
            raise ImportError(
                "PyTorch is not installed!\n\n"
                "💡 Fix: Run this command in a code cell:\n"
                "   !pip install torch\n\n"
                "Then restart the runtime if needed."
            )
    return _torch, _nn


class LSTMModel:
    """
    Long Short-Term Memory (LSTM) model for time series prediction.
    
    LSTM is excellent for learning patterns in sequential data like
    stock prices. It can remember important information from many
    time steps ago.
    
    When to use LSTM:
    - You have sequential/time series data
    - Pattern may depend on events far in the past
    - You want to capture temporal dependencies
    
    Args:
        input_dim: Number of input features (e.g., 1 for just price)
        hidden_dim: Size of LSTM hidden state (larger = more capacity)
        output_dim: Number of outputs (usually 1 for price prediction)
        num_layers: Number of stacked LSTM layers (2-3 is common)
        dropout: Dropout rate for regularization (0-0.5)
        
    Example:
        model = LSTMModel(
            input_dim=1,      # Single feature (close price)
            hidden_dim=64,    # 64 hidden units
            num_layers=2,     # 2 LSTM layers
            dropout=0.2       # 20% dropout
        )
        
        # Forward pass
        predictions = model(x_batch)
    """
    
    def __init__(
        self,
        input_dim: int = 1,
        hidden_dim: int = 64,
        output_dim: int = 1,
        num_layers: int = 2,
        dropout: float = 0.2
    ):
        torch, nn = _get_torch()
        
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.output_dim = output_dim
        self.num_layers = num_layers
        self.dropout = dropout
        
        # Build the PyTorch module
        self._model = self._build_model()
        
        # Device handling
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self._model.to(self.device)
        
    def _build_model(self):
        """Build the internal PyTorch model."""
        torch, nn = _get_torch()
        
        class _LSTMModule(nn.Module):
            def __init__(self, input_dim, hidden_dim, output_dim, num_layers, dropout):
                super().__init__()
                self.hidden_dim = hidden_dim
                self.num_layers = num_layers
                
                self.lstm = nn.LSTM(
                    input_size=input_dim,
                    hidden_size=hidden_dim,
                    num_layers=num_layers,
                    batch_first=True,
                    dropout=dropout if num_layers > 1 else 0
                )
                
                self.fc = nn.Linear(hidden_dim, output_dim)
                
            def forward(self, x):
                # Initialize hidden state
                batch_size = x.size(0)
                h0 = torch.zeros(self.num_layers, batch_size, self.hidden_dim).to(x.device)
                c0 = torch.zeros(self.num_layers, batch_size, self.hidden_dim).to(x.device)
                
                # LSTM forward pass
                out, _ = self.lstm(x, (h0, c0))
                
                # Take output from last time step
                out = self.fc(out[:, -1, :])
                return out
                
        return _LSTMModule(
            self.input_dim,
            self.hidden_dim,
            self.output_dim,
            self.num_layers,
            self.dropout
        )
        
    def __call__(self, x):
        """Forward pass through the model."""
        return self._model(x)
        
    def train(self):
        """Set model to training mode."""
        self._model.train()
        
    def eval(self):
        """Set model to evaluation mode."""
        self._model.eval()
        
    def parameters(self):
        """Get model parameters for optimizer."""
        return self._model.parameters()
        
    def state_dict(self):
        """Get model state dictionary."""
        return self._model.state_dict()
        
    def load_state_dict(self, state_dict):
        """Load model state dictionary."""
        self._model.load_state_dict(state_dict)
        
    def to(self, device):
        """Move model to device."""
        self._model.to(device)
        self.device = device
        return self
        
    @property
    def module(self):
        """Get the underlying PyTorch module."""
        return self._model
        
    def get_config(self) -> Dict[str, Any]:
        """Get model configuration for serialization."""
        return {
            'model_type': 'lstm',
            'input_dim': self.input_dim,
            'hidden_dim': self.hidden_dim,
            'output_dim': self.output_dim,
            'num_layers': self.num_layers,
            'dropout': self.dropout
        }


class DNNModel:
    """
    Deep Neural Network (DNN) model for trading prediction.
    
    DNN is a feedforward neural network with multiple hidden layers.
    It's simpler than LSTM and works well when temporal relationships
    are less important.
    
    When to use DNN:
    - You have fixed-size feature vectors
    - Temporal order is already encoded in features
    - You want a simpler, faster model
    
    Args:
        input_dim: Number of input features
        hidden_dims: List of hidden layer sizes (e.g., [128, 64, 32])
        output_dim: Number of outputs
        dropout: Dropout rate for regularization
        activation: Activation function ('relu', 'leaky_relu', 'tanh')
        
    Example:
        model = DNNModel(
            input_dim=60,           # 60 features
            hidden_dims=[128, 64],  # Two hidden layers
            dropout=0.3
        )
    """
    
    def __init__(
        self,
        input_dim: int,
        hidden_dims: list = None,
        output_dim: int = 1,
        dropout: float = 0.3,
        activation: str = 'relu'
    ):
        torch, nn = _get_torch()
        
        if hidden_dims is None:
            hidden_dims = [128, 64]
            
        self.input_dim = input_dim
        self.hidden_dims = hidden_dims
        self.output_dim = output_dim
        self.dropout = dropout
        self.activation = activation
        
        self._model = self._build_model()
        
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self._model.to(self.device)
        
    def _build_model(self):
        """Build the internal PyTorch model."""
        torch, nn = _get_torch()
        
        # Select activation function
        if self.activation == 'relu':
            act_fn = nn.ReLU()
        elif self.activation == 'leaky_relu':
            act_fn = nn.LeakyReLU(0.1)
        elif self.activation == 'tanh':
            act_fn = nn.Tanh()
        else:
            act_fn = nn.ReLU()
            
        # Build layers
        layers = []
        prev_dim = self.input_dim
        
        for hidden_dim in self.hidden_dims:
            layers.extend([
                nn.Linear(prev_dim, hidden_dim),
                act_fn,
                nn.Dropout(self.dropout)
            ])
            prev_dim = hidden_dim
            
        # Output layer
        layers.append(nn.Linear(prev_dim, self.output_dim))
        
        return nn.Sequential(*layers)
        
    def __call__(self, x):
        """Forward pass through the model."""
        # Flatten input if needed (e.g., from LSTM-style sequences)
        if len(x.shape) == 3:
            x = x.view(x.size(0), -1)
        return self._model(x)
        
    def train(self):
        """Set model to training mode."""
        self._model.train()
        
    def eval(self):
        """Set model to evaluation mode."""
        self._model.eval()
        
    def parameters(self):
        """Get model parameters for optimizer."""
        return self._model.parameters()
        
    def state_dict(self):
        """Get model state dictionary."""
        return self._model.state_dict()
        
    def load_state_dict(self, state_dict):
        """Load model state dictionary."""
        self._model.load_state_dict(state_dict)
        
    def to(self, device):
        """Move model to device."""
        self._model.to(device)
        self.device = device
        return self
        
    @property
    def module(self):
        """Get the underlying PyTorch module."""
        return self._model
        
    def get_config(self) -> Dict[str, Any]:
        """Get model configuration for serialization."""
        return {
            'model_type': 'dnn',
            'input_dim': self.input_dim,
            'hidden_dims': self.hidden_dims,
            'output_dim': self.output_dim,
            'dropout': self.dropout,
            'activation': self.activation
        }


class TransformerModel:
    """
    Transformer model for time series prediction.
    
    Transformers use attention mechanisms to learn relationships
    between all time steps simultaneously. They can capture both
    short-term and long-term patterns effectively.
    
    When to use Transformer:
    - You have long sequences
    - You want to capture complex temporal patterns
    - You have sufficient training data
    
    Note: Transformers are more data-hungry than LSTMs.
    
    Args:
        input_dim: Number of input features per time step
        d_model: Dimension of the model (embedding size)
        nhead: Number of attention heads (must divide d_model)
        num_layers: Number of transformer encoder layers
        dim_feedforward: Dimension of feedforward network
        dropout: Dropout rate
        output_dim: Number of outputs
        
    Example:
        model = TransformerModel(
            input_dim=1,
            d_model=64,
            nhead=4,
            num_layers=2
        )
    """
    
    def __init__(
        self,
        input_dim: int = 1,
        d_model: int = 64,
        nhead: int = 4,
        num_layers: int = 2,
        dim_feedforward: int = 256,
        dropout: float = 0.1,
        output_dim: int = 1
    ):
        torch, nn = _get_torch()
        
        # Ensure d_model is divisible by nhead
        if d_model % nhead != 0:
            d_model = (d_model // nhead + 1) * nhead
            logger.warning(f"Adjusted d_model to {d_model} for divisibility by nhead")
            
        self.input_dim = input_dim
        self.d_model = d_model
        self.nhead = nhead
        self.num_layers = num_layers
        self.dim_feedforward = dim_feedforward
        self.dropout = dropout
        self.output_dim = output_dim
        
        self._model = self._build_model()
        
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self._model.to(self.device)
        
    def _build_model(self):
        """Build the internal PyTorch model."""
        torch, nn = _get_torch()
        
        class _TransformerModule(nn.Module):
            def __init__(self, input_dim, d_model, nhead, num_layers, 
                         dim_feedforward, dropout, output_dim):
                super().__init__()
                
                # Input embedding
                self.embedding = nn.Linear(input_dim, d_model)
                
                # Positional encoding (simple learned version)
                self.pos_encoding = nn.Parameter(torch.randn(1, 500, d_model))
                
                # Transformer encoder
                encoder_layer = nn.TransformerEncoderLayer(
                    d_model=d_model,
                    nhead=nhead,
                    dim_feedforward=dim_feedforward,
                    dropout=dropout,
                    batch_first=True
                )
                self.transformer = nn.TransformerEncoder(encoder_layer, num_layers)
                
                # Output layer
                self.fc = nn.Linear(d_model, output_dim)
                
            def forward(self, x):
                # Add feature dimension if needed
                if len(x.shape) == 2:
                    x = x.unsqueeze(-1)
                    
                seq_len = x.size(1)
                
                # Embed input
                x = self.embedding(x)
                
                # Add positional encoding
                x = x + self.pos_encoding[:, :seq_len, :]
                
                # Transformer forward
                x = self.transformer(x)
                
                # Output from last position
                x = self.fc(x[:, -1, :])
                return x
                
        return _TransformerModule(
            self.input_dim,
            self.d_model,
            self.nhead,
            self.num_layers,
            self.dim_feedforward,
            self.dropout,
            self.output_dim
        )
        
    def __call__(self, x):
        """Forward pass through the model."""
        return self._model(x)
        
    def train(self):
        """Set model to training mode."""
        self._model.train()
        
    def eval(self):
        """Set model to evaluation mode."""
        self._model.eval()
        
    def parameters(self):
        """Get model parameters for optimizer."""
        return self._model.parameters()
        
    def state_dict(self):
        """Get model state dictionary."""
        return self._model.state_dict()
        
    def load_state_dict(self, state_dict):
        """Load model state dictionary."""
        self._model.load_state_dict(state_dict)
        
    def to(self, device):
        """Move model to device."""
        self._model.to(device)
        self.device = device
        return self
        
    @property
    def module(self):
        """Get the underlying PyTorch module."""
        return self._model
        
    def get_config(self) -> Dict[str, Any]:
        """Get model configuration for serialization."""
        return {
            'model_type': 'transformer',
            'input_dim': self.input_dim,
            'd_model': self.d_model,
            'nhead': self.nhead,
            'num_layers': self.num_layers,
            'dim_feedforward': self.dim_feedforward,
            'dropout': self.dropout,
            'output_dim': self.output_dim
        }


def create_neural_model(
    model_type: str,
    **kwargs
) -> Any:
    """
    Factory function to create neural network models.
    
    This is a convenient way to create models by name.
    
    Args:
        model_type: Type of model ('lstm', 'dnn', 'transformer')
        **kwargs: Model-specific arguments
        
    Returns:
        Initialized model instance
        
    Example:
        # Create LSTM
        model = create_neural_model('lstm', input_dim=1, hidden_dim=64)
        
        # Create DNN
        model = create_neural_model('dnn', input_dim=60, hidden_dims=[128, 64])
        
        # Create Transformer
        model = create_neural_model('transformer', d_model=64, nhead=4)
    """
    model_type = model_type.lower()
    
    if model_type == 'lstm':
        return LSTMModel(**kwargs)
    elif model_type == 'dnn':
        return DNNModel(**kwargs)
    elif model_type == 'transformer':
        return TransformerModel(**kwargs)
    else:
        raise ValueError(
            f"Unknown model type: '{model_type}'\n\n"
            "💡 Available neural network models:\n"
            "   - 'lstm': Long Short-Term Memory\n"
            "   - 'dnn': Deep Neural Network\n"
            "   - 'transformer': Transformer with attention"
        )


def get_device():
    """
    Get the best available device (GPU if available, else CPU).
    
    Returns:
        torch.device object
    """
    torch, _ = _get_torch()
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"🖥️ Using device: {device}")
    return device
