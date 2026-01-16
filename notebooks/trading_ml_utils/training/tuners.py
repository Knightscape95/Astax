"""
Hyperparameter Tuners Module
============================

Provides hyperparameter tuning utilities for model optimization.

Features:
- Grid Search
- Random Search
- Optuna integration (if available)
- Progress tracking
- Best parameter selection

Example Usage:
    from trading_ml_utils.training import HyperparameterTuner
    
    tuner = HyperparameterTuner(
        model_class=LSTMModel,
        param_grid={
            'hidden_dim': [32, 64, 128],
            'num_layers': [1, 2, 3],
            'dropout': [0.1, 0.2, 0.3]
        }
    )
    
    best_params, best_score = tuner.search(X_train, y_train, X_val, y_val)
"""

import time
import logging
from typing import Dict, Any, List, Tuple, Optional, Callable
from itertools import product
import random

import numpy as np

logger = logging.getLogger(__name__)


class HyperparameterTuner:
    """
    Hyperparameter tuning for ML models.
    
    Supports grid search and random search strategies
    for finding optimal model parameters.
    
    Args:
        model_class: Class of model to tune
        param_grid: Dictionary of parameter names to value lists
        scoring: Metric to optimize ('val_loss', 'mse', 'accuracy')
        maximize: Whether to maximize the score (default: False for loss)
        
    Example:
        tuner = HyperparameterTuner(
            model_class=LSTMModel,
            param_grid={
                'hidden_dim': [32, 64, 128],
                'num_layers': [1, 2],
                'dropout': [0.1, 0.2]
            }
        )
        
        # Grid search
        best_params, best_score = tuner.grid_search(
            X_train, y_train, X_val, y_val,
            epochs=50
        )
        
        # Random search
        best_params, best_score = tuner.random_search(
            X_train, y_train, X_val, y_val,
            n_trials=20,
            epochs=50
        )
    """
    
    def __init__(
        self,
        model_class: Any,
        param_grid: Dict[str, List[Any]],
        scoring: str = 'val_loss',
        maximize: bool = False,
        verbose: bool = True
    ):
        self.model_class = model_class
        self.param_grid = param_grid
        self.scoring = scoring
        self.maximize = maximize
        self.verbose = verbose
        
        self.results: List[Dict[str, Any]] = []
        self.best_params: Optional[Dict[str, Any]] = None
        self.best_score: float = float('inf') if not maximize else float('-inf')
        
    def grid_search(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray,
        y_val: np.ndarray,
        epochs: int = 50,
        **training_kwargs
    ) -> Tuple[Dict[str, Any], float]:
        """
        Perform exhaustive grid search over all parameter combinations.
        
        Args:
            X_train: Training features
            y_train: Training targets
            X_val: Validation features
            y_val: Validation targets
            epochs: Number of epochs per trial
            **training_kwargs: Additional training arguments
            
        Returns:
            Tuple of (best_params, best_score)
        """
        # Generate all parameter combinations
        param_names = list(self.param_grid.keys())
        param_values = list(self.param_grid.values())
        combinations = list(product(*param_values))
        
        n_combinations = len(combinations)
        
        if self.verbose:
            print("🔍 Starting Grid Search")
            print(f"   Total combinations: {n_combinations}")
            print(f"   Parameters: {param_names}")
            print("=" * 50)
            
        start_time = time.time()
        
        for i, values in enumerate(combinations):
            params = dict(zip(param_names, values))
            
            if self.verbose:
                print(f"\n[{i+1}/{n_combinations}] Testing: {params}")
                
            score = self._train_and_evaluate(
                params, X_train, y_train, X_val, y_val,
                epochs=epochs, **training_kwargs
            )
            
            self.results.append({
                'params': params,
                'score': score
            })
            
            # Update best
            if self._is_better(score):
                self.best_params = params
                self.best_score = score
                if self.verbose:
                    print(f"   🎯 New best! Score: {score:.6f}")
                    
        total_time = time.time() - start_time
        
        if self.verbose:
            print("\n" + "=" * 50)
            print("✅ Grid Search Complete!")
            print(f"   Total time: {total_time/60:.1f} minutes")
            print(f"   Best params: {self.best_params}")
            print(f"   Best score: {self.best_score:.6f}")
            
        return self.best_params, self.best_score
        
    def random_search(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray,
        y_val: np.ndarray,
        n_trials: int = 20,
        epochs: int = 50,
        **training_kwargs
    ) -> Tuple[Dict[str, Any], float]:
        """
        Perform random search over parameter space.
        
        Random search is often more efficient than grid search
        when some parameters are more important than others.
        
        Args:
            X_train: Training features
            y_train: Training targets
            X_val: Validation features
            y_val: Validation targets
            n_trials: Number of random combinations to try
            epochs: Number of epochs per trial
            **training_kwargs: Additional training arguments
            
        Returns:
            Tuple of (best_params, best_score)
        """
        if self.verbose:
            print("🎲 Starting Random Search")
            print(f"   Number of trials: {n_trials}")
            print("=" * 50)
            
        start_time = time.time()
        
        for i in range(n_trials):
            # Sample random parameters
            params = {}
            for name, values in self.param_grid.items():
                params[name] = random.choice(values)
                
            if self.verbose:
                print(f"\n[{i+1}/{n_trials}] Testing: {params}")
                
            score = self._train_and_evaluate(
                params, X_train, y_train, X_val, y_val,
                epochs=epochs, **training_kwargs
            )
            
            self.results.append({
                'params': params,
                'score': score
            })
            
            if self._is_better(score):
                self.best_params = params
                self.best_score = score
                if self.verbose:
                    print(f"   🎯 New best! Score: {score:.6f}")
                    
        total_time = time.time() - start_time
        
        if self.verbose:
            print("\n" + "=" * 50)
            print("✅ Random Search Complete!")
            print(f"   Total time: {total_time/60:.1f} minutes")
            print(f"   Best params: {self.best_params}")
            print(f"   Best score: {self.best_score:.6f}")
            
        return self.best_params, self.best_score
        
    def _train_and_evaluate(
        self,
        params: Dict[str, Any],
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray,
        y_val: np.ndarray,
        epochs: int,
        **training_kwargs
    ) -> float:
        """Train a model with given parameters and return validation score."""
        from ..training import Trainer
        
        try:
            # Create model with parameters
            model = self.model_class(**params)
            
            # Train model
            trainer = Trainer(model, verbose=False)
            history = trainer.fit(
                X_train, y_train,
                X_val, y_val,
                epochs=epochs,
                early_stopping=True,
                patience=5,
                **training_kwargs
            )
            
            # Get score
            if self.scoring == 'val_loss':
                score = history.best_val_loss
            elif self.scoring in history.val_metrics:
                score = min(history.val_metrics[self.scoring])
            else:
                score = history.best_val_loss
                
            return score
            
        except Exception as e:
            logger.warning(f"Trial failed with error: {e}")
            return float('inf') if not self.maximize else float('-inf')
            
    def _is_better(self, score: float) -> bool:
        """Check if a score is better than the current best."""
        if self.maximize:
            return score > self.best_score
        else:
            return score < self.best_score
            
    def get_results_dataframe(self):
        """Get results as a pandas DataFrame."""
        import pandas as pd
        
        rows = []
        for result in self.results:
            row = result['params'].copy()
            row['score'] = result['score']
            rows.append(row)
            
        df = pd.DataFrame(rows)
        df = df.sort_values('score', ascending=not self.maximize)
        return df
        
    def get_top_n(self, n: int = 5) -> List[Dict[str, Any]]:
        """Get top N parameter combinations."""
        sorted_results = sorted(
            self.results,
            key=lambda x: x['score'],
            reverse=self.maximize
        )
        return sorted_results[:n]


