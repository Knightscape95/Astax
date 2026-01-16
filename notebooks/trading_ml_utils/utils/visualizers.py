"""
Visualization Utilities Module
==============================

Provides plotting utilities for training visualization in Colab notebooks.

Features:
- Training curves (loss, metrics)
- Model comparison charts
- Data distribution visualizations
- Prediction vs actual plots

Example Usage:
    from trading_ml_utils.utils import TrainingVisualizer, plot_predictions
    
    # Visualize training progress
    viz = TrainingVisualizer()
    viz.plot_losses(train_losses, val_losses)
    
    # Plot predictions
    plot_predictions(y_true, y_pred, title='Model Predictions')
"""

import logging
from typing import Dict, Any, Optional, List, Union, Tuple
import numpy as np

logger = logging.getLogger(__name__)

# Lazy imports for plotting libraries
_plt = None
_sns = None


def _get_matplotlib():
    """Lazy import matplotlib."""
    global _plt
    if _plt is None:
        try:
            import matplotlib.pyplot as plt
            _plt = plt
            # Set style for better visualizations
            plt.style.use('seaborn-v0_8-whitegrid')
        except ImportError:
            logger.warning(
                "matplotlib not installed. Plotting will not be available.\n"
                "Install with: !pip install matplotlib"
            )
            return None
    return _plt


def _get_seaborn():
    """Lazy import seaborn."""
    global _sns
    if _sns is None:
        try:
            import seaborn as sns
            _sns = sns
        except ImportError:
            logger.info("seaborn not installed. Using matplotlib only.")
            return None
    return _sns


class TrainingVisualizer:
    """
    Visualize training progress and results.
    
    Provides live-updating plots for Colab notebooks showing:
    - Loss curves
    - Learning rate schedules
    - Metric comparisons
    
    Example:
        viz = TrainingVisualizer()
        
        # Plot loss curves
        viz.plot_losses(train_losses, val_losses)
        
        # Plot multiple metrics
        viz.plot_metrics({'accuracy': acc_list, 'f1': f1_list})
    """
    
    def __init__(self, figsize: Tuple[int, int] = (12, 4)):
        self.figsize = figsize
        self.plt = _get_matplotlib()
        self.sns = _get_seaborn()
        
    def plot_losses(
        self,
        train_losses: List[float],
        val_losses: Optional[List[float]] = None,
        title: str = "Training Progress"
    ):
        """
        Plot training and validation loss curves.
        
        Args:
            train_losses: List of training losses per epoch
            val_losses: List of validation losses per epoch (optional)
            title: Plot title
        """
        if self.plt is None:
            self._print_fallback(train_losses, val_losses)
            return
            
        plt = self.plt
        
        fig, ax = plt.subplots(figsize=self.figsize)
        
        epochs = range(1, len(train_losses) + 1)
        ax.plot(epochs, train_losses, 'b-', label='Training Loss', linewidth=2)
        
        if val_losses is not None:
            ax.plot(epochs, val_losses, 'r-', label='Validation Loss', linewidth=2)
            
        ax.set_xlabel('Epoch')
        ax.set_ylabel('Loss')
        ax.set_title(title)
        ax.legend()
        ax.grid(True, alpha=0.3)
        
        plt.tight_layout()
        plt.show()
        
    def _print_fallback(
        self,
        train_losses: List[float],
        val_losses: Optional[List[float]] = None
    ):
        """Print text-based fallback when matplotlib unavailable."""
        print("\n📊 Training Loss Summary:")
        print("-" * 40)
        print(f"Initial Loss: {train_losses[0]:.4f}")
        print(f"Final Loss:   {train_losses[-1]:.4f}")
        print(f"Min Loss:     {min(train_losses):.4f}")
        if val_losses:
            print(f"\nValidation Loss:")
            print(f"Initial: {val_losses[0]:.4f}")
            print(f"Final:   {val_losses[-1]:.4f}")
            print(f"Min:     {min(val_losses):.4f}")
            
    def plot_metrics(
        self,
        metrics: Dict[str, List[float]],
        title: str = "Training Metrics"
    ):
        """
        Plot multiple metrics over training epochs.
        
        Args:
            metrics: Dictionary mapping metric names to lists of values
            title: Plot title
        """
        if self.plt is None:
            print("\n📊 Metrics Summary:")
            for name, values in metrics.items():
                print(f"  {name}: {values[-1]:.4f} (final)")
            return
            
        plt = self.plt
        
        fig, axes = plt.subplots(1, len(metrics), figsize=(4*len(metrics), 4))
        if len(metrics) == 1:
            axes = [axes]
            
        colors = plt.cm.tab10(np.linspace(0, 1, len(metrics)))
        
        for ax, (name, values), color in zip(axes, metrics.items(), colors):
            epochs = range(1, len(values) + 1)
            ax.plot(epochs, values, color=color, linewidth=2)
            ax.set_xlabel('Epoch')
            ax.set_ylabel(name)
            ax.set_title(name)
            ax.grid(True, alpha=0.3)
            
        fig.suptitle(title, fontsize=14)
        plt.tight_layout()
        plt.show()
        
    def plot_lr_schedule(
        self,
        learning_rates: List[float],
        title: str = "Learning Rate Schedule"
    ):
        """
        Plot learning rate schedule over training.
        
        Args:
            learning_rates: List of learning rates per epoch
            title: Plot title
        """
        if self.plt is None:
            print(f"\n📊 Learning Rate: {learning_rates[0]:.6f} -> {learning_rates[-1]:.6f}")
            return
            
        plt = self.plt
        
        fig, ax = plt.subplots(figsize=self.figsize)
        epochs = range(1, len(learning_rates) + 1)
        ax.plot(epochs, learning_rates, 'g-', linewidth=2)
        ax.set_xlabel('Epoch')
        ax.set_ylabel('Learning Rate')
        ax.set_title(title)
        ax.set_yscale('log')
        ax.grid(True, alpha=0.3)
        
        plt.tight_layout()
        plt.show()


