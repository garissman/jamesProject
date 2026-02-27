"""
Thin launcher for Arduino Lab App framework.
The App framework calls this file; we just start our FastAPI server.
"""
import subprocess
import sys
import os

os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.exit(subprocess.call([sys.executable, "server.py"]))
