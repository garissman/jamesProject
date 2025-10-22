from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import Optional, List
from contextlib import asynccontextmanager
from pathlib import Path
import threading
from pipetting_controller import PipettingController, PipettingStep

# Global pipetting controller instance
pipetting_controller: Optional[PipettingController] = None
execution_lock = threading.Lock()
is_executing = False

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    global pipetting_controller
    # Startup
    try:
        pipetting_controller = PipettingController()
        print("Pipetting controller initialized successfully")
    except Exception as e:
        print(f"Warning: Could not initialize pipetting controller: {e}")
        print("Running in simulation mode")

    yield

    # Shutdown
    if pipetting_controller:
        pipetting_controller.cleanup()

app = FastAPI(lifespan=lifespan)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Frontend static files configuration
FRONTEND_DIST_DIR = Path(__file__).parent / "frontend" / "dist"
FRONTEND_DEV_DIR = Path(__file__).parent / "frontend"

# Pydantic models for pipetting operations
class PipettingStepRequest(BaseModel):
    """Single pipetting step from frontend"""
    pickupWell: str = Field(..., description="Source well (e.g., 'A12')")
    dropoffWell: str = Field(..., description="Destination well (e.g., 'A15')")
    rinseWell: Optional[str] = Field(None, description="Rinse well (optional)")
    sampleVolume: float = Field(..., gt=0, le=10, description="Volume in mL")
    waitTime: int = Field(0, ge=0, description="Wait time in seconds")
    cycles: int = Field(1, ge=1, le=100, description="Number of cycles")

class PipettingSequenceRequest(BaseModel):
    """Complete pipetting sequence"""
    steps: List[PipettingStepRequest] = Field(..., min_length=1, description="List of pipetting steps")

class PipettingResponse(BaseModel):
    """Response for pipetting operations"""
    status: str
    message: str
    steps_executed: int = 0

class Item(BaseModel):
    name: str
    description: str = None
    price: float

@app.get("/api/items")
async def get_items():
    return [
        {"id": 1, "name": "Item 1", "description": "First item", "price": 10.99},
        {"id": 2, "name": "Item 2", "description": "Second item", "price": 20.99},
    ]

@app.post("/api/items")
async def create_item(item: Item):
    return {"id": 3, **item.model_dump()}

# Pipetting API endpoints
def run_pipetting_sequence(pipetting_steps: List[PipettingStep]):
    """Background task to run pipetting sequence"""
    global is_executing
    try:
        is_executing = True
        pipetting_controller.execute_sequence(pipetting_steps)
    except Exception as e:
        print(f"Error during execution: {e}")
    finally:
        is_executing = False

@app.post("/api/pipetting/execute", response_model=PipettingResponse)
async def execute_pipetting_sequence(sequence: PipettingSequenceRequest):
    """
    Execute a complete pipetting sequence

    Example request:
    {
        "steps": [
            {
                "pickupWell": "A12",
                "dropoffWell": "A15",
                "rinseWell": "H12",
                "sampleVolume": 1.0,
                "waitTime": 2,
                "cycles": 1
            }
        ]
    }
    """
    global is_executing

    if pipetting_controller is None:
        raise HTTPException(
            status_code=503,
            detail="Pipetting controller not initialized"
        )

    if is_executing:
        raise HTTPException(
            status_code=409,
            detail="Another sequence is already executing"
        )

    try:
        # Convert frontend format to backend format
        pipetting_steps = []
        for step in sequence.steps:
            pipetting_steps.append(PipettingStep(
                pickup_well=step.pickupWell,
                dropoff_well=step.dropoffWell,
                rinse_well=step.rinseWell,
                volume_ml=step.sampleVolume,
                wait_time=step.waitTime,
                cycles=step.cycles
            ))

        # Run in background thread so status endpoint can respond
        thread = threading.Thread(target=run_pipetting_sequence, args=(pipetting_steps,))
        thread.daemon = True
        thread.start()

        return PipettingResponse(
            status="success",
            message=f"Started execution of {len(pipetting_steps)} step(s)",
            steps_executed=len(pipetting_steps)
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error executing pipetting sequence: {str(e)}"
        )

