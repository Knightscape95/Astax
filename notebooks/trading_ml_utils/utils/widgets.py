"""
Interactive Widgets Module
==========================

Provides ipywidgets-based interactive controls for Colab notebooks.

Features:
- Configuration widgets for model and training parameters
- Progress indicators
- Interactive charts

Example Usage:
    from trading_ml_utils.utils import ConfigWidget, ProgressWidget
    
    # Create configuration widget
    config = ConfigWidget()
    config.display()
    
    # Get user selections
    settings = config.get_config()
    
    # Show training progress
    progress = ProgressWidget(total_epochs=100)
    for epoch in range(100):
        progress.update(epoch, train_loss=0.05)
"""

import logging
from typing import Dict, Any, Optional, List, Callable

logger = logging.getLogger(__name__)

# Lazy import ipywidgets
_widgets = None


def _get_widgets():
    """Lazy import ipywidgets."""
    global _widgets
    if _widgets is None:
        try:
            import ipywidgets as widgets
            _widgets = widgets
        except ImportError:
            logger.warning(
                "ipywidgets not installed. Widgets will not be available.\n"
                "Install with: !pip install ipywidgets"
            )
            return None
    return _widgets


class ConfigWidget:
    """
    Interactive configuration widget for ML experiments.
    
    Provides dropdown menus and sliders for configuring:
    - Model type
    - Data source
    - Hyperparameters
    - Training settings
    
    Example:
        config = ConfigWidget()
        config.display()
        
        # After user makes selections
        settings = config.get_config()
        model_type = settings['model_type']
    """
    
    def __init__(self):
        self.widgets = _get_widgets()
        self._components = {}
        self._output = None
        
        if self.widgets:
            self._create_widgets()
            
    def _create_widgets(self):
        """Create all widget components."""
        w = self.widgets
        
        # Model selection
        self._components['model_type'] = w.Dropdown(
            options=['LSTM', 'DNN', 'Transformer', 'RandomForest', 'XGBoost'],
            value='LSTM',
            description='Model:',
            style={'description_width': '100px'}
        )
        
        # Data source
        self._components['data_source'] = w.Dropdown(
            options=['Yahoo Finance', 'Alpha Vantage', 'NSE/BSE'],
            value='Yahoo Finance',
            description='Data Source:',
            style={'description_width': '100px'}
        )
        
        # Ticker
        self._components['ticker'] = w.Text(
            value='AAPL',
            description='Ticker:',
            style={'description_width': '100px'}
        )
        
        # Date range
        self._components['start_date'] = w.Text(
            value='2020-01-01',
            description='Start Date:',
            style={'description_width': '100px'}
        )
        
        self._components['end_date'] = w.Text(
            value='2023-12-31',
            description='End Date:',
            style={'description_width': '100px'}
        )
        
        # Lookback period
        self._components['lookback'] = w.IntSlider(
            value=60,
            min=10,
            max=200,
            step=10,
            description='Lookback:',
            style={'description_width': '100px'}
        )
        
        # Train/test split
        self._components['train_split'] = w.FloatSlider(
            value=0.8,
            min=0.5,
            max=0.95,
            step=0.05,
            description='Train Split:',
            style={'description_width': '100px'}
        )
        
        # Epochs
        self._components['epochs'] = w.IntSlider(
            value=100,
            min=10,
            max=500,
            step=10,
            description='Epochs:',
            style={'description_width': '100px'}
        )
        
        # Batch size
        self._components['batch_size'] = w.Dropdown(
            options=[16, 32, 64, 128, 256],
            value=32,
            description='Batch Size:',
            style={'description_width': '100px'}
        )
        
        # Learning rate
        self._components['learning_rate'] = w.SelectionSlider(
            options=[0.0001, 0.0005, 0.001, 0.005, 0.01],
            value=0.001,
            description='Learn Rate:',
            style={'description_width': '100px'}
        )
        
        # Hidden dimension (for neural networks)
        self._components['hidden_dim'] = w.Dropdown(
            options=[32, 64, 128, 256],
            value=64,
            description='Hidden Dim:',
            style={'description_width': '100px'}
        )
        
        # Number of layers
        self._components['num_layers'] = w.IntSlider(
            value=2,
            min=1,
            max=4,
            description='Layers:',
            style={'description_width': '100px'}
        )
        
        # Dropout
        self._components['dropout'] = w.FloatSlider(
            value=0.2,
            min=0,
            max=0.5,
            step=0.1,
            description='Dropout:',
            style={'description_width': '100px'}
        )
        
        # Output area
        self._output = w.Output()
        
    def display(self):
        """Display the configuration widget."""
        if not self.widgets:
            print("Widgets not available. Configure manually:")
            print("  model_type: 'LSTM'")
            print("  ticker: 'AAPL'")
            print("  epochs: 100")
            return
            
        from IPython.display import display, HTML
        
        # Create layout
        title = self.widgets.HTML("<h3>🔧 Experiment Configuration</h3>")
        
        # Group widgets
        data_section = self.widgets.VBox([
            self.widgets.HTML("<b>📊 Data Settings</b>"),
            self._components['data_source'],
            self._components['ticker'],
            self._components['start_date'],
            self._components['end_date'],
            self._components['lookback'],
            self._components['train_split'],
        ])
        
        model_section = self.widgets.VBox([
            self.widgets.HTML("<b>🤖 Model Settings</b>"),
            self._components['model_type'],
            self._components['hidden_dim'],
            self._components['num_layers'],
            self._components['dropout'],
        ])
        
        training_section = self.widgets.VBox([
            self.widgets.HTML("<b>🏋️ Training Settings</b>"),
            self._components['epochs'],
            self._components['batch_size'],
            self._components['learning_rate'],
        ])
        
        # Arrange in columns
        layout = self.widgets.HBox([
            data_section,
            model_section,
            training_section
        ])
        
        # Display
        display(title)
        display(layout)
        
    def get_config(self) -> Dict[str, Any]:
        """
        Get the current configuration from widget values.
        
        Returns:
            Dictionary of configuration values
        """
        if not self.widgets:
            # Return defaults
            return {
                'model_type': 'LSTM',
                'data_source': 'yahoo',
                'ticker': 'AAPL',
                'start_date': '2020-01-01',
                'end_date': '2023-12-31',
                'lookback': 60,
                'train_split': 0.8,
                'epochs': 100,
                'batch_size': 32,
                'learning_rate': 0.001,
                'hidden_dim': 64,
                'num_layers': 2,
                'dropout': 0.2
            }
            
        # Map data source names
        data_source_map = {
            'Yahoo Finance': 'yahoo',
            'Alpha Vantage': 'alpha_vantage',
            'NSE/BSE': 'nse_bse'
        }
        
        return {
            'model_type': self._components['model_type'].value,
            'data_source': data_source_map.get(
                self._components['data_source'].value, 
                'yahoo'
            ),
            'ticker': self._components['ticker'].value,
            'start_date': self._components['start_date'].value,
            'end_date': self._components['end_date'].value,
            'lookback': self._components['lookback'].value,
            'train_split': self._components['train_split'].value,
            'epochs': self._components['epochs'].value,
            'batch_size': self._components['batch_size'].value,
            'learning_rate': self._components['learning_rate'].value,
            'hidden_dim': self._components['hidden_dim'].value,
            'num_layers': self._components['num_layers'].value,
            'dropout': self._components['dropout'].value
        }


