"""
AI Package — Standalone AI/ML module for Interview Coach.

Contains all agents, LLM providers, transcription, TTS, and resume parsing.
The backend (backend/app/) imports from this package via shim modules.
"""
import os
import sys

# Ensure the backend directory is on sys.path so that `app.config` and
# `app.store` (which live in backend/app/) are importable from within this package.
_this_dir = os.path.dirname(os.path.abspath(__file__))
_backend_dir = os.path.join(os.path.dirname(_this_dir), "backend")
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)
