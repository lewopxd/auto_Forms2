"""
Form Data Storage
Stores analyzed form data in JSON format for automation.
Uses .raf (Recording Auto Forms) extension.
"""
import os
import json
import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Union

# Data directory (relative to project root)
def get_data_dir() -> Path:
    """Get data directory, creating if necessary."""
    # Store in project's form_data folder
    project_root = Path(__file__).parent.parent.parent.parent
    data_dir = project_root / "form_data"
    if not data_dir.exists():
        data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def get_form_filename(url: str = None, name: str = None) -> Path:
    """Generate filename from URL or provided name."""
    if name:
        # Sanitize name
        safe_name = re.sub(r'[^\w\-_\. ]', '', name)
        return get_data_dir() / f"{safe_name}.raf"
        
    if url:
        match = re.search(r'id=([A-Za-z0-9_-]+)', url)
        if match:
            form_id = match.group(1)[:50]
        else:
            form_id = "form_" + datetime.now().strftime("%Y%m%d_%H%M%S")
        return get_data_dir() / f"{form_id}.raf"
    
    # Fallback
    return get_data_dir() / f"recording_{datetime.now().strftime('%Y%m%d_%H%M%S')}.raf"


def load_form_data(url: str) -> dict:
    """Load existing form data or create new structure."""
    filepath = get_form_filename(url)
    
    # Try .raf first, then fallback to .json for compatibility
    if not filepath.exists():
        json_path = filepath.with_suffix('.json')
        if json_path.exists():
            filepath = json_path

    if filepath.exists():
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    
    return {
        "url": url,
        "created": datetime.now().isoformat(),
        "updated": datetime.now().isoformat(),
        "pages": {}
    }


def load_form_data_from_path(filepath: str) -> dict:
    """Load form data from a specific file path."""
    path = Path(filepath)
    if path.exists():
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            return {"error": str(e)}
    return {"error": "File not found"}


def save_page_data(url: str, page_num: int, page_data: dict) -> str:
    """Save or update a page's data."""
    form_data = load_form_data(url)
    form_data["url"] = url
    form_data["updated"] = datetime.now().isoformat()
    
    page_key = f"page_{page_num}"
    form_data["pages"][page_key] = {
        "pageInfo": page_data.get("pageInfo", {}),
        "questions": {},
        "navigation": page_data.get("navigation", {}),
        "savedAt": datetime.now().isoformat()
    }
    
    # Store each question
    for q in page_data.get("questions", []):
        q_key = f"q{q.get('num', 0)}"
        form_data["pages"][page_key]["questions"][q_key] = {
            "text": q.get("text", ""),
            "type": q.get("type", "unknown"),
            "required": q.get("required", False),
            "questionId": q.get("questionId"),
            "selenium": q.get("selenium"),
            "options": q.get("options", [])
        }
    
    # Save as .raf
    filepath = get_form_filename(url)
    if filepath.suffix == '.json':
        # Upgrade to .raf if it was json
        filepath = filepath.with_suffix('.raf')
        
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(form_data, f, indent=2, ensure_ascii=False)
    
    return str(filepath)


def get_all_forms() -> list:
    """List all saved forms (.raf and legacy .json)."""
    data_dir = get_data_dir()
    forms = []
    
    # helper for processing
    def process_file(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Use saved name or filename
            name = data.get("name") or filepath.stem
            
            forms.append({
                "id": filepath.stem,
                "name": name,
                "filename": filepath.name,
                "path": str(filepath.absolute()),
                "url": data.get("url", ""),
                "page_count": len(data.get("pages", {})),
                "created": data.get("created", ""),
                "updated": data.get("updated", ""),
            })
        except Exception:
            pass

    # Scan .raf files
    for filepath in data_dir.glob("*.raf"):
        process_file(filepath)
        
    # Scan .json files (legacy support)
    for filepath in data_dir.glob("*.json"):
        # Avoid duplicates if .raf exists
        if filepath.with_suffix('.raf').exists():
            continue
        process_file(filepath)
    
    # Sort by updated date (newest first)
    forms.sort(key=lambda x: x.get("updated", ""), reverse=True)
    return forms


def delete_record(filepath: str) -> bool:
    """Delete a recording file."""
    try:
        path = Path(filepath)
        if path.exists():
            path.unlink()
            return True
        return False
    except Exception:
        return False


def rename_record(filepath: str, new_name: str) -> Dict[str, Union[bool, str]]:
    """Rename a recording file."""
    try:
        path = Path(filepath)
        if not path.exists():
            return {"success": False, "error": "File not found"}
        
        # Keep extension
        new_filename = new_name
        if not new_filename.endswith('.raf'):
            new_filename += '.raf'
            
        new_path = path.parent / new_filename
        
        # Check if exists
        if new_path.exists() and new_path != path:
            return {"success": False, "error": "Name already exists"}
            
        path.rename(new_path)
        
        # Update internal name if JSON
        try:
            with open(new_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            data['name'] = new_name
            
            with open(new_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except:
            pass
            
        return {"success": True, "path": str(new_path)}
    except Exception as e:
        return {"success": False, "error": str(e)}


def import_record(src_path: str) -> Dict[str, Union[bool, str]]:
    """Import an external recording file."""
    try:
        src = Path(src_path)
        if not src.exists():
            return {"success": False, "error": "Source file not found"}
            
        # Verify it's a valid JSON/RAF
        try:
            with open(src, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if 'pages' not in data:
                    return {"success": False, "error": "Invalid file format"}
        except:
            return {"success": False, "error": "Invalid JSON content"}
            
        # Dest path
        dest_dir = get_data_dir()
        dest_filename = src.name
        if not dest_filename.endswith('.raf'):
            dest_filename = src.stem + '.raf'
            
        dest = dest_dir / dest_filename
        
        # Avoid overwrite
        counter = 1
        while dest.exists():
            dest = dest_dir / f"{src.stem}_{counter}.raf"
            counter += 1
            
        shutil.copy2(src, dest)
        return {"success": True, "path": str(dest)}
        
    except Exception as e:
        return {"success": False, "error": str(e)}


def save_recording(filename: str, data: dict) -> str:
    """
    Save a complete recording to file.
    
    Args:
        filename: Name for the recording (without extension)
        data: Recording data to save
        
    Returns:
        Path to the saved file
    """
    # Ensure filename is clean
    safe_name = re.sub(r'[^\w\-_\. ]', '', filename)
    if not safe_name:
        safe_name = f"recording_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    # Add extension if needed
    if not safe_name.endswith('.raf'):
        safe_name += '.raf'
    
    filepath = get_data_dir() / safe_name
    
    # Avoid overwrite
    counter = 1
    base_name = filepath.stem
    while filepath.exists():
        filepath = get_data_dir() / f"{base_name}_{counter}.raf"
        counter += 1
    
    # Add metadata
    data["name"] = filepath.stem
    data["created"] = datetime.now().isoformat()
    data["updated"] = datetime.now().isoformat()
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    return str(filepath)