@app.post("/api/pipetting/stop")
async def stop_pipetting_execution():
    """Stop the current pipetting execution"""
    global is_executing

    if pipetting_controller is None:
        raise HTTPException(
            status_code=503,
            detail="Pipetting controller not initialized"
        )

    try:
        pipetting_controller.stop()
        # Note: is_executing will be set to False by the background thread when it finishes
        return {"status": "success", "message": "Stop requested - execution will halt after current operation"}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error stopping execution: {str(e)}"
        )

@app.post("/api/pipetting/home")
async def home_pipetting_system():
    """Return pipetting system to home position (well A1)"""
    if pipetting_controller is None:
        raise HTTPException(
            status_code=503,
            detail="Pipetting controller not initialized"
        )

    try:
        pipetting_controller.home()
        return {"status": "success", "message": "System moved to home position (well A1)"}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error homing system: {str(e)}"
        )

@app.get("/api/pipetting/status")
async def get_pipetting_status():
    """Get current status of pipetting system"""
    global is_executing

    if pipetting_controller is None:
        return {
            "initialized": False,
            "message": "Controller not initialized",
            "current_well": None,
            "is_executing": False
        }

    try:
        position = pipetting_controller.current_position
        current_well = pipetting_controller.get_current_well()
        return {
            "initialized": True,
            "position": {
                "x": position.x,
                "y": position.y,
                "z": position.z
            },
            "current_well": current_well,
            "is_executing": is_executing,
            "message": "Executing" if is_executing else "System ready"
        }
    except Exception as e:
        return {
            "initialized": False,
            "message": f"Error: {str(e)}",
            "current_well": None,
            "is_executing": False
        }

@app.get("/api/pipetting/logs")
async def get_pipetting_logs(last_n: int = 50):
    """
    Get recent log messages from pipetting controller

    Args:
        last_n: Number of recent log messages to retrieve (default: 50)
    """
    if pipetting_controller is None:
        return {
            "logs": [],
            "message": "Controller not initialized"
        }

    try:
        logs = pipetting_controller.get_logs(last_n)
        return {
            "logs": logs,
            "count": len(logs)
        }
    except Exception as e:
        return {
            "logs": [],
            "message": f"Error fetching logs: {str(e)}"
        }

# Mount static files for frontend (serve built React app or dev version)
if FRONTEND_DIST_DIR.exists():
    # Production mode: serve built files
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend_prod(full_path: str):
        """
        Serve the built React frontend for all non-API routes
        This enables client-side routing to work properly
        """
        file_path = FRONTEND_DIST_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)

        # For all other routes, serve index.html (client-side routing)
        index_path = FRONTEND_DIST_DIR / "index.html"
        if index_path.exists():
            return FileResponse(index_path)

        return {"error": "Frontend not built. Run 'cd frontend && npm run build'"}

elif FRONTEND_DEV_DIR.exists() and (FRONTEND_DEV_DIR / "index.html").exists():
    # Development mode: serve source files directly
    # Mount src directory for module imports
    if (FRONTEND_DEV_DIR / "src").exists():
        app.mount("/src", StaticFiles(directory=FRONTEND_DEV_DIR / "src"), name="src")

    # Mount public directory if it exists
    if (FRONTEND_DEV_DIR / "public").exists():
        app.mount("/public", StaticFiles(directory=FRONTEND_DEV_DIR / "public"), name="public")

    @app.get("/{full_path:path}")
    async def serve_frontend_dev(full_path: str):
        """
        Serve the development React frontend for all non-API routes
        Note: During development, it's recommended to use the Vite dev server (npm run dev)
        for hot reload and better performance. This fallback serves static files only.
        """
        # Try to serve the requested file
        file_path = FRONTEND_DEV_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)

        # For all other routes, serve index.html
        index_path = FRONTEND_DEV_DIR / "index.html"
        if index_path.exists():
            return FileResponse(index_path)

        return {
            "message": "Development mode",
            "note": "For hot reload, run 'cd frontend && npm run dev' and visit http://localhost:5173",
            "current": "Serving static files without hot reload"
        }

else:
    @app.get("/")
    async def root():
        return {
            "message": "Frontend not found",
            "instructions": [
                "For production: Run 'cd frontend && npm run build'",
                "For development: Run 'cd frontend && npm run dev' and visit http://localhost:5173"
            ]
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)