def plot_predictions(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    title: str = "Predictions vs Actual",
    figsize: Tuple[int, int] = (14, 5)
):
    """
    Plot predicted values against actual values.
    
    Creates two plots:
    1. Time series comparison
    2. Scatter plot with ideal line
    
    Args:
        y_true: Actual values
        y_pred: Predicted values
        title: Plot title
        figsize: Figure size as (width, height)
        
    Example:
        plot_predictions(y_test, model.predict(X_test))
    """
    plt = _get_matplotlib()
    if plt is None:
        mae = np.mean(np.abs(y_true - y_pred))
        print(f"MAE: {mae:.4f}")
        return
        
    fig, axes = plt.subplots(1, 2, figsize=figsize)
    
    # Time series plot
    ax1 = axes[0]
    ax1.plot(y_true, 'b-', label='Actual', alpha=0.7)
    ax1.plot(y_pred, 'r-', label='Predicted', alpha=0.7)
    ax1.set_xlabel('Time')
    ax1.set_ylabel('Value')
    ax1.set_title(f'{title} - Time Series')
    ax1.legend()
    ax1.grid(True, alpha=0.3)
    
    # Scatter plot
    ax2 = axes[1]
    ax2.scatter(y_true, y_pred, alpha=0.5, s=10)
    
    # Add perfect prediction line
    min_val = min(y_true.min(), y_pred.min())
    max_val = max(y_true.max(), y_pred.max())
    ax2.plot([min_val, max_val], [min_val, max_val], 'r--', label='Perfect Prediction')
    
    ax2.set_xlabel('Actual')
    ax2.set_ylabel('Predicted')
    ax2.set_title(f'{title} - Scatter')
    ax2.legend()
    ax2.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.show()
    
    # Print summary statistics
    mae = np.mean(np.abs(y_true - y_pred))
    rmse = np.sqrt(np.mean((y_true - y_pred) ** 2))
    correlation = np.corrcoef(y_true.flatten(), y_pred.flatten())[0, 1]
    
    print(f"\n📊 Prediction Quality:")
    print(f"  MAE:         {mae:.4f}")
    print(f"  RMSE:        {rmse:.4f}")
    print(f"  Correlation: {correlation:.4f}")


