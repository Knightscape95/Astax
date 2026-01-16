"""
Model Evaluators Module
=======================

Provides evaluation and backtesting utilities for trained models.

Features:
- Standard ML metrics (MSE, MAE, R², accuracy)
- Trading-specific metrics (Sharpe ratio, max drawdown, win rate)
- Backtesting simulation
- Visualization of results

Example Usage:
    from trading_ml_utils.training import Evaluator, evaluate_model
    
    evaluator = Evaluator(model)
    results = evaluator.evaluate(X_test, y_test)
    
    print(f"MSE: {results['mse']:.4f}")
    print(f"Sharpe Ratio: {results['sharpe_ratio']:.2f}")
"""

import logging
from typing import Optional, Dict, Any, List, Tuple

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


class EvaluationResult:
    """
    Container for evaluation results.
    
    Attributes:
        predictions: Model predictions
        actuals: Actual values
        metrics: Dictionary of computed metrics
        backtest: Backtest results (if computed)
    """
    
    def __init__(
        self,
        predictions: np.ndarray,
        actuals: np.ndarray,
        metrics: Dict[str, float],
        backtest: Optional[Dict[str, Any]] = None
    ):
        self.predictions = predictions
        self.actuals = actuals
        self.metrics = metrics
        self.backtest = backtest
        
    def summary(self) -> str:
        """Get a formatted summary of results."""
        lines = []
        lines.append("=" * 50)
        lines.append("📊 EVALUATION RESULTS")
        lines.append("=" * 50)
        
        # Regression metrics
        if 'mse' in self.metrics:
            lines.append("\n📈 Regression Metrics:")
            lines.append(f"   MSE:  {self.metrics.get('mse', 0):.6f}")
            lines.append(f"   RMSE: {self.metrics.get('rmse', 0):.6f}")
            lines.append(f"   MAE:  {self.metrics.get('mae', 0):.6f}")
            lines.append(f"   R²:   {self.metrics.get('r2', 0):.4f}")
            
        # Classification metrics
        if 'accuracy' in self.metrics:
            lines.append("\n📊 Classification Metrics:")
            lines.append(f"   Accuracy:  {self.metrics.get('accuracy', 0):.4f}")
            lines.append(f"   Precision: {self.metrics.get('precision', 0):.4f}")
            lines.append(f"   Recall:    {self.metrics.get('recall', 0):.4f}")
            lines.append(f"   F1 Score:  {self.metrics.get('f1', 0):.4f}")
            
        # Trading metrics
        if 'sharpe_ratio' in self.metrics:
            lines.append("\n💰 Trading Metrics:")
            lines.append(f"   Sharpe Ratio:  {self.metrics.get('sharpe_ratio', 0):.2f}")
            lines.append(f"   Max Drawdown:  {self.metrics.get('max_drawdown', 0):.2%}")
            lines.append(f"   Win Rate:      {self.metrics.get('win_rate', 0):.2%}")
            lines.append(f"   Total Return:  {self.metrics.get('total_return', 0):.2%}")
            
        lines.append("=" * 50)
        return "\n".join(lines)
        
    def to_dict(self) -> Dict[str, Any]:
        """Convert results to dictionary."""
        return {
            'predictions': self.predictions.tolist(),
            'actuals': self.actuals.tolist(),
            'metrics': self.metrics,
            'backtest': self.backtest
        }