class OptunaHelper:
    """
    Helper class for Optuna hyperparameter optimization.
    
    Optuna is a more sophisticated hyperparameter optimization
    library that uses Bayesian optimization and pruning.
    
    Requires: pip install optuna
    
    Example:
        helper = OptunaHelper(model_class=LSTMModel)
        
        def objective(trial):
            params = {
                'hidden_dim': trial.suggest_int('hidden_dim', 32, 128),
                'num_layers': trial.suggest_int('num_layers', 1, 3),
                'dropout': trial.suggest_float('dropout', 0.1, 0.5)
            }
            return helper.train_and_evaluate(params, X_train, y_train, X_val, y_val)
            
        best_params = helper.optimize(objective, n_trials=50)
    """
    
    def __init__(
        self,
        model_class: Any,
        epochs: int = 50,
        verbose: bool = True
    ):
        self.model_class = model_class
        self.epochs = epochs
        self.verbose = verbose
        
        try:
            import optuna
            self._optuna = optuna
        except ImportError:
            raise ImportError(
                "Optuna is not installed!\n\n"
                "💡 Fix: Run this command:\n"
                "   !pip install optuna"
            )
            
    def optimize(
        self,
        objective: Callable,
        n_trials: int = 50,
        direction: str = 'minimize'
    ) -> Dict[str, Any]:
        """
        Run Optuna optimization.
        
        Args:
            objective: Objective function that takes a trial and returns score
            n_trials: Number of trials
            direction: 'minimize' or 'maximize'
            
        Returns:
            Best parameters found
        """
        study = self._optuna.create_study(direction=direction)
        
        if self.verbose:
            study.optimize(objective, n_trials=n_trials)
        else:
            self._optuna.logging.set_verbosity(self._optuna.logging.WARNING)
            study.optimize(objective, n_trials=n_trials, show_progress_bar=False)
            
        if self.verbose:
            print("\n" + "=" * 50)
            print("✅ Optuna Optimization Complete!")
            print(f"   Best trial: {study.best_trial.number}")
            print(f"   Best value: {study.best_value:.6f}")
            print(f"   Best params: {study.best_params}")
            
        return study.best_params
        
    def create_param_distributions(
        self,
        param_config: Dict[str, Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Create Optuna suggest functions from config.
        
        Args:
            param_config: Dictionary defining parameter ranges
            
        Example:
            config = {
                'hidden_dim': {'type': 'int', 'low': 32, 'high': 128},
                'dropout': {'type': 'float', 'low': 0.1, 'high': 0.5},
                'activation': {'type': 'categorical', 'choices': ['relu', 'tanh']}
            }
        """
        return param_config  # Used by objective function
