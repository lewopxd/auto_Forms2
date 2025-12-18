"""
Form Data Storage
Stores analyzed form data in JSON format for automation.
"""
import os
import json
from datetime import datetime

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "form_data")


def ensure_data_dir():
    """Create data directory if it doesn't exist."""
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)


def get_form_filename(url: str) -> str:
    """Generate filename from URL."""
    # Extract form ID from URL
    import re
    match = re.search(r'id=([A-Za-z0-9_-]+)', url)
    if match:
        form_id = match.group(1)[:50]  # Limit length
    else:
        form_id = "form_" + datetime.now().strftime("%Y%m%d_%H%M%S")
    
    return os.path.join(DATA_DIR, f"{form_id}.json")


def load_form_data(url: str) -> dict:
    """Load existing form data or create new structure."""
    filepath = get_form_filename(url)
    
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            pass
    
    return {
        "url": url,
        "created": datetime.now().isoformat(),
        "updated": datetime.now().isoformat(),
        "pages": {}
    }


def save_page_data(url: str, page_num: int, page_data: dict):
    """Save or update a page's data."""
    ensure_data_dir()
    
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
    
    filepath = get_form_filename(url)
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(form_data, f, indent=2, ensure_ascii=False)
    
    return filepath


def get_all_forms() -> list:
    """
    List all saved forms with metadata.
    
    Returns:
        List of dicts with form info: id, url, page_count, created, updated
    """
    ensure_data_dir()
    forms = []
    
    for filename in os.listdir(DATA_DIR):
        if not filename.endswith('.json'):
            continue
        
        filepath = os.path.join(DATA_DIR, filename)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            forms.append({
                "id": filename.replace('.json', ''),
                "filename": filename,
                "url": data.get("url", ""),
                "page_count": len(data.get("pages", {})),
                "created": data.get("created", ""),
                "updated": data.get("updated", ""),
            })
        except Exception:
            # Skip invalid files
            continue
    
    # Sort by updated date (newest first)
    forms.sort(key=lambda x: x.get("updated", ""), reverse=True)
    return forms
