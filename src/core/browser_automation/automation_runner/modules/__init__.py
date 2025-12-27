# -*- coding: utf-8 -*-
"""
Modules package for FormExecutor modular architecture.

Includes:
- Core execution modules (Widget, Timing, Visual, Viewport, Element, Interaction, Validator)
- PostSubmit modules (TabManager, URLCapturer, LoginDetector, PostSubmitExecutor)
- Storage (AutomationResultStorage)
"""

from .widget_controller import WidgetController
from .timing import Timing
from .visual_feedback import VisualFeedback
from .viewport_controller import ViewportController
from .element_finder import ElementFinder
from .interaction import Interaction
from .validator import Validator

# PostSubmit modules
from .tab_manager import TabManager, TabConfig, TabResult
from .url_capturer import URLCapturer, URLCaptureConfig, CaptureResult
from .login_detector import LoginDetector, LoginConfig, LoginResult
from .postsubmit_executor import PostSubmitExecutor, PostSubmitConfig, PostSubmitResult
from .automation_result_storage import (
    AutomationResultStorage,
    AutomationMeta,
    RowResult,
    PostSubmitResult as PostSubmitRowResult
)

__all__ = [
    # Core modules
    'WidgetController',
    'Timing', 
    'VisualFeedback',
    'ViewportController',
    'ElementFinder',
    'Interaction',
    'Validator',
    # PostSubmit modules
    'TabManager',
    'TabConfig',
    'TabResult',
    'URLCapturer',
    'URLCaptureConfig',
    'CaptureResult',
    'LoginDetector',
    'LoginConfig',
    'LoginResult',
    'PostSubmitExecutor',
    'PostSubmitConfig',
    'PostSubmitResult',
    # Storage
    'AutomationResultStorage',
    'AutomationMeta',
    'RowResult',
    'PostSubmitRowResult'
]
