"""
Dashboard API Client Module
===========================

Provides a client for communicating with the Traycer dashboard API.

Features:
- Create and manage experiments
- Log training metrics
- Update experiment status
- Automatic retry with exponential backoff
- API key authentication

Example Usage:
    from trading_ml_utils.dashboard import DashboardClient
    
    # Initialize client
    client = DashboardClient(
        base_url='https://your-dashboard.vercel.app',
        api_key='your-api-key'
    )
    
    # Create experiment
    experiment_id = client.create_experiment({
        'name': 'LSTM Training',
        'model_type': 'LSTM',
        'target_asset': 'AAPL'
    })
    
    # Log metrics during training
    for epoch in range(100):
        # ... training code ...
        client.log_epoch_metrics(experiment_id, epoch, {
            'train_loss': train_loss,
            'val_loss': val_loss
        })
        
    # Complete experiment
    client.complete_experiment(experiment_id, final_metrics)
"""

import time
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime
from dataclasses import dataclass, asdict

from ..utils.errors import DashboardAPIError

logger = logging.getLogger(__name__)


@dataclass
class ExperimentConfig:
    """
    Configuration for a new experiment.
    
    Attributes:
        name: Human-readable experiment name
        model_type: Type of model ('LSTM', 'XGBoost', etc.)
        target_asset: Asset being predicted
        data_source: Data source used ('yahoo', 'alpha_vantage', 'nse_bse')
        date_range_start: Start date of training data
        date_range_end: End date of training data
        train_test_split: Train/test split ratio
        hyperparameters: Model hyperparameters
        features: List of feature names
    """
    name: str
    model_type: str
    target_asset: str
    data_source: str = 'yahoo'
    date_range_start: str = ''
    date_range_end: str = ''
    train_test_split: float = 0.8
    hyperparameters: Dict[str, Any] = None
    features: List[str] = None
    
    def __post_init__(self):
        if self.hyperparameters is None:
            self.hyperparameters = {}
        if self.features is None:
            self.features = []


@dataclass
class EpochMetrics:
    """
    Metrics for a single training epoch.
    
    Attributes:
        epoch: Epoch number
        train_loss: Training loss
        train_accuracy: Training accuracy (optional)
        val_loss: Validation loss (optional)
        val_accuracy: Validation accuracy (optional)
        learning_rate: Current learning rate (optional)
        training_time_seconds: Time taken for this epoch
    """
    epoch: int
    train_loss: float
    train_accuracy: Optional[float] = None
    val_loss: Optional[float] = None
    val_accuracy: Optional[float] = None
    learning_rate: Optional[float] = None
    training_time_seconds: Optional[float] = None


