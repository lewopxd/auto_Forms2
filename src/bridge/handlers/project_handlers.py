"""
Project Handlers - Autosave System
Manages project persistence with autosave.afp file
"""
import os
import json
import threading
from datetime import datetime
from pathlib import Path
from core.logger import Logger


class ProjectHandler:
    """Handles project autosave and restore"""
    
    def __init__(self, bridge):
        self.bridge = bridge
        self.app_data_dir = self._get_app_data_dir()
        self.autosave_path = self.app_data_dir / "autosave.afp"
        self.current_project_path = None  # Track manually saved project path
        
        # Register handlers
        bridge.register_handler("autosave", self.handle_autosave)
        bridge.register_handler("check_autosave", self.handle_check_autosave)
        bridge.register_handler("load_autosave", self.handle_load_autosave)
        bridge.register_handler("clear_autosave", self.handle_clear_autosave)
        bridge.register_handler("save_project_as", self.handle_save_project_as)
        bridge.register_handler("save_project", self.handle_save_project)
        bridge.register_handler("open_project", self.handle_open_project)
        
        Logger.debug(f"[Project] Autosave path: {self.autosave_path}")
    
    def _get_app_data_dir(self) -> Path:
        """Get or create app data directory"""
        if os.name == 'nt':  # Windows
            app_data = Path(os.environ.get('APPDATA', ''))
        else:  # Linux/Mac
            app_data = Path.home() / '.config'
        
        app_dir = app_data / 'AutoForms'
        app_dir.mkdir(parents=True, exist_ok=True)
        return app_dir
    
    def handle_autosave(self, content: dict) -> dict:
        """
        Save project data to autosave file
        Called by JS on every change (debounced)
        
        Content format (from sheetPlayground):
        {
            "name": str,
            "excel": { path, filename, sheets, activeSheet, headers, rows, rowCount },
            "forms": [],
            "tabs": [],
            "ui": { splitterPosition, activeTab, showCheckColumn },
            "checkColumnData": {}
        }
        """
        try:
            # Add metadata
            project_data = content.get('data', content)
            project_data['_autosave'] = {
                'timestamp': datetime.now().isoformat(),
                'version': '1.0'
            }
            
            # Write to file
            with open(self.autosave_path, 'w', encoding='utf-8') as f:
                json.dump(project_data, f, ensure_ascii=False, indent=2)
            
            Logger.debug(f"[Project] Autosaved: {len(json.dumps(project_data))} bytes")
            return {'success': True, 'timestamp': project_data['_autosave']['timestamp']}
            
        except Exception as e:
            Logger.error(f"[Project] Autosave failed: {e}")
            return {'success': False, 'error': str(e)}
    
    def handle_check_autosave(self, content: dict) -> dict:
        """Check if autosave file exists and return metadata"""
        try:
            if self.autosave_path.exists():
                with open(self.autosave_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                metadata = data.get('_autosave', {})
                return {
                    'exists': True,
                    'name': data.get('name', 'Sin nombre'),
                    'timestamp': metadata.get('timestamp', ''),
                    'hasExcel': data.get('excel') is not None,
                    'tabCount': len(data.get('tabs', []))
                }
            else:
                return {'exists': False}
                
        except Exception as e:
            Logger.error(f"[Project] Check autosave failed: {e}")
            return {'exists': False, 'error': str(e)}
    
    def handle_load_autosave(self, content: dict) -> dict:
        """Load autosave file and return full project data"""
        try:
            if not self.autosave_path.exists():
                return {'success': False, 'error': 'No autosave found'}
            
            with open(self.autosave_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            Logger.info(f"[Project] Loaded autosave: {data.get('name', 'Unknown')}")
            return {'success': True, 'data': data}
            
        except Exception as e:
            Logger.error(f"[Project] Load autosave failed: {e}")
            return {'success': False, 'error': str(e)}
    
    def handle_clear_autosave(self, content: dict) -> dict:
        """Clear/delete autosave file"""
        try:
            if self.autosave_path.exists():
                self.autosave_path.unlink()
                Logger.info("[Project] Autosave cleared")
            return {'success': True}
        except Exception as e:
            Logger.error(f"[Project] Clear autosave failed: {e}")
            return {'success': False, 'error': str(e)}
    
    def handle_save_project(self, content: dict) -> dict:
        """
        Save project directly to a path (Smart Save).
        """
        try:
            path = content.get('path')
            project_data = content.get('data', {})
            
            if not path:
                return {'success': False, 'error': 'No se proporcionó una ruta de guardado'}
            
            # Add metadata
            project_data['_save'] = {
                'timestamp': datetime.now().isoformat(),
                'version': '1.0',
                'path': path
            }
            
            # Write to file
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(project_data, f, ensure_ascii=False, indent=2)
            
            self.current_project_path = path
            Logger.info(f"[Project] Saved project to: {path}")
            
            return {
                'success': True, 
                'path': path,
                'filename': Path(path).name
            }
            
        except Exception as e:
            Logger.error(f"[Project] Save project failed: {e}")
            return {'success': False, 'error': str(e)}

    def handle_save_project_as(self, content: dict) -> dict:
        """
        Save project to a user-selected file location.
        Uses tkinter file dialog.
        """
        try:
            import tkinter as tk
            from tkinter import filedialog
            
            # Create hidden root window for dialog
            root = tk.Tk()
            root.withdraw()
            root.attributes('-topmost', True)  # Ensure dialog appears on top
            
            # Get suggested filename from project name
            project_data = content.get('data', {})
            suggested_name = project_data.get('name', 'proyecto') + '.afp'
            
            # Show save dialog
            file_path = filedialog.asksaveasfilename(
                title="Guardar Proyecto",
                defaultextension=".afp",
                filetypes=[("AutoForms Project", "*.afp"), ("Todos los archivos", "*.*")],
                initialfile=suggested_name
            )
            
            root.destroy()
            
            if not file_path:
                # User cancelled
                return {'success': False, 'cancelled': True}
            
            # Add metadata
            project_data['_save'] = {
                'timestamp': datetime.now().isoformat(),
                'version': '1.0',
                'path': file_path
            }
            
            # Write to file
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(project_data, f, ensure_ascii=False, indent=2)
            
            self.current_project_path = file_path
            Logger.info(f"[Project] Saved project to: {file_path}")
            
            return {
                'success': True, 
                'path': file_path,
                'filename': Path(file_path).name
            }
            
        except Exception as e:
            Logger.error(f"[Project] Save project failed: {e}")
            return {'success': False, 'error': str(e)}
    
    def handle_open_project(self, content: dict) -> dict:
        """
        Open a project file from user-selected location.
        Uses tkinter file dialog.
        """
        try:
            import tkinter as tk
            from tkinter import filedialog
            
            # Create hidden root window for dialog
            root = tk.Tk()
            root.withdraw()
            root.attributes('-topmost', True)  # Ensure dialog appears on top
            
            # Show open dialog
            file_path = filedialog.askopenfilename(
                title="Abrir Proyecto",
                filetypes=[("AutoForms Project", "*.afp"), ("Todos los archivos", "*.*")]
            )
            
            root.destroy()
            
            if not file_path:
                # User cancelled
                return {'success': False, 'cancelled': True}
            
            # Read file
            with open(file_path, 'r', encoding='utf-8') as f:
                project_data = json.load(f)
            
            self.current_project_path = file_path
            Logger.info(f"[Project] Opened project: {file_path}")
            
            return {
                'success': True,
                'data': project_data,
                'path': file_path,
                'filename': Path(file_path).name
            }
            
        except json.JSONDecodeError as e:
            Logger.error(f"[Project] Invalid project file: {e}")
            return {'success': False, 'error': 'El archivo no es un proyecto válido'}
        except Exception as e:
            Logger.error(f"[Project] Open project failed: {e}")
            return {'success': False, 'error': str(e)}