class ProgressWidget:
    """
    Training progress display widget.
    
    Shows:
    - Progress bar
    - Current epoch
    - Training/validation loss
    - Estimated time remaining
    
    Example:
        progress = ProgressWidget(total_epochs=100)
        
        for epoch in range(100):
            # ... training code ...
            progress.update(
                epoch=epoch,
                train_loss=train_loss,
                val_loss=val_loss
            )
    """
    
    def __init__(
        self,
        total_epochs: int,
        display_interval: int = 1
    ):
        self.total_epochs = total_epochs
        self.display_interval = display_interval
        self.widgets = _get_widgets()
        
        self._progress_bar = None
        self._status_label = None
        self._metrics_label = None
        
        if self.widgets:
            self._create_widgets()
            self._display()
            
    def _create_widgets(self):
        """Create progress widgets."""
        w = self.widgets
        
        self._progress_bar = w.FloatProgress(
            value=0,
            min=0,
            max=self.total_epochs,
            description='Training:',
            bar_style='info',
            style={'bar_color': '#3498db', 'description_width': '80px'}
        )
        
        self._status_label = w.HTML(
            value='<span style="color: #666;">Epoch 0/{}</span>'.format(self.total_epochs)
        )
        
        self._metrics_label = w.HTML(
            value='<span style="color: #666;">Waiting to start...</span>'
        )
        
    def _display(self):
        """Display the progress widget."""
        if not self.widgets:
            return
            
        from IPython.display import display
        
        layout = self.widgets.VBox([
            self._progress_bar,
            self._status_label,
            self._metrics_label
        ])
        
        display(layout)
        
    def update(
        self,
        epoch: int,
        train_loss: float,
        val_loss: Optional[float] = None,
        **extra_metrics
    ):
        """
        Update the progress display.
        
        Args:
            epoch: Current epoch number
            train_loss: Training loss
            val_loss: Validation loss (optional)
            **extra_metrics: Additional metrics to display
        """
        if not self.widgets:
            if epoch % self.display_interval == 0:
                msg = f"Epoch {epoch+1}/{self.total_epochs} | Train Loss: {train_loss:.4f}"
                if val_loss is not None:
                    msg += f" | Val Loss: {val_loss:.4f}"
                print(msg)
            return
            
        # Update progress bar
        self._progress_bar.value = epoch + 1
        
        # Update status
        progress_pct = (epoch + 1) / self.total_epochs * 100
        self._status_label.value = (
            f'<span style="color: #333; font-weight: bold;">'
            f'Epoch {epoch+1}/{self.total_epochs} ({progress_pct:.0f}%)'
            f'</span>'
        )
        
        # Update metrics
        metrics_parts = [f'Train Loss: {train_loss:.4f}']
        if val_loss is not None:
            metrics_parts.append(f'Val Loss: {val_loss:.4f}')
        for key, value in extra_metrics.items():
            if isinstance(value, float):
                metrics_parts.append(f'{key}: {value:.4f}')
                
        self._metrics_label.value = (
            f'<span style="color: #666;">{" | ".join(metrics_parts)}</span>'
        )
        
        # Update bar style based on progress
        if progress_pct < 33:
            self._progress_bar.bar_style = 'info'
        elif progress_pct < 66:
            self._progress_bar.bar_style = 'warning'
        else:
            self._progress_bar.bar_style = 'success'
            
    def complete(self, message: str = "Training complete!"):
        """Mark training as complete."""
        if self.widgets:
            self._progress_bar.value = self.total_epochs
            self._progress_bar.bar_style = 'success'
            self._status_label.value = f'<span style="color: #27ae60; font-weight: bold;">✅ {message}</span>'
        else:
            print(f"✅ {message}")


