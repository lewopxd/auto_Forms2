"""
App State Persistence
Saves and loads application state.
"""
import os
import json

STATE_FILE = os.path.join(os.path.dirname(__file__), "..", "appstate.json")

DEFAULT_STATE = {
    "last_url": "",
    "last_browser": "",
}


def load_state() -> dict:
    """Load app state from file."""
    try:
        if os.path.exists(STATE_FILE):
            with open(STATE_FILE, 'r', encoding='utf-8') as f:
                return {**DEFAULT_STATE, **json.load(f)}
    except:
        pass
    return DEFAULT_STATE.copy()


def save_state(state: dict):
    """Save app state to file."""
    try:
        with open(STATE_FILE, 'w', encoding='utf-8') as f:
            json.dump(state, f, indent=2)
    except:
        pass


def get_last_url() -> str:
    return load_state().get("last_url", "")


def set_last_url(url: str):
    state = load_state()
    state["last_url"] = url
    save_state(state)
