"""
Custom Error Classes Module
===========================

Provides beginner-friendly error classes with helpful messages
and suggestions for fixes.

All errors include:
- Clear explanation of what went wrong
- Why it might have happened
- Suggested fixes
- Links to documentation when applicable
"""


class TradingMLError(Exception):
    """
    Base exception for trading_ml_utils package.
    
    All custom errors inherit from this class.
    """
    
    def __init__(self, message: str, suggestion: str = None):
        self.message = message
        self.suggestion = suggestion
        super().__init__(self._format_message())
        
    def _format_message(self) -> str:
        """Format the error message with suggestion."""
        msg = f"\n{'='*50}\n❌ Error: {self.message}"
        if self.suggestion:
            msg += f"\n\n💡 Suggestion: {self.suggestion}"
        msg += f"\n{'='*50}"
        return msg


class DataFetchError(TradingMLError):
    """
    Error during data fetching operations.
    
    Common causes:
    - Invalid ticker symbol
    - Network connectivity issues
    - API rate limits exceeded
    - Invalid date range
    """
    
    def __init__(self, message: str, suggestion: str = None):
        if suggestion is None:
            suggestion = (
                "Check your internet connection and verify the ticker symbol is correct. "
                "If using Alpha Vantage, ensure your API key is valid."
            )
        super().__init__(message, suggestion)


class PreprocessingError(TradingMLError):
    """
    Error during data preprocessing.
    
    Common causes:
    - Missing required columns
    - Invalid data types
    - Insufficient data points
    - NaN values in critical columns
    """
    
    def __init__(self, message: str, suggestion: str = None):
        if suggestion is None:
            suggestion = (
                "Check that your data has all required columns and no excessive missing values. "
                "Use DataValidator to identify data quality issues."
            )
        super().__init__(message, suggestion)


class CheckpointError(TradingMLError):
    """
    Error during checkpoint save/load operations.
    
    Common causes:
    - Insufficient disk space
    - Invalid checkpoint file
    - Missing h5py library
    - Permission denied
    """
    
    def __init__(self, message: str, suggestion: str = None):
        if suggestion is None:
            suggestion = (
                "Ensure h5py is installed (!pip install h5py) and you have sufficient "
                "disk space in your Google Drive."
            )
        super().__init__(message, suggestion)


class DashboardAPIError(TradingMLError):
    """
    Error communicating with the dashboard API.
    
    Common causes:
    - Invalid or expired API key
    - Network connectivity issues
    - Server unavailable
    - Rate limit exceeded
    """
    
    def __init__(self, message: str, suggestion: str = None):
        if suggestion is None:
            suggestion = (
                "Check your internet connection and verify your API key is correct. "
                "If the error persists, the dashboard server may be temporarily unavailable."
            )
        super().__init__(message, suggestion)


class RateLimitError(TradingMLError):
    """
    Error when API rate limit is exceeded.
    
    This error is raised when:
    - Too many API calls in a short period
    - Maximum retries exceeded while waiting for rate limit reset
    """
    
    def __init__(self, message: str, suggestion: str = None):
        if suggestion is None:
            suggestion = (
                "Wait a few minutes before trying again. Consider using a different "
                "data source or caching your data locally."
            )
        super().__init__(message, suggestion)


class ModelError(TradingMLError):
    """
    Error during model creation or training.
    
    Common causes:
    - Invalid hyperparameters
    - Insufficient memory
    - Incompatible input shapes
    - Missing PyTorch/sklearn
    """
    
    def __init__(self, message: str, suggestion: str = None):
        if suggestion is None:
            suggestion = (
                "Check your model configuration and ensure all required libraries "
                "are installed. For memory issues, try reducing batch size."
            )
        super().__init__(message, suggestion)


class ExportError(TradingMLError):
    """
    Error during model export to ONNX.
    
    Common causes:
    - Unsupported model operations
    - Missing ONNX libraries
    - Invalid input shapes
    """
    
    def __init__(self, message: str, suggestion: str = None):
        if suggestion is None:
            suggestion = (
                "Ensure onnx and onnxruntime are installed. Some model operations "
                "may not be supported in ONNX format."
            )
        super().__init__(message, suggestion)


class ValidationError(TradingMLError):
    """
    Error during data validation.
    
    Common causes:
    - Data quality issues
    - Missing required fields
    - Out-of-range values
    """
    
    def __init__(self, message: str, suggestion: str = None):
        if suggestion is None:
            suggestion = (
                "Review the validation results and address the identified issues. "
                "Common fixes include handling missing values and removing outliers."
            )
        super().__init__(message, suggestion)


def format_error_for_beginners(error: Exception) -> str:
    """
    Format any exception into a beginner-friendly message.
    
    Args:
        error: The exception to format
        
    Returns:
        Formatted error message string
    """
    error_type = type(error).__name__
    error_msg = str(error)
    
    # Common error explanations
    explanations = {
        'ImportError': (
            "A required library is not installed.",
            "Run !pip install <library_name> in a code cell."
        ),
        'FileNotFoundError': (
            "The specified file or directory does not exist.",
            "Check the file path and ensure the file exists."
        ),
        'PermissionError': (
            "You don't have permission to access this resource.",
            "If using Google Drive, make sure it's properly mounted."
        ),
        'MemoryError': (
            "The system ran out of memory.",
            "Try reducing batch size or using a simpler model."
        ),
        'KeyError': (
            "The specified key was not found in the dictionary or DataFrame.",
            "Check that the column/key name is spelled correctly."
        ),
        'ValueError': (
            "An invalid value was provided.",
            "Check your input values and data types."
        ),
        'TypeError': (
            "An operation was performed on an incompatible type.",
            "Check that your variables have the expected types."
        ),
        'RuntimeError': (
            "An error occurred during execution.",
            "Check the error message for specific details."
        ),
        'ConnectionError': (
            "Could not connect to the server.",
            "Check your internet connection."
        ),
        'TimeoutError': (
            "The operation timed out.",
            "The server may be slow or unavailable. Try again later."
        )
    }
    
    explanation, suggestion = explanations.get(
        error_type,
        ("An unexpected error occurred.", "Check the error message for details.")
    )
    
    return f"""
{'='*60}
❌ {error_type}: {explanation}

📋 Details: {error_msg}

💡 Suggestion: {suggestion}
{'='*60}
"""