def plot_data_distribution(
    data: np.ndarray,
    column_names: Optional[List[str]] = None,
    title: str = "Feature Distributions",
    figsize: Tuple[int, int] = (15, 10)
):
    """
    Plot distribution of features in the dataset.
    
    Args:
        data: 2D array of shape (samples, features)
        column_names: Optional names for each feature
        title: Plot title
        figsize: Figure size
        
    Example:
        plot_data_distribution(X_train, ['open', 'high', 'low', 'close', 'volume'])
    """
    plt = _get_matplotlib()
    if plt is None:
        print("📊 Data shape:", data.shape)
        print("📊 Min/Max per feature:", data.min(axis=0), data.max(axis=0))
        return
        
    n_features = data.shape[1] if len(data.shape) > 1 else 1
    if n_features == 1:
        data = data.reshape(-1, 1)
        
    # Calculate grid size
    n_cols = min(4, n_features)
    n_rows = (n_features + n_cols - 1) // n_cols
    
    fig, axes = plt.subplots(n_rows, n_cols, figsize=figsize)
    axes = np.array(axes).flatten()
    
    if column_names is None:
        column_names = [f'Feature {i}' for i in range(n_features)]
        
    for i in range(n_features):
        ax = axes[i]
        ax.hist(data[:, i], bins=50, alpha=0.7, color='steelblue', edgecolor='white')
        ax.set_title(column_names[i])
        ax.set_xlabel('Value')
        ax.set_ylabel('Count')
        
        # Add statistics
        mean = np.mean(data[:, i])
        std = np.std(data[:, i])
        ax.axvline(mean, color='red', linestyle='--', label=f'Mean: {mean:.2f}')
        ax.legend(fontsize=8)
        
    # Hide unused subplots
    for j in range(n_features, len(axes)):
        axes[j].set_visible(False)
        
    fig.suptitle(title, fontsize=14)
    plt.tight_layout()
    plt.show()


def plot_correlation_matrix(
    data: np.ndarray,
    column_names: Optional[List[str]] = None,
    title: str = "Feature Correlation Matrix",
    figsize: Tuple[int, int] = (10, 8)
):
    """
    Plot correlation matrix heatmap.
    
    Args:
        data: 2D array of shape (samples, features)
        column_names: Optional names for each feature
        title: Plot title
        figsize: Figure size
    """
    plt = _get_matplotlib()
    sns = _get_seaborn()
    
    corr_matrix = np.corrcoef(data.T)
    
    if plt is None:
        print("📊 Correlation matrix shape:", corr_matrix.shape)
        return
        
    n_features = corr_matrix.shape[0]
    if column_names is None:
        column_names = [f'F{i}' for i in range(n_features)]
        
    fig, ax = plt.subplots(figsize=figsize)
    
    if sns is not None:
        sns.heatmap(
            corr_matrix,
            annot=True,
            fmt='.2f',
            cmap='RdBu_r',
            center=0,
            xticklabels=column_names,
            yticklabels=column_names,
            ax=ax
        )
    else:
        im = ax.imshow(corr_matrix, cmap='RdBu_r', vmin=-1, vmax=1)
        ax.set_xticks(range(n_features))
        ax.set_yticks(range(n_features))
        ax.set_xticklabels(column_names, rotation=45, ha='right')
        ax.set_yticklabels(column_names)
        plt.colorbar(im, ax=ax)
        
    ax.set_title(title)
    plt.tight_layout()
    plt.show()