class DashboardClient:
    """
    Client for the Traycer Dashboard API.
    
    Handles all communication with the dashboard including:
    - Experiment creation and management
    - Metric logging
    - Status updates
    - Error handling with retries
    
    The client uses API key authentication. Store your API key
    securely in Colab Secrets.
    
    Args:
        base_url: Dashboard API base URL
        api_key: API key for authentication
        timeout: Request timeout in seconds
        max_retries: Maximum retry attempts for failed requests
        
    Example:
        # Get API key from Colab Secrets
        from google.colab import userdata
        api_key = userdata.get('DASHBOARD_API_KEY')
        
        client = DashboardClient(
            base_url='https://your-dashboard.vercel.app',
            api_key=api_key
        )
        
        # Create and track experiment
        exp_id = client.create_experiment({...})
        client.log_epoch_metrics(exp_id, 0, {...})
        client.complete_experiment(exp_id, {...})
    """
    
    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout: int = 30,
        max_retries: int = 3
    ):
        # Clean up base URL
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.timeout = timeout
        self.max_retries = max_retries
        
        # Validate inputs
        if not api_key:
            raise DashboardAPIError(
                "API key is required!\n\n"
                "💡 How to set up API key in Colab:\n"
                "   1. Click the 🔑 icon in the left sidebar\n"
                "   2. Add a secret named 'DASHBOARD_API_KEY'\n"
                "   3. Paste your API key as the value\n\n"
                "Then access it in your notebook:\n"
                "   from google.colab import userdata\n"
                "   api_key = userdata.get('DASHBOARD_API_KEY')"
            )
            
        # Import requests
        self._requests = None
        self._check_requests()
        
        # Queue for offline mode
        self._offline_queue: List[Dict[str, Any]] = []
        self._is_online = True
        
    def _check_requests(self):
        """Check that requests library is available."""
        try:
            import requests
            self._requests = requests
        except ImportError:
            raise DashboardAPIError(
                "requests library is not installed!\n\n"
                "💡 Fix: Run this command:\n"
                "   !pip install requests"
            )
            
    def _get_headers(self) -> Dict[str, str]:
        """Get request headers with authentication."""
        return {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.api_key}',
            'X-Client-Version': '1.0.0'
        }
        
    def _make_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Make an API request with retry logic.
        
        Args:
            method: HTTP method ('GET', 'POST', 'PATCH', 'DELETE')
            endpoint: API endpoint path
            data: Request body data
            params: URL query parameters
            
        Returns:
            Response data as dictionary
        """
        url = f"{self.base_url}/api{endpoint}"
        
        last_error = None
        
        for attempt in range(self.max_retries):
            try:
                response = self._requests.request(
                    method=method,
                    url=url,
                    json=data,
                    params=params,
                    headers=self._get_headers(),
                    timeout=self.timeout
                )
                
                # Check for success
                if response.status_code in [200, 201]:
                    self._is_online = True
                    return response.json()
                    
                # Handle specific errors
                if response.status_code == 401:
                    raise DashboardAPIError(
                        "Authentication failed!\n\n"
                        "💡 Your API key may be invalid or expired.\n"
                        "   Check your DASHBOARD_API_KEY in Colab Secrets."
                    )
                    
                if response.status_code == 429:
                    # Rate limited - wait and retry
                    retry_after = int(response.headers.get('Retry-After', 60))
                    print(f"⏳ Rate limited. Waiting {retry_after}s...")
                    time.sleep(retry_after)
                    continue
                    
                if response.status_code >= 500:
                    # Server error - retry
                    raise DashboardAPIError(f"Server error: {response.status_code}")
                    
                # Client error
                error_data = response.json() if response.content else {}
                raise DashboardAPIError(
                    f"API error ({response.status_code}): {error_data.get('error', 'Unknown error')}"
                )
                
            except self._requests.exceptions.Timeout:
                last_error = DashboardAPIError("Request timed out")
                
            except self._requests.exceptions.ConnectionError:
                last_error = DashboardAPIError(
                    "Could not connect to dashboard!\n\n"
                    "💡 Check your internet connection or the dashboard URL."
                )
                self._is_online = False
                
            except DashboardAPIError:
                raise
                
            except Exception as e:
                last_error = DashboardAPIError(f"Request failed: {e}")
                
            # Exponential backoff
            if attempt < self.max_retries - 1:
                delay = (2 ** attempt) + (time.time() % 1)
                print(f"⏳ Retrying in {delay:.1f}s (attempt {attempt + 2}/{self.max_retries})...")
                time.sleep(delay)
                
        # All retries failed
        if last_error:
            raise last_error
        raise DashboardAPIError("Request failed after all retries")
        
    def create_experiment(
        self,
        config: Dict[str, Any]
    ) -> str:
        """
        Create a new experiment in the dashboard.
        
        Args:
            config: Experiment configuration dictionary or ExperimentConfig
            
        Returns:
            Experiment ID (UUID string)
            
        Example:
            experiment_id = client.create_experiment({
                'name': 'LSTM AAPL Prediction',
                'model_type': 'LSTM',
                'target_asset': 'AAPL',
                'data_source': 'yahoo',
                'date_range_start': '2020-01-01',
                'date_range_end': '2023-12-31',
                'hyperparameters': {
                    'hidden_dim': 64,
                    'num_layers': 2,
                    'learning_rate': 0.001
                }
            })
        """
        print("📝 Creating experiment in dashboard...")
        
        # Convert ExperimentConfig if needed
        if isinstance(config, ExperimentConfig):
            config = asdict(config)
            
        # Add timestamp
        config['started_at'] = datetime.now().isoformat()
        config['status'] = 'running'
        
        try:
            response = self._make_request('POST', '/experiments', data=config)
            experiment_id = response.get('id')
            
            print(f"   ✅ Experiment created: {experiment_id[:8]}...")
            
            return experiment_id
            
        except DashboardAPIError as e:
            # Queue for later if offline
            if not self._is_online:
                self._queue_offline('create_experiment', config)
                print("   ⚠️ Queued for later (offline mode)")
                return f"offline_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            raise
            
    def update_experiment(
        self,
        experiment_id: str,
        updates: Dict[str, Any]
    ) -> bool:
        """
        Update experiment status or metrics.
        
        Args:
            experiment_id: Experiment ID
            updates: Dictionary of fields to update
            
        Returns:
            True if successful
        """
        try:
            self._make_request(
                'PATCH',
                f'/experiments/{experiment_id}',
                data=updates
            )
            return True
            
        except DashboardAPIError as e:
            if not self._is_online:
                self._queue_offline('update_experiment', {
                    'experiment_id': experiment_id,
                    'updates': updates
                })
                return True
            raise
            
    def log_epoch_metrics(
        self,
        experiment_id: str,
        epoch: int,
        metrics: Dict[str, float]
    ) -> bool:
        """
        Log metrics for a training epoch.
        
        Args:
            experiment_id: Experiment ID
            epoch: Epoch number
            metrics: Dictionary of metric values
            
        Returns:
            True if successful
            
        Example:
            client.log_epoch_metrics(exp_id, epoch, {
                'train_loss': 0.05,
                'val_loss': 0.06,
                'train_accuracy': 0.95,
                'val_accuracy': 0.93,
                'learning_rate': 0.001
            })
        """
        data = {
            'epoch': epoch,
            'timestamp': datetime.now().isoformat(),
            **metrics
        }
        
        try:
            self._make_request(
                'POST',
                f'/experiments/{experiment_id}/metrics',
                data=data
            )
            return True
            
        except DashboardAPIError:
            if not self._is_online:
                self._queue_offline('log_metrics', {
                    'experiment_id': experiment_id,
                    'data': data
                })
                return True
            # Don't raise for metric logging - just warn
            logger.warning(f"Failed to log metrics for epoch {epoch}")
            return False
            
    def log_batch_metrics(
        self,
        experiment_id: str,
        metrics_list: List[Dict[str, Any]]
    ) -> bool:
        """
        Log metrics for multiple epochs at once.
        
        More efficient than calling log_epoch_metrics repeatedly.
        
        Args:
            experiment_id: Experiment ID
            metrics_list: List of metric dictionaries
            
        Returns:
            True if successful
        """
        try:
            self._make_request(
                'POST',
                f'/experiments/{experiment_id}/metrics/batch',
                data={'metrics': metrics_list}
            )
            return True
            
        except DashboardAPIError:
            logger.warning("Failed to log batch metrics")
            return False
            
    def complete_experiment(
        self,
        experiment_id: str,
        final_metrics: Dict[str, Any],
        model_id: Optional[str] = None
    ) -> bool:
        """
        Mark an experiment as complete with final metrics.
        
        Args:
            experiment_id: Experiment ID
            final_metrics: Final evaluation metrics
            model_id: ID of deployed model (if any)
            
        Returns:
            True if successful
            
        Example:
            client.complete_experiment(exp_id, {
                'test_accuracy': 0.92,
                'test_precision': 0.91,
                'test_recall': 0.93,
                'test_f1': 0.92,
                'sharpe_ratio': 1.5,
                'max_drawdown': 0.15,
                'training_duration_seconds': 3600,
                'total_epochs': 100
            })
        """
        print("📊 Completing experiment...")
        
        updates = {
            'status': 'completed',
            'completed_at': datetime.now().isoformat(),
            **final_metrics
        }
        
        if model_id:
            updates['model_id'] = model_id
            
        try:
            result = self.update_experiment(experiment_id, updates)
            print("   ✅ Experiment marked as complete")
            return result
            
        except DashboardAPIError as e:
            if not self._is_online:
                self._queue_offline('complete_experiment', {
                    'experiment_id': experiment_id,
                    'updates': updates
                })
                print("   ⚠️ Queued for sync (offline)")
                return True
            raise
            
    def fail_experiment(
        self,
        experiment_id: str,
        error_message: str
    ) -> bool:
        """
        Mark an experiment as failed.
        
        Args:
            experiment_id: Experiment ID
            error_message: Description of the error
            
        Returns:
            True if successful
        """
        return self.update_experiment(experiment_id, {
            'status': 'failed',
            'completed_at': datetime.now().isoformat(),
            'error_message': error_message
        })
        
    def get_experiment(
        self,
        experiment_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get experiment details.
        
        Args:
            experiment_id: Experiment ID
            
        Returns:
            Experiment data dictionary
        """
        try:
            return self._make_request('GET', f'/experiments/{experiment_id}')
        except DashboardAPIError:
            return None
            
    def list_experiments(
        self,
        status: Optional[str] = None,
        model_type: Optional[str] = None,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """
        List experiments with optional filtering.
        
        Args:
            status: Filter by status ('running', 'completed', 'failed')
            model_type: Filter by model type
            limit: Maximum number to return
            
        Returns:
            List of experiment dictionaries
        """
        params = {'limit': limit}
        if status:
            params['status'] = status
        if model_type:
            params['model_type'] = model_type
            
        try:
            response = self._make_request('GET', '/experiments', params=params)
            return response.get('experiments', [])
        except DashboardAPIError:
            return []
            
    def _queue_offline(self, action: str, data: Dict[str, Any]):
        """Queue an action for later sync when offline."""
        self._offline_queue.append({
            'action': action,
            'data': data,
            'timestamp': datetime.now().isoformat()
        })
        
    def sync_offline_queue(self) -> int:
        """
        Sync queued offline actions to the dashboard.
        
        Call this when you regain network connectivity.
        
        Returns:
            Number of successfully synced actions
        """
        if not self._offline_queue:
            return 0
            
        print(f"🔄 Syncing {len(self._offline_queue)} offline actions...")
        
        synced = 0
        remaining = []
        
        for item in self._offline_queue:
            try:
                action = item['action']
                data = item['data']
                
                if action == 'create_experiment':
                    self.create_experiment(data)
                elif action == 'update_experiment':
                    self.update_experiment(data['experiment_id'], data['updates'])
                elif action == 'log_metrics':
                    self.log_epoch_metrics(
                        data['experiment_id'],
                        data['data']['epoch'],
                        data['data']
                    )
                elif action == 'complete_experiment':
                    self.update_experiment(data['experiment_id'], data['updates'])
                    
                synced += 1
                
            except DashboardAPIError:
                remaining.append(item)
                
        self._offline_queue = remaining
        
        print(f"   ✅ Synced {synced} actions, {len(remaining)} remaining")
        
        return synced
        
    def health_check(self) -> bool:
        """
        Check if the dashboard API is accessible.
        
        Returns:
            True if API is healthy
        """
        try:
            response = self._make_request('GET', '/health')
            return response.get('status') == 'ok'
        except Exception:
            return False