class Evaluator:
    """
    Model evaluator with comprehensive metrics.
    
    Computes both standard ML metrics and trading-specific
    performance metrics.
    
    Args:
        model: Trained model
        scaler: Scaler for inverse transforming predictions
        
    Example:
        evaluator = Evaluator(model, scaler=my_scaler)
        
        # Basic evaluation
        result = evaluator.evaluate(X_test, y_test)
        print(result.summary())
        
        # With backtesting
        result = evaluator.evaluate(
            X_test, y_test,
            run_backtest=True,
            initial_capital=10000
        )
    """
    
    def __init__(
        self,
        model: Any,
        scaler: Any = None
    ):
        self.model = model
        self.scaler = scaler
        
    def evaluate(
        self,
        X: np.ndarray,
        y: np.ndarray,
        task: str = 'regression',
        run_backtest: bool = True,
        initial_capital: float = 10000,
        prices: Optional[np.ndarray] = None
    ) -> EvaluationResult:
        """
        Evaluate model performance.
        
        Args:
            X: Test features
            y: Test targets
            task: 'regression' or 'classification'
            run_backtest: Whether to run trading simulation
            initial_capital: Starting capital for backtest
            prices: Actual prices for backtesting
            
        Returns:
            EvaluationResult with metrics and predictions
        """
        print("🔍 Evaluating model...")
        
        # Get predictions
        predictions = self._get_predictions(X)
        actuals = y.flatten() if len(y.shape) > 1 else y
        predictions = predictions.flatten() if len(predictions.shape) > 1 else predictions
        
        # Calculate metrics based on task
        if task == 'regression':
            metrics = self._compute_regression_metrics(predictions, actuals)
        else:
            metrics = self._compute_classification_metrics(predictions, actuals)
            
        # Run backtest
        backtest = None
        if run_backtest:
            backtest = self._run_backtest(
                predictions, actuals, 
                initial_capital=initial_capital,
                prices=prices
            )
            metrics.update(backtest['metrics'])
            
        result = EvaluationResult(
            predictions=predictions,
            actuals=actuals,
            metrics=metrics,
            backtest=backtest
        )
        
        print(result.summary())
        
        return result
        
    def _get_predictions(self, X: np.ndarray) -> np.ndarray:
        """Get model predictions."""
        if hasattr(self.model, 'predict'):
            return self.model.predict(X)
        elif callable(self.model):
            import torch
            self.model.eval()
            with torch.no_grad():
                X_tensor = torch.FloatTensor(X)
                if hasattr(self.model, 'device'):
                    X_tensor = X_tensor.to(self.model.device)
                return self.model(X_tensor).cpu().numpy()
        else:
            raise ValueError("Model must have a predict method or be callable")
            
    def _compute_regression_metrics(
        self,
        predictions: np.ndarray,
        actuals: np.ndarray
    ) -> Dict[str, float]:
        """Compute regression metrics."""
        from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
        
        mse = mean_squared_error(actuals, predictions)
        rmse = np.sqrt(mse)
        mae = mean_absolute_error(actuals, predictions)
        r2 = r2_score(actuals, predictions)
        
        # MAPE (avoiding division by zero)
        mask = actuals != 0
        mape = np.mean(np.abs((actuals[mask] - predictions[mask]) / actuals[mask])) if mask.sum() > 0 else 0
        
        return {
            'mse': mse,
            'rmse': rmse,
            'mae': mae,
            'r2': r2,
            'mape': mape
        }
        
    def _compute_classification_metrics(
        self,
        predictions: np.ndarray,
        actuals: np.ndarray
    ) -> Dict[str, float]:
        """Compute classification metrics."""
        from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
        
        # Convert to binary if needed
        pred_binary = (predictions > 0.5).astype(int)
        actual_binary = actuals.astype(int)
        
        return {
            'accuracy': accuracy_score(actual_binary, pred_binary),
            'precision': precision_score(actual_binary, pred_binary, zero_division=0),
            'recall': recall_score(actual_binary, pred_binary, zero_division=0),
            'f1': f1_score(actual_binary, pred_binary, zero_division=0)
        }
        
    def _run_backtest(
        self,
        predictions: np.ndarray,
        actuals: np.ndarray,
        initial_capital: float = 10000,
        prices: Optional[np.ndarray] = None
    ) -> Dict[str, Any]:
        """
        Run a simple trading backtest.
        
        Strategy: Long when predicted return > 0, flat otherwise.
        """
        # Use actuals as returns if no prices provided
        if prices is None:
            returns = actuals
        else:
            returns = np.diff(prices) / prices[:-1]
            returns = np.append([0], returns)
            
        # Generate signals: 1 for predicted positive return, 0 otherwise
        signals = (predictions > 0).astype(float)
        
        # Calculate strategy returns
        strategy_returns = signals[:-1] * returns[1:]
        
        # Calculate equity curve
        equity = initial_capital * np.cumprod(1 + strategy_returns)
        equity = np.insert(equity, 0, initial_capital)
        
        # Calculate metrics
        total_return = (equity[-1] / initial_capital) - 1
        
        # Sharpe ratio (annualized, assuming daily returns)
        if len(strategy_returns) > 0 and np.std(strategy_returns) > 0:
            sharpe_ratio = np.sqrt(252) * np.mean(strategy_returns) / np.std(strategy_returns)
        else:
            sharpe_ratio = 0
            
        # Max drawdown
        running_max = np.maximum.accumulate(equity)
        drawdowns = (equity - running_max) / running_max
        max_drawdown = abs(np.min(drawdowns))
        
        # Win rate
        winning_trades = np.sum(strategy_returns > 0)
        total_trades = np.sum(signals[:-1] != 0)
        win_rate = winning_trades / total_trades if total_trades > 0 else 0
        
        return {
            'equity_curve': equity.tolist(),
            'signals': signals.tolist(),
            'metrics': {
                'sharpe_ratio': sharpe_ratio,
                'max_drawdown': max_drawdown,
                'win_rate': win_rate,
                'total_return': total_return,
                'total_trades': int(total_trades)
            }
        }


def evaluate_model(
    model: Any,
    X_test: np.ndarray,
    y_test: np.ndarray,
    task: str = 'regression',
    scaler: Any = None,
    **kwargs
) -> EvaluationResult:
    """
    Convenience function to evaluate a model.
    
    Args:
        model: Trained model
        X_test: Test features
        y_test: Test targets
        task: 'regression' or 'classification'
        scaler: Scaler for inverse transform
        **kwargs: Additional arguments for Evaluator.evaluate()
        
    Returns:
        EvaluationResult
        
    Example:
        result = evaluate_model(model, X_test, y_test)
        print(f"R² Score: {result.metrics['r2']:.4f}")
    """
    evaluator = Evaluator(model, scaler=scaler)
    return evaluator.evaluate(X_test, y_test, task=task, **kwargs)


def compare_models(
    models: Dict[str, Any],
    X_test: np.ndarray,
    y_test: np.ndarray,
    task: str = 'regression'
) -> pd.DataFrame:
    """
    Compare multiple models on the same test set.
    
    Args:
        models: Dictionary of {name: model}
        X_test: Test features
        y_test: Test targets
        task: 'regression' or 'classification'
        
    Returns:
        DataFrame with comparison metrics
        
    Example:
        models = {'LSTM': lstm_model, 'XGBoost': xgb_model}
        comparison = compare_models(models, X_test, y_test)
        print(comparison)
    """
    results = []
    
    for name, model in models.items():
        print(f"\n📊 Evaluating {name}...")
        evaluator = Evaluator(model)
        result = evaluator.evaluate(X_test, y_test, task=task)
        
        row = {'model': name}
        row.update(result.metrics)
        results.append(row)
        
    df = pd.DataFrame(results)
    
    # Sort by appropriate metric
    if task == 'regression':
        df = df.sort_values('rmse', ascending=True)
    else:
        df = df.sort_values('f1', ascending=False)
        
    return df