def plot_trading_results(
    returns: np.ndarray,
    equity_curve: Optional[np.ndarray] = None,
    title: str = "Trading Results",
    figsize: Tuple[int, int] = (14, 8)
):
    """
    Plot trading backtest results.
    
    Shows:
    - Equity curve
    - Returns distribution
    - Drawdown chart
    
    Args:
        returns: Array of returns per period
        equity_curve: Cumulative equity (optional, computed from returns if not provided)
        title: Plot title
        figsize: Figure size
    """
    plt = _get_matplotlib()
    if plt is None:
        print("📊 Trading Results:")
        print(f"  Total Return: {np.prod(1 + returns) - 1:.2%}")
        print(f"  Sharpe Ratio: {np.mean(returns) / np.std(returns) * np.sqrt(252):.2f}")
        return
        
    if equity_curve is None:
        equity_curve = np.cumprod(1 + returns)
        
    fig, axes = plt.subplots(2, 2, figsize=figsize)
    
    # Equity curve
    ax1 = axes[0, 0]
    ax1.plot(equity_curve, 'b-', linewidth=2)
    ax1.set_xlabel('Time')
    ax1.set_ylabel('Equity')
    ax1.set_title('Equity Curve')
    ax1.grid(True, alpha=0.3)
    
    # Returns distribution
    ax2 = axes[0, 1]
    ax2.hist(returns, bins=50, alpha=0.7, color='steelblue', edgecolor='white')
    ax2.axvline(0, color='red', linestyle='--')
    ax2.set_xlabel('Returns')
    ax2.set_ylabel('Frequency')
    ax2.set_title('Returns Distribution')
    ax2.grid(True, alpha=0.3)
    
    # Drawdown
    ax3 = axes[1, 0]
    running_max = np.maximum.accumulate(equity_curve)
    drawdown = (equity_curve - running_max) / running_max
    ax3.fill_between(range(len(drawdown)), drawdown, 0, alpha=0.5, color='red')
    ax3.set_xlabel('Time')
    ax3.set_ylabel('Drawdown')
    ax3.set_title('Drawdown')
    ax3.grid(True, alpha=0.3)
    
    # Rolling Sharpe
    ax4 = axes[1, 1]
    window = 60
    if len(returns) > window:
        rolling_sharpe = []
        for i in range(window, len(returns)):
            window_returns = returns[i-window:i]
            sharpe = np.mean(window_returns) / np.std(window_returns) * np.sqrt(252)
            rolling_sharpe.append(sharpe)
        ax4.plot(rolling_sharpe, 'g-', linewidth=1)
        ax4.axhline(0, color='red', linestyle='--')
    ax4.set_xlabel('Time')
    ax4.set_ylabel('Sharpe Ratio')
    ax4.set_title(f'Rolling {window}-day Sharpe Ratio')
    ax4.grid(True, alpha=0.3)
    
    fig.suptitle(title, fontsize=14)
    plt.tight_layout()
    plt.show()
    
    # Print summary
    total_return = equity_curve[-1] - 1
    max_drawdown = drawdown.min()
    sharpe = np.mean(returns) / np.std(returns) * np.sqrt(252)
    win_rate = np.sum(returns > 0) / len(returns)
    
    print(f"\n📊 Performance Summary:")
    print(f"  Total Return:  {total_return:.2%}")
    print(f"  Max Drawdown:  {max_drawdown:.2%}")
    print(f"  Sharpe Ratio:  {sharpe:.2f}")
    print(f"  Win Rate:      {win_rate:.2%}")


def plot_model_comparison(
    models_metrics: Dict[str, Dict[str, float]],
    title: str = "Model Comparison",
    figsize: Tuple[int, int] = (12, 6)
):
    """
    Create comparison chart for multiple models.
    
    Args:
        models_metrics: Dict mapping model names to their metrics
            Example: {'LSTM': {'MAE': 0.05, 'Sharpe': 1.2}, 'XGBoost': {...}}
        title: Plot title
        figsize: Figure size
    """
    plt = _get_matplotlib()
    if plt is None:
        print("📊 Model Comparison:")
        for name, metrics in models_metrics.items():
            print(f"  {name}: {metrics}")
        return
        
    model_names = list(models_metrics.keys())
    metric_names = list(next(iter(models_metrics.values())).keys())
    
    fig, axes = plt.subplots(1, len(metric_names), figsize=figsize)
    if len(metric_names) == 1:
        axes = [axes]
        
    colors = plt.cm.Set2(np.linspace(0, 1, len(model_names)))
    
    for ax, metric in zip(axes, metric_names):
        values = [models_metrics[model][metric] for model in model_names]
        bars = ax.bar(model_names, values, color=colors)
        ax.set_ylabel(metric)
        ax.set_title(metric)
        ax.tick_params(axis='x', rotation=45)
        
        # Add value labels
        for bar, value in zip(bars, values):
            ax.text(
                bar.get_x() + bar.get_width()/2,
                bar.get_height(),
                f'{value:.3f}',
                ha='center',
                va='bottom',
                fontsize=9
            )
            
    fig.suptitle(title, fontsize=14)
    plt.tight_layout()
    plt.show()
