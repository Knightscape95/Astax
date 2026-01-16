"""
Tree-Based Models Module
========================

Provides scikit-learn and XGBoost model wrappers for trading ML:
- Random Forest: Ensemble of decision trees
- XGBoost: Gradient boosted trees

Tree-based models are often better suited for tabular data
and can be easier to interpret than neural networks.

Example Usage:
    from trading_ml_utils.models import RandomForestModel, XGBoostModel
    
    # Create and train Random Forest
    model = RandomForestModel(n_estimators=100, max_depth=10)
    model.fit(X_train, y_train)
    
    # Feature importance
    importance = model.feature_importance()
"""

import logging
from typing import Optional, Dict, Any, List

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


class RandomForestModel:
    """
    Random Forest model wrapper for trading prediction.
    
    Random Forest is an ensemble of decision trees that combines
    their predictions. It's robust to overfitting and provides
    feature importance rankings.
    
    When to use Random Forest:
    - You have tabular data with many features
    - You want to understand feature importance
    - You need a robust baseline model
    - Interpretability is important
    
    Args:
        n_estimators: Number of trees in the forest (more = better but slower)
        max_depth: Maximum tree depth (None for unlimited)
        min_samples_split: Minimum samples to split a node
        min_samples_leaf: Minimum samples at leaf node
        max_features: Number of features to consider for splits
        random_state: Random seed for reproducibility
        n_jobs: Number of parallel jobs (-1 for all CPUs)
        
    Example:
        model = RandomForestModel(
            n_estimators=100,
            max_depth=10,
            random_state=42
        )
        
        model.fit(X_train, y_train)
        predictions = model.predict(X_test)
        
        # View feature importance
        importance = model.feature_importance(feature_names=['open', 'high', 'low', 'close'])
    """
    
    def __init__(
        self,
        n_estimators: int = 100,
        max_depth: Optional[int] = None,
        min_samples_split: int = 2,
        min_samples_leaf: int = 1,
        max_features: str = 'sqrt',
        random_state: int = 42,
        n_jobs: int = -1,
        task: str = 'regression'
    ):
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.min_samples_split = min_samples_split
        self.min_samples_leaf = min_samples_leaf
        self.max_features = max_features
        self.random_state = random_state
        self.n_jobs = n_jobs
        self.task = task
        
        self._model = None
        self._build_model()
        
    def _build_model(self):
        """Build the sklearn model."""
        try:
            if self.task == 'regression':
                from sklearn.ensemble import RandomForestRegressor
                self._model = RandomForestRegressor(
                    n_estimators=self.n_estimators,
                    max_depth=self.max_depth,
                    min_samples_split=self.min_samples_split,
                    min_samples_leaf=self.min_samples_leaf,
                    max_features=self.max_features,
                    random_state=self.random_state,
                    n_jobs=self.n_jobs
                )
            else:
                from sklearn.ensemble import RandomForestClassifier
                self._model = RandomForestClassifier(
                    n_estimators=self.n_estimators,
                    max_depth=self.max_depth,
                    min_samples_split=self.min_samples_split,
                    min_samples_leaf=self.min_samples_leaf,
                    max_features=self.max_features,
                    random_state=self.random_state,
                    n_jobs=self.n_jobs
                )
        except ImportError:
            raise ImportError(
                "scikit-learn is not installed!\n\n"
                "💡 Fix: Run this command:\n"
                "   !pip install scikit-learn"
            )
            
    def fit(
        self,
        X: np.ndarray,
        y: np.ndarray,
        verbose: bool = True
    ) -> 'RandomForestModel':
        """
        Train the Random Forest model.
        
        Args:
            X: Training features (samples, features)
            y: Training targets
            verbose: Print training progress
            
        Returns:
            self for method chaining
        """
        # Flatten X if 3D (from sequence data)
        if len(X.shape) == 3:
            X = X.reshape(X.shape[0], -1)
            
        if verbose:
            print(f"🌲 Training Random Forest with {self.n_estimators} trees...")
            print(f"   Input shape: {X.shape}")
            
        self._model.fit(X, y)
        
        if verbose:
            print("✅ Training complete!")
            
        return self
        
    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Make predictions with the trained model.
        
        Args:
            X: Input features
            
        Returns:
            Predictions array
        """
        # Flatten X if 3D
        if len(X.shape) == 3:
            X = X.reshape(X.shape[0], -1)
            
        return self._model.predict(X)
        
    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """
        Get prediction probabilities (classification only).
        
        Args:
            X: Input features
            
        Returns:
            Probability array
        """
        if self.task != 'classification':
            raise ValueError("predict_proba only available for classification")
            
        if len(X.shape) == 3:
            X = X.reshape(X.shape[0], -1)
            
        return self._model.predict_proba(X)
        
    def feature_importance(
        self,
        feature_names: Optional[List[str]] = None,
        top_n: int = 20
    ) -> pd.DataFrame:
        """
        Get feature importance rankings.
        
        Args:
            feature_names: Names for the features
            top_n: Number of top features to return
            
        Returns:
            DataFrame with feature importance
        """
        importance = self._model.feature_importances_
        
        if feature_names is None:
            feature_names = [f'feature_{i}' for i in range(len(importance))]
        elif len(feature_names) != len(importance):
            feature_names = [f'feature_{i}' for i in range(len(importance))]
            
        df = pd.DataFrame({
            'feature': feature_names,
            'importance': importance
        }).sort_values('importance', ascending=False)
        
        return df.head(top_n)
        
    def get_config(self) -> Dict[str, Any]:
        """Get model configuration for serialization."""
        return {
            'model_type': 'random_forest',
            'task': self.task,
            'n_estimators': self.n_estimators,
            'max_depth': self.max_depth,
            'min_samples_split': self.min_samples_split,
            'min_samples_leaf': self.min_samples_leaf,
            'max_features': self.max_features,
            'random_state': self.random_state
        }
        
    @property
    def sklearn_model(self):
        """Get the underlying sklearn model."""
        return self._model


class XGBoostModel:
    """
    XGBoost model wrapper for trading prediction.
    
    XGBoost (eXtreme Gradient Boosting) is a powerful gradient
    boosted tree algorithm. It often wins ML competitions and
    is excellent for tabular data.
    
    When to use XGBoost:
    - You want state-of-the-art performance on tabular data
    - You have enough training data
    - Speed is important (XGBoost is highly optimized)
    - You want built-in regularization
    
    Args:
        n_estimators: Number of boosting rounds
        max_depth: Maximum tree depth
        learning_rate: Step size shrinkage (lower = more conservative)
        subsample: Fraction of samples for each tree
        colsample_bytree: Fraction of features for each tree
        reg_alpha: L1 regularization
        reg_lambda: L2 regularization
        random_state: Random seed
        
    Example:
        model = XGBoostModel(
            n_estimators=100,
            max_depth=6,
            learning_rate=0.1
        )
        
        model.fit(X_train, y_train, eval_set=[(X_val, y_val)])
        predictions = model.predict(X_test)
    """
    
    def __init__(
        self,
        n_estimators: int = 100,
        max_depth: int = 6,
        learning_rate: float = 0.1,
        subsample: float = 0.8,
        colsample_bytree: float = 0.8,
        reg_alpha: float = 0,
        reg_lambda: float = 1,
        random_state: int = 42,
        task: str = 'regression',
        early_stopping_rounds: Optional[int] = 10,
        use_gpu: bool = False
    ):
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.learning_rate = learning_rate
        self.subsample = subsample
        self.colsample_bytree = colsample_bytree
        self.reg_alpha = reg_alpha
        self.reg_lambda = reg_lambda
        self.random_state = random_state
        self.task = task
        self.early_stopping_rounds = early_stopping_rounds
        self.use_gpu = use_gpu
        
        self._model = None
        self._build_model()
        
    def _build_model(self):
        """Build the XGBoost model."""
        try:
            import xgboost as xgb
        except ImportError:
            raise ImportError(
                "XGBoost is not installed!\n\n"
                "💡 Fix: Run this command:\n"
                "   !pip install xgboost"
            )
            
        # Determine objective
        if self.task == 'regression':
            objective = 'reg:squarederror'
        elif self.task == 'classification':
            objective = 'binary:logistic'
        else:
            objective = 'reg:squarederror'
            
        # GPU settings
        tree_method = 'gpu_hist' if self.use_gpu else 'auto'
        
        self._model = xgb.XGBRegressor(
            n_estimators=self.n_estimators,
            max_depth=self.max_depth,
            learning_rate=self.learning_rate,
            subsample=self.subsample,
            colsample_bytree=self.colsample_bytree,
            reg_alpha=self.reg_alpha,
            reg_lambda=self.reg_lambda,
            random_state=self.random_state,
            objective=objective,
            tree_method=tree_method,
            verbosity=0
        )
        
    def fit(
        self,
        X: np.ndarray,
        y: np.ndarray,
        eval_set: Optional[list] = None,
        verbose: bool = True
    ) -> 'XGBoostModel':
        """
        Train the XGBoost model.
        
        Args:
            X: Training features
            y: Training targets
            eval_set: List of (X, y) tuples for validation
            verbose: Print training progress
            
        Returns:
            self for method chaining
            
        Example:
            model.fit(X_train, y_train, eval_set=[(X_val, y_val)])
        """
        # Flatten X if 3D
        if len(X.shape) == 3:
            X = X.reshape(X.shape[0], -1)
            
        if verbose:
            print(f"🚀 Training XGBoost with {self.n_estimators} rounds...")
            print(f"   Input shape: {X.shape}")
            print(f"   Learning rate: {self.learning_rate}")
            print(f"   Max depth: {self.max_depth}")
            
        # Prepare eval set
        if eval_set:
            eval_set = [
                (e[0].reshape(e[0].shape[0], -1) if len(e[0].shape) == 3 else e[0], e[1])
                for e in eval_set
            ]
            
        # Fit model
        fit_params = {
            'eval_set': eval_set,
            'verbose': verbose
        }
        
        if self.early_stopping_rounds and eval_set:
            fit_params['early_stopping_rounds'] = self.early_stopping_rounds
            
        self._model.fit(X, y, **fit_params)
        
        if verbose:
            print("✅ Training complete!")
            
        return self
        
    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Make predictions with the trained model.
        
        Args:
            X: Input features
            
        Returns:
            Predictions array
        """
        if len(X.shape) == 3:
            X = X.reshape(X.shape[0], -1)
            
        return self._model.predict(X)
        
    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """
        Get prediction probabilities (classification only).
        
        Args:
            X: Input features
            
        Returns:
            Probability array
        """
        if len(X.shape) == 3:
            X = X.reshape(X.shape[0], -1)
            
        return self._model.predict_proba(X)
        
    def feature_importance(
        self,
        feature_names: Optional[List[str]] = None,
        importance_type: str = 'weight',
        top_n: int = 20
    ) -> pd.DataFrame:
        """
        Get feature importance rankings.
        
        Args:
            feature_names: Names for the features
            importance_type: Type of importance ('weight', 'gain', 'cover')
            top_n: Number of top features to return
            
        Returns:
            DataFrame with feature importance
        """
        importance = self._model.feature_importances_
        
        if feature_names is None:
            feature_names = [f'feature_{i}' for i in range(len(importance))]
        elif len(feature_names) != len(importance):
            feature_names = [f'feature_{i}' for i in range(len(importance))]
            
        df = pd.DataFrame({
            'feature': feature_names,
            'importance': importance
        }).sort_values('importance', ascending=False)
        
        return df.head(top_n)
        
    def get_config(self) -> Dict[str, Any]:
        """Get model configuration for serialization."""
        return {
            'model_type': 'xgboost',
            'task': self.task,
            'n_estimators': self.n_estimators,
            'max_depth': self.max_depth,
            'learning_rate': self.learning_rate,
            'subsample': self.subsample,
            'colsample_bytree': self.colsample_bytree,
            'reg_alpha': self.reg_alpha,
            'reg_lambda': self.reg_lambda,
            'random_state': self.random_state
        }
        
    @property
    def xgb_model(self):
        """Get the underlying XGBoost model."""
        return self._model


def create_tree_model(
    model_type: str,
    **kwargs
) -> Any:
    """
    Factory function to create tree-based models.
    
    Args:
        model_type: Type of model ('random_forest', 'xgboost')
        **kwargs: Model-specific arguments
        
    Returns:
        Initialized model instance
        
    Example:
        # Create Random Forest
        model = create_tree_model('random_forest', n_estimators=100)
        
        # Create XGBoost
        model = create_tree_model('xgboost', learning_rate=0.1, max_depth=6)
    """
    model_type = model_type.lower().replace(' ', '_')
    
    if model_type in ['random_forest', 'randomforest', 'rf']:
        return RandomForestModel(**kwargs)
    elif model_type in ['xgboost', 'xgb']:
        return XGBoostModel(**kwargs)
    else:
        raise ValueError(
            f"Unknown model type: '{model_type}'\n\n"
            "💡 Available tree-based models:\n"
            "   - 'random_forest': Random Forest (ensemble of trees)\n"
            "   - 'xgboost': XGBoost (gradient boosted trees)"
        )