def create_setup_wizard():
    """
    Create a first-time setup wizard for Colab notebooks.
    
    Returns an interactive widget that guides users through:
    1. Installing dependencies
    2. Mounting Google Drive
    3. Setting up API keys
    4. Running health checks
    """
    widgets = _get_widgets()
    if not widgets:
        print("Widgets not available. Follow manual setup instructions.")
        return None
        
    # This would be a more complex widget in practice
    # Simplified version for demonstration
    
    setup_steps = widgets.Accordion(children=[
        widgets.VBox([
            widgets.HTML("<p>Click the button below to install required packages:</p>"),
            widgets.Button(description="Install Dependencies", button_style='primary')
        ]),
        widgets.VBox([
            widgets.HTML("<p>Mount your Google Drive to save checkpoints:</p>"),
            widgets.Button(description="Mount Drive", button_style='primary')
        ]),
        widgets.VBox([
            widgets.HTML(
                "<p>Set up your API keys in Colab Secrets (🔑 icon in left sidebar):</p>"
                "<ul>"
                "<li>ALPHA_VANTAGE_KEY (optional)</li>"
                "<li>DASHBOARD_API_KEY (optional)</li>"
                "</ul>"
            ),
            widgets.Button(description="Verify Keys", button_style='primary')
        ]),
        widgets.VBox([
            widgets.HTML("<p>Run health checks to verify everything is working:</p>"),
            widgets.Button(description="Run Health Check", button_style='success')
        ])
    ])
    
    setup_steps.set_title(0, '1. Install Dependencies')
    setup_steps.set_title(1, '2. Mount Google Drive')
    setup_steps.set_title(2, '3. Configure API Keys')
    setup_steps.set_title(3, '4. Health Check')
    
    return setup_steps
