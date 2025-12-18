"""
Project Management Routes
REST API for project CRUD operations
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pathlib import Path
from typing import Optional, List, Dict, Any
import json
import uuid
from datetime import datetime

router = APIRouter(prefix="/api/projects", tags=["projects"])

# Directories
PROJECT_ROOT = Path(__file__).parent.parent.parent
PROJECTS_DIR = PROJECT_ROOT / "projects"
PROJECTS_DIR.mkdir(exist_ok=True)

# App state file (tracks last opened project, etc.)
APP_STATE_FILE = PROJECT_ROOT / ".app_state.json"


# ========== Models ==========

class ProjectCreate(BaseModel):
    name: str


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    excel: Optional[Dict[str, Any]] = None
    forms: Optional[List[Dict]] = None
    tabs: Optional[List[Dict]] = None
    ui: Optional[Dict[str, Any]] = None


# ========== App State ==========

def load_app_state() -> dict:
    """Load persistent app state."""
    if APP_STATE_FILE.exists():
        try:
            return json.loads(APP_STATE_FILE.read_text(encoding="utf-8"))
        except:
            pass
    return {"lastProjectId": None, "recentProjects": []}


def save_app_state(state: dict):
    """Save persistent app state."""
    APP_STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")


def set_last_project(project_id: str, project_name: str):
    """Update last opened project."""
    state = load_app_state()
    state["lastProjectId"] = project_id
    
    # Update recent projects list
    recent = state.get("recentProjects", [])
    # Remove if exists
    recent = [p for p in recent if p.get("id") != project_id]
    # Add to front
    recent.insert(0, {"id": project_id, "name": project_name, "openedAt": datetime.utcnow().isoformat() + "Z"})
    # Keep only last 10
    state["recentProjects"] = recent[:10]
    
    save_app_state(state)


# ========== Dialog Helpers ==========

def _show_save_dialog(initial_dir: str, filename: str) -> str:
    """Run save dialog in main thread (blocking)."""
    import tkinter as tk
    from tkinter import filedialog
    
    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    root.lift()
    root.focus_force()
    
    filepath = filedialog.asksaveasfilename(
        title="Guardar Proyecto",
        initialdir=initial_dir,
        initialfile=filename,
        defaultextension=".msfproj",
        filetypes=[("MS Forms Project", "*.msfproj"), ("All files", "*.*")]
    )
    
    root.destroy()
    return filepath


def _show_open_dialog(initial_dir: str) -> str:
    """Run open dialog in main thread (blocking)."""
    import tkinter as tk
    from tkinter import filedialog
    
    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    root.lift()
    root.focus_force()
    
    filepath = filedialog.askopenfilename(
        title="Abrir Proyecto",
        initialdir=initial_dir,
        filetypes=[("MS Forms Project", "*.msfproj"), ("All files", "*.*")]
    )
    
    root.destroy()
    return filepath


# ========== Routes ==========

@router.get("/state")
async def get_app_state():
    """Get app state including last project ID."""
    return load_app_state()


@router.get("/recent")
async def get_recent_projects():
    """Get list of recently opened projects."""
    state = load_app_state()
    recent = state.get("recentProjects", [])
    
    # Filter to only existing files
    valid = []
    for p in recent:
        if p.get("path") and Path(p["path"]).exists():
            valid.append(p)
    
    return {"recent": valid}


@router.get("/open")
async def open_project_dialog():
    """
    Open project via native file dialog.
    """
    import asyncio
    import concurrent.futures
    
    try:
        # Get last directory from state
        state = load_app_state()
        initial_dir = state.get("lastProjectDir", str(PROJECTS_DIR))
        
        # Run dialog in thread to not block asyncio
        loop = asyncio.get_event_loop()
        with concurrent.futures.ThreadPoolExecutor() as executor:
            filepath = await loop.run_in_executor(
                executor, 
                _show_open_dialog, 
                initial_dir
            )
        
        if not filepath:
            return {"cancelled": True}
        
        # Load and return project data
        path = Path(filepath)
        if not path.exists():
            raise HTTPException(404, "File not found")
        
        data = json.loads(path.read_text(encoding="utf-8"))
        
        # Ensure path is stored
        data["path"] = str(path)
        
        # Update app state
        state["currentProjectPath"] = str(path)
        state["lastProjectDir"] = str(path.parent)
        state["lastProjectId"] = data.get("id")
        
        # Update recent
        recent = state.get("recentProjects", [])
        recent = [p for p in recent if p.get("path") != str(path)]
        recent.insert(0, {
            "id": data.get("id"),
            "name": data.get("name"),
            "path": str(path),
            "openedAt": datetime.utcnow().isoformat() + "Z"
        })
        state["recentProjects"] = recent[:10]
        
        save_app_state(state)
        
        return data
        
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid project file")
    except Exception as e:
        raise HTTPException(500, f"Open dialog error: {str(e)}")


@router.get("")
async def list_projects():
    """List all projects."""
    projects = []
    for f in PROJECTS_DIR.glob("*.msfproj"):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            projects.append({
                "id": data.get("id"),
                "name": data.get("name"),
                "created": data.get("created"),
                "updated": data.get("updated"),
                "excelPath": data.get("excel", {}).get("path") if data.get("excel") else None,
                "tabCount": len(data.get("tabs", []))
            })
        except Exception as e:
            continue
    
    # Sort by updated date (newest first)
    projects.sort(key=lambda x: x.get("updated", ""), reverse=True)
    return {"projects": projects, "count": len(projects)}


# NOTE: Dynamic route must come AFTER static routes like /recent, /state, /open
@router.get("/{project_id}")
async def get_project(project_id: str):
    """Get project by ID."""
    for f in PROJECTS_DIR.glob("*.msfproj"):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if data.get("id") == project_id:
                # Update last opened
                set_last_project(project_id, data.get("name", ""))
                return data
        except:
            continue
    raise HTTPException(404, "Project not found")


@router.post("")
async def create_project(body: ProjectCreate):
    """Create new project."""
    project_id = f"proj_{uuid.uuid4().hex[:12]}"
    now = datetime.utcnow().isoformat() + "Z"
    
    project = {
        "version": "1.0",
        "id": project_id,
        "name": body.name,
        "created": now,
        "updated": now,
        "excel": None,
        "forms": [],
        "tabs": [],
        "ui": {
            "splitterPosition": 50,
            "activeTab": None,
            "showCheckColumn": False
        }
    }
    
    # Generate safe filename
    safe_name = "".join(c if c.isalnum() or c in "._- " else "_" for c in body.name)
    filename = f"{safe_name}_{project_id[-6:]}.msfproj"
    filepath = PROJECTS_DIR / filename
    filepath.write_text(json.dumps(project, indent=2, ensure_ascii=False), encoding="utf-8")
    
    # Set as last opened
    set_last_project(project_id, body.name)
    
    return project


@router.put("/{project_id}")
async def update_project(project_id: str, body: ProjectUpdate):
    """Update existing project."""
    for f in PROJECTS_DIR.glob("*.msfproj"):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if data.get("id") == project_id:
                # Update fields if provided
                if body.name is not None:
                    data["name"] = body.name
                if body.excel is not None:
                    data["excel"] = body.excel
                if body.forms is not None:
                    data["forms"] = body.forms
                if body.tabs is not None:
                    data["tabs"] = body.tabs
                if body.ui is not None:
                    data["ui"] = body.ui
                
                data["updated"] = datetime.utcnow().isoformat() + "Z"
                
                f.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
                return {"status": "ok", "updated": data["updated"]}
        except:
            continue
    raise HTTPException(404, "Project not found")


@router.delete("/{project_id}")
async def delete_project(project_id: str):
    """Delete project."""
    for f in PROJECTS_DIR.glob("*.msfproj"):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if data.get("id") == project_id:
                f.unlink()
                return {"status": "ok", "deleted": project_id}
        except:
            continue
    raise HTTPException(404, "Project not found")


# ========== Native File Dialog Routes ==========

class ProjectSaveData(BaseModel):
    """Data to save in project file."""
    name: str
    excel: Optional[Dict[str, Any]] = None
    forms: Optional[List[Dict]] = None
    tabs: Optional[List[Dict]] = None
    ui: Optional[Dict[str, Any]] = None
    checkColumnData: Optional[Dict[str, Any]] = None


@router.post("/save")
async def save_project_to_path(body: ProjectSaveData):
    """
    Save project to current path (or prompt for new path if none).
    Uses native file dialog via tkinter.
    """
    state = load_app_state()
    current_path = state.get("currentProjectPath")
    
    if current_path and Path(current_path).exists():
        # Save to existing path
        return await _save_project_file(current_path, body)
    else:
        # No path set, use Save As
        return await save_project_as(body)


@router.post("/save-as")
async def save_project_as(body: ProjectSaveData):
    """
    Save project with file dialog to choose location.
    """
    import asyncio
    import concurrent.futures
    
    try:
        # Get last directory from state
        state = load_app_state()
        initial_dir = state.get("lastProjectDir", str(PROJECTS_DIR))
        
        # Run dialog in thread to not block asyncio
        loop = asyncio.get_event_loop()
        with concurrent.futures.ThreadPoolExecutor() as executor:
            filepath = await loop.run_in_executor(
                executor, 
                _show_save_dialog, 
                initial_dir, 
                f"{body.name}.msfproj"
            )
        
        if not filepath:
            return {"cancelled": True}
        
        return await _save_project_file(filepath, body)
        
    except Exception as e:
        raise HTTPException(500, f"Save dialog error: {str(e)}")


async def _save_project_file(filepath: str, body: ProjectSaveData) -> dict:
    """Internal: Save project data to file."""
    path = Path(filepath)
    now = datetime.utcnow().isoformat() + "Z"
    
    # Load existing or create new
    if path.exists():
        try:
            existing = json.loads(path.read_text(encoding="utf-8"))
            project_id = existing.get("id", f"proj_{uuid.uuid4().hex[:12]}")
            created = existing.get("created", now)
        except:
            project_id = f"proj_{uuid.uuid4().hex[:12]}"
            created = now
    else:
        project_id = f"proj_{uuid.uuid4().hex[:12]}"
        created = now
    
    # Use filename (without extension) as project name instead of generic default
    filename_without_ext = path.stem  # Gets filename without .msfproj extension
    project_name = filename_without_ext if filename_without_ext else body.name
    
    project = {
        "version": "1.0",
        "id": project_id,
        "name": project_name,  # Use filename as project name
        "path": str(path),
        "created": created,
        "updated": now,
        "excel": body.excel,
        "forms": body.forms or [],
        "tabs": body.tabs or [],
        "ui": body.ui or {"splitterPosition": 50, "activeTab": None, "showCheckColumn": False},
        "checkColumnData": body.checkColumnData or {}
    }
    
    path.write_text(json.dumps(project, indent=2, ensure_ascii=False), encoding="utf-8")
    
    # Update app state
    state = load_app_state()
    state["currentProjectPath"] = str(path)
    state["lastProjectDir"] = str(path.parent)
    state["lastProjectId"] = project_id
    
    # Update recent - use project_name (from filename)
    recent = state.get("recentProjects", [])
    recent = [p for p in recent if p.get("path") != str(path)]
    recent.insert(0, {"id": project_id, "name": project_name, "path": str(path), "openedAt": now})
    state["recentProjects"] = recent[:10]
    
    save_app_state(state)
    
    # Return name so frontend can update
    return {"status": "ok", "path": str(path), "id": project_id, "name": project_name, "updated": now}


class LoadPathRequest(BaseModel):
    path: str


@router.post("/load-path")
async def load_project_from_path(body: LoadPathRequest):
    """
    Load project from a specific file path.
    Used for loading recent projects or last opened project.
    """
    path = Path(body.path)
    
    if not path.exists():
        raise HTTPException(404, f"File not found: {body.path}")
    
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        
        # Ensure path is stored
        data["path"] = str(path)
        
        # Update app state
        state = load_app_state()
        state["currentProjectPath"] = str(path)
        state["lastProjectDir"] = str(path.parent)
        state["lastProjectId"] = data.get("id")
        
        # Update recent
        recent = state.get("recentProjects", [])
        recent = [p for p in recent if p.get("path") != str(path)]
        recent.insert(0, {
            "id": data.get("id"),
            "name": data.get("name"),
            "path": str(path),
            "openedAt": datetime.utcnow().isoformat() + "Z"
        })
        state["recentProjects"] = recent[:10]
        
        save_app_state(state)
        
        return data
        
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid project file format")
    except Exception as e:
        raise HTTPException(500, f"Error loading project: {str(e)}")
