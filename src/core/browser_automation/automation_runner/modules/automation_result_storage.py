#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================
Automation Result Storage
============================================
Stores automation session results including row data, 
timing information, and post-submit captured URLs.

Saves to APPDATA/AutoForms/results/ in JSON format.
"""

import json
import os
import uuid
import time
from datetime import datetime
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Any
from pathlib import Path


def _get_results_dir() -> Path:
    """Get the results directory in APPDATA (Windows) or home (Linux/Mac)."""
    if os.name == 'nt':
        # Windows: %APPDATA%/AutoForms/results
        appdata = os.environ.get('APPDATA', os.path.expanduser('~'))
        base_dir = Path(appdata) / 'AutoForms' / 'results'
    else:
        # Linux/Mac: ~/.autoforms/results
        base_dir = Path.home() / '.autoforms' / 'results'
    
    base_dir.mkdir(parents=True, exist_ok=True)
    return base_dir


@dataclass
class PostSubmitResult:
    """Result of a post-submit URL capture operation."""
    enabled: bool = False
    save_and_edit: Dict[str, Any] = field(default_factory=lambda: {
        'attempted': False,
        'state': 'pending',  # pending, success, failed, timeout
        'capturedUrl': None,
        'captureTimeMs': 0,
        'strategy': None,
        'confidence': 0.0,
        'error': None
    })
    
    def mark_success(self, url: str, strategy: str, confidence: float, capture_time_ms: int):
        """Mark post-submit as successful with captured URL."""
        self.save_and_edit['attempted'] = True
        self.save_and_edit['state'] = 'success'
        self.save_and_edit['capturedUrl'] = url
        self.save_and_edit['strategy'] = strategy
        self.save_and_edit['confidence'] = confidence
        self.save_and_edit['captureTimeMs'] = capture_time_ms
        self.save_and_edit['error'] = None
    
    def mark_failed(self, error: str, capture_time_ms: int = 0):
        """Mark post-submit as failed with error message."""
        self.save_and_edit['attempted'] = True
        self.save_and_edit['state'] = 'failed'
        self.save_and_edit['capturedUrl'] = None
        self.save_and_edit['captureTimeMs'] = capture_time_ms
        self.save_and_edit['error'] = error
    
    def mark_timeout(self, timeout_ms: int):
        """Mark post-submit as timed out."""
        self.save_and_edit['attempted'] = True
        self.save_and_edit['state'] = 'timeout'
        self.save_and_edit['capturedUrl'] = None
        self.save_and_edit['captureTimeMs'] = timeout_ms
        self.save_and_edit['error'] = f'Timeout after {timeout_ms}ms'
    
    def to_dict(self) -> dict:
        return {
            'enabled': self.enabled,
            'saveAndEdit': self.save_and_edit
        }


@dataclass
class RowResult:
    """Result for a single row of automation."""
    row_index: int
    excel_row: int  # Usually row_index + 2 (1-indexed + header)
    control_questions: Dict[str, str] = field(default_factory=dict)
    time: Dict[str, Any] = field(default_factory=lambda: {
        'startedAt': None,
        'endedAt': None,
        'totalSeconds': 0.0
    })
    result: str = 'pending'  # pending, success, error, skipped
    error_message: Optional[str] = None
    post_submit: PostSubmitResult = field(default_factory=PostSubmitResult)
    
    def start(self):
        """Mark row as started."""
        self.time['startedAt'] = datetime.now().isoformat()
        self.result = 'running'
    
    def complete_success(self):
        """Mark row as completed successfully."""
        self.time['endedAt'] = datetime.now().isoformat()
        if self.time['startedAt']:
            start = datetime.fromisoformat(self.time['startedAt'])
            end = datetime.fromisoformat(self.time['endedAt'])
            self.time['totalSeconds'] = (end - start).total_seconds()
        self.result = 'success'
    
    def complete_error(self, error_message: str):
        """Mark row as completed with error."""
        self.time['endedAt'] = datetime.now().isoformat()
        if self.time['startedAt']:
            start = datetime.fromisoformat(self.time['startedAt'])
            end = datetime.fromisoformat(self.time['endedAt'])
            self.time['totalSeconds'] = (end - start).total_seconds()
        self.result = 'error'
        self.error_message = error_message
    
    def to_dict(self) -> dict:
        return {
            'rowIndex': self.row_index,
            'excelRow': self.excel_row,
            'controlQuestions': self.control_questions,
            'time': self.time,
            'result': self.result,
            'errorMessage': self.error_message,
            'postSubmit': self.post_submit.to_dict()
        }


@dataclass
class AutomationMeta:
    """Metadata for an automation session."""
    session_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    package_name: str = ''
    package_path: str = ''
    form_url: str = ''
    login_url: str = 'https://login.microsoftonline.com/'
    browser: str = ''
    profile_name: str = ''
    login_enabled: bool = True
    login_successful: Optional[bool] = None
    time: Dict[str, Any] = field(default_factory=lambda: {
        'startedAt': None,
        'endedAt': None,
        'totalSeconds': 0.0
    })
    total_rows: int = 0
    total_questions: int = 0
    
    def start(self):
        """Mark session as started."""
        self.time['startedAt'] = datetime.now().isoformat()
    
    def end(self):
        """Mark session as ended."""
        self.time['endedAt'] = datetime.now().isoformat()
        if self.time['startedAt']:
            start = datetime.fromisoformat(self.time['startedAt'])
            end = datetime.fromisoformat(self.time['endedAt'])
            self.time['totalSeconds'] = (end - start).total_seconds()
    
    def to_dict(self) -> dict:
        return {
            'sessionId': self.session_id,
            'packageName': self.package_name,
            'packagePath': self.package_path,
            'formUrl': self.form_url,
            'loginUrl': self.login_url,
            'browser': self.browser,
            'profileName': self.profile_name,
            'loginEnabled': self.login_enabled,
            'loginSuccessful': self.login_successful,
            'time': self.time,
            'totalRows': self.total_rows,
            'totalQuestions': self.total_questions
        }


class AutomationResultStorage:
    """
    Main storage class for automation session results.
    
    Provides incremental saving to disk and full serialization.
    """
    
    def __init__(self, package_name: str = '', package_path: str = ''):
        self.meta = AutomationMeta(
            package_name=package_name,
            package_path=package_path
        )
        self.rows: List[RowResult] = []
        self._results_dir = _get_results_dir()
        self._file_path: Optional[Path] = None
        self._auto_save = True
    
    @property
    def session_id(self) -> str:
        return self.meta.session_id
    
    def set_auto_save(self, enabled: bool):
        """Enable/disable auto-save after each row completion."""
        self._auto_save = enabled
    
    def initialize_session(
        self,
        form_url: str,
        browser: str,
        profile_name: str,
        total_rows: int,
        total_questions: int,
        login_enabled: bool = True
    ):
        """Initialize session metadata and create result file."""
        self.meta.form_url = form_url
        self.meta.browser = browser
        self.meta.profile_name = profile_name
        self.meta.total_rows = total_rows
        self.meta.total_questions = total_questions
        self.meta.login_enabled = login_enabled
        self.meta.start()
        
        # Initialize row placeholders
        self.rows = [
            RowResult(row_index=i, excel_row=i + 2)
            for i in range(total_rows)
        ]
        
        # Generate filename: packageName_sessionId_timestamp.json
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        safe_name = self.meta.package_name.replace('.afpkg', '').replace(' ', '_')
        filename = f"{safe_name}_{timestamp}_{self.session_id[:8]}.json"
        self._file_path = self._results_dir / filename
        
        # Save initial state
        self._save_to_file()
        
        return self._file_path
    
    def set_login_status(self, successful: bool):
        """Update login verification status."""
        self.meta.login_successful = successful
        if self._auto_save:
            self._save_to_file()
    
    def start_row(self, row_index: int, control_questions: Dict[str, str] = None):
        """Mark a row as started."""
        if 0 <= row_index < len(self.rows):
            self.rows[row_index].start()
            if control_questions:
                self.rows[row_index].control_questions = control_questions
    
    def complete_row(self, row_index: int, success: bool, error_message: str = None):
        """Mark a row as completed."""
        if 0 <= row_index < len(self.rows):
            if success:
                self.rows[row_index].complete_success()
            else:
                self.rows[row_index].complete_error(error_message or 'Unknown error')
            
            if self._auto_save:
                self._save_to_file()
    
    def enable_post_submit(self, row_index: int):
        """Enable post-submit for a specific row."""
        if 0 <= row_index < len(self.rows):
            self.rows[row_index].post_submit.enabled = True
    
    def record_post_submit_success(
        self,
        row_index: int,
        url: str,
        strategy: str,
        confidence: float,
        capture_time_ms: int
    ):
        """Record successful URL capture for a row."""
        if 0 <= row_index < len(self.rows):
            self.rows[row_index].post_submit.mark_success(
                url=url,
                strategy=strategy,
                confidence=confidence,
                capture_time_ms=capture_time_ms
            )
            if self._auto_save:
                self._save_to_file()
    
    def record_post_submit_failure(
        self,
        row_index: int,
        error: str,
        capture_time_ms: int = 0
    ):
        """Record failed URL capture for a row."""
        if 0 <= row_index < len(self.rows):
            self.rows[row_index].post_submit.mark_failed(
                error=error,
                capture_time_ms=capture_time_ms
            )
            if self._auto_save:
                self._save_to_file()
    
    def record_post_submit_timeout(self, row_index: int, timeout_ms: int):
        """Record timeout during URL capture for a row."""
        if 0 <= row_index < len(self.rows):
            self.rows[row_index].post_submit.mark_timeout(timeout_ms)
            if self._auto_save:
                self._save_to_file()
    
    def finalize_session(self):
        """Finalize the session and save final results."""
        self.meta.end()
        self._save_to_file()
        return self._file_path
    
    def to_dict(self) -> dict:
        """Serialize entire result to dictionary."""
        return {
            'meta': self.meta.to_dict(),
            'rows': [row.to_dict() for row in self.rows]
        }
    
    def to_json(self, indent: int = 2) -> str:
        """Serialize to JSON string."""
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)
    
    def _save_to_file(self):
        """Save current state to file."""
        if self._file_path:
            try:
                with open(self._file_path, 'w', encoding='utf-8') as f:
                    f.write(self.to_json())
            except Exception as e:
                print(f"[AutomationResultStorage] Error saving to file: {e}")
    
    def get_summary(self) -> dict:
        """Get a summary of the current session."""
        success_count = sum(1 for r in self.rows if r.result == 'success')
        error_count = sum(1 for r in self.rows if r.result == 'error')
        pending_count = sum(1 for r in self.rows if r.result in ('pending', 'running'))
        urls_captured = sum(
            1 for r in self.rows 
            if r.post_submit.save_and_edit.get('state') == 'success'
        )
        
        return {
            'sessionId': self.session_id,
            'totalRows': len(self.rows),
            'successCount': success_count,
            'errorCount': error_count,
            'pendingCount': pending_count,
            'urlsCaptured': urls_captured,
            'filePath': str(self._file_path) if self._file_path else None
        }
    
    @classmethod
    def load_from_file(cls, file_path: str) -> 'AutomationResultStorage':
        """Load a previous session from file."""
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        storage = cls()
        
        # Restore meta
        meta_data = data.get('meta', {})
        storage.meta = AutomationMeta(
            session_id=meta_data.get('sessionId', str(uuid.uuid4())),
            package_name=meta_data.get('packageName', ''),
            package_path=meta_data.get('packagePath', ''),
            form_url=meta_data.get('formUrl', ''),
            login_url=meta_data.get('loginUrl', ''),
            browser=meta_data.get('browser', ''),
            profile_name=meta_data.get('profileName', ''),
            login_enabled=meta_data.get('loginEnabled', True),
            login_successful=meta_data.get('loginSuccessful'),
            time=meta_data.get('time', {}),
            total_rows=meta_data.get('totalRows', 0),
            total_questions=meta_data.get('totalQuestions', 0)
        )
        
        # Restore rows
        storage.rows = []
        for row_data in data.get('rows', []):
            row = RowResult(
                row_index=row_data.get('rowIndex', 0),
                excel_row=row_data.get('excelRow', 0),
                control_questions=row_data.get('controlQuestions', {}),
                time=row_data.get('time', {}),
                result=row_data.get('result', 'pending'),
                error_message=row_data.get('errorMessage')
            )
            
            # Restore post-submit
            ps_data = row_data.get('postSubmit', {})
            row.post_submit = PostSubmitResult(
                enabled=ps_data.get('enabled', False),
                save_and_edit=ps_data.get('saveAndEdit', {})
            )
            
            storage.rows.append(row)
        
        storage._file_path = Path(file_path)
        return storage
