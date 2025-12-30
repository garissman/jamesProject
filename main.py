import os
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional, List, Dict

from dotenv import load_dotenv, set_key
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# Load environment variables from .env file
load_dotenv()

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
    allow_origins=["*"],  # React dev server
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
    repetitionMode: str = Field('quantity', description="Repetition mode: 'quantity' or 'timeFrequency'")
    repetitionQuantity: int = Field(1, ge=1, description="Number of times to repeat (for quantity mode)")
    repetitionInterval: Optional[int] = Field(None, ge=0,
                                              description="Interval between repetitions in seconds (for timeFrequency mode)")
    repetitionDuration: Optional[int] = Field(None, ge=0,
                                              description="Total duration in seconds (for timeFrequency mode)")
    pipetteCount: int = Field(3, ge=1, le=3, description="Number of pipettes: 1 or 3 (default: 3)")


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
                cycles=step.cycles,
                repetition_mode=step.repetitionMode,
                repetition_quantity=step.repetitionQuantity,
                repetition_interval=step.repetitionInterval,
                repetition_duration=step.repetitionDuration,
                pipette_count=step.pipetteCount
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


class MoveToWellRequest(BaseModel):
    """Request to move to a specific well"""
    wellId: str = Field(..., description="Well ID to move to (e.g., 'A1', 'B5')")


class SetPipetteCountRequest(BaseModel):
    """Request to set pipette configuration"""
    pipetteCount: int = Field(..., ge=1, le=3, description="Number of pipettes: 1 or 3")


@app.post("/api/pipetting/move-to-well")
async def move_to_well(request: MoveToWellRequest):
    """Move pipetting system to a specific well"""
    if pipetting_controller is None:
        raise HTTPException(
            status_code=503,
            detail="Pipetting controller not initialized"
        )

    try:
        # Move to the specified well
        pipetting_controller.move_to_well(request.wellId, 0)
        return {"status": "success", "message": f"Moved to well {request.wellId}"}
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid well ID: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error moving to well: {str(e)}"
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
        pipette_count = pipetting_controller.current_pipette_count
        current_operation = pipetting_controller.current_operation
        operation_well = pipetting_controller.operation_well
        return {
            "initialized": True,
            "position": {
                "x": position.x,
                "y": position.y,
                "z": position.z
            },
            "current_well": current_well,
            "pipette_count": pipette_count,
            "is_executing": is_executing,
            "current_operation": current_operation,
            "operation_well": operation_well,
            "message": "Executing" if is_executing else "System ready"
        }
    except Exception as e:
        return {
            "initialized": False,
            "message": f"Error: {str(e)}",
            "current_well": None,
            "pipette_count": 3,
            "is_executing": False,
            "current_operation": "idle",
            "operation_well": None
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


@app.post("/api/pipetting/set-pipette-count")
async def set_pipette_count(request: SetPipetteCountRequest):
    """Set the pipette configuration (1 or 3 pipettes)"""
    if pipetting_controller is None:
        raise HTTPException(
            status_code=503,
            detail="Pipetting controller not initialized"
        )

    try:
        pipetting_controller.set_pipette_count(request.pipetteCount)
        return {
            "status": "success",
            "message": f"Pipette configuration set to {request.pipetteCount} pipette(s)",
            "pipette_count": request.pipetteCount
        }
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error setting pipette count: {str(e)}"
        )


class ToggleZRequest(BaseModel):
    """Request to toggle Z-axis up or down"""
    direction: str = Field(..., description="Direction: 'up' or 'down'")


@app.post("/api/pipetting/toggle-z")
async def toggle_z_axis(request: ToggleZRequest):
    """Toggle the Z-axis up or down"""
    if pipetting_controller is None:
        raise HTTPException(
            status_code=503,
            detail="Pipetting controller not initialized"
        )

    if request.direction not in ['up', 'down']:
        raise HTTPException(
            status_code=400,
            detail="Direction must be 'up' or 'down'"
        )

    try:
        pipetting_controller.toggle_z(request.direction)
        return {
            "status": "success",
            "message": f"Z-axis moved {request.direction}",
            "direction": request.direction
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error toggling Z-axis: {str(e)}"
        )


class VolumeRequest(BaseModel):
    """Request for aspirate/dispense operations"""
    volume: float = Field(..., gt=0, le=10, description="Volume in mL (0-10)")


@app.post("/api/pipetting/aspirate")
async def aspirate_liquid(request: VolumeRequest):
    """Aspirate (collect) liquid into pipette"""
    if pipetting_controller is None:
        raise HTTPException(
            status_code=503,
            detail="Pipetting controller not initialized"
        )

    try:
        pipetting_controller.aspirate(request.volume)
        return {
            "status": "success",
            "message": f"Aspirated {request.volume} mL",
            "volume": request.volume
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error aspirating liquid: {str(e)}"
        )


@app.post("/api/pipetting/dispense")
async def dispense_liquid(request: VolumeRequest):
    """Dispense liquid from pipette"""
    if pipetting_controller is None:
        raise HTTPException(
            status_code=503,
            detail="Pipetting controller not initialized"
        )

    try:
        pipetting_controller.dispense(request.volume)
        return {
            "status": "success",
            "message": f"Dispensed {request.volume} mL",
            "volume": request.volume
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error dispensing liquid: {str(e)}"
        )


# Manual axis control endpoints
class AxisMoveRequest(BaseModel):
    """Request to move a specific axis"""
    axis: str = Field(..., description="Axis to move: 'x', 'y', 'z', or 'pipette'")
    steps: int = Field(..., gt=0, le=10000, description="Number of steps to move")
    direction: str = Field(..., description="Direction: 'cw' (clockwise) or 'ccw' (counterclockwise)")


@app.post("/api/axis/move")
async def move_axis(request: AxisMoveRequest):
    """Move a specific axis by a number of steps"""
    if pipetting_controller is None:
        raise HTTPException(
            status_code=503,
            detail="Pipetting controller not initialized"
        )

    if request.axis.lower() not in ['x', 'y', 'z', 'pipette']:
        raise HTTPException(
            status_code=400,
            detail="Axis must be 'x', 'y', 'z', or 'pipette'"
        )

    if request.direction not in ['cw', 'ccw']:
        raise HTTPException(
            status_code=400,
            detail="Direction must be 'cw' or 'ccw'"
        )

    try:
        positions = pipetting_controller.move_axis(
            request.axis,
            request.steps,
            request.direction
        )
        return {
            "status": "success",
            "message": f"Moved {request.axis.upper()}-axis {request.steps} steps {request.direction.upper()}",
            "positions": positions
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error moving axis: {str(e)}"
        )


@app.get("/api/axis/positions")
async def get_axis_positions():
    """Get current positions of all axes"""
    if pipetting_controller is None:
        raise HTTPException(
            status_code=503,
            detail="Pipetting controller not initialized"
        )

    try:
        positions = pipetting_controller.get_axis_positions()
        return {
            "status": "success",
            "positions": positions
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error getting positions: {str(e)}"
        )


# Configuration management endpoints
ENV_FILE = Path(__file__).parent / ".env"

class ConfigurationModel(BaseModel):
    """Configuration settings model"""
    # Well Plate Physical Dimensions
    WELL_SPACING: float = Field(..., gt=0, description="Spacing between well centers in mm")
    WELL_DIAMETER: float = Field(..., gt=0, description="Diameter of each well in mm")
    WELL_HEIGHT: float = Field(..., gt=0, description="Height of each well in mm")

    # Motor Configuration
    STEPS_PER_MM_X: int = Field(..., gt=0, description="X-axis steps per mm")
    STEPS_PER_MM_Y: int = Field(..., gt=0, description="Y-axis steps per mm")
    STEPS_PER_MM_Z: int = Field(..., gt=0, description="Z-axis steps per mm")

    # Pipette Configuration
    PIPETTE_STEPS_PER_ML: int = Field(..., gt=0, description="Pipette steps per mL")

    # Pipetting Operation Parameters
    PICKUP_DEPTH: float = Field(..., gt=0, description="Depth to descend for pickup in mm")
    DROPOFF_DEPTH: float = Field(..., gt=0, description="Depth to descend for dropoff in mm")
    SAFE_HEIGHT: float = Field(..., gt=0, description="Safe height above well for travel in mm")
    RINSE_CYCLES: int = Field(..., ge=0, description="Number of rinse cycles")

    # Movement Speed Configuration
    TRAVEL_SPEED: float = Field(..., gt=0, description="Fast movement speed (seconds/step)")
    PIPETTE_SPEED: float = Field(..., gt=0, description="Pipetting operation speed (seconds/step)")


@app.get("/api/config")
async def get_configuration():
    """
    Get current configuration settings
    Returns current values from environment variables or defaults
    """
    try:
        config = {
            "WELL_SPACING": float(os.getenv('WELL_SPACING', '4.0')),
            "WELL_DIAMETER": float(os.getenv('WELL_DIAMETER', '8.0')),
            "WELL_HEIGHT": float(os.getenv('WELL_HEIGHT', '14.0')),
            "STEPS_PER_MM_X": int(os.getenv('STEPS_PER_MM_X', '100')),
            "STEPS_PER_MM_Y": int(os.getenv('STEPS_PER_MM_Y', '100')),
            "STEPS_PER_MM_Z": int(os.getenv('STEPS_PER_MM_Z', '100')),
            "PIPETTE_STEPS_PER_ML": int(os.getenv('PIPETTE_STEPS_PER_ML', '1000')),
            "PICKUP_DEPTH": float(os.getenv('PICKUP_DEPTH', '10.0')),
            "DROPOFF_DEPTH": float(os.getenv('DROPOFF_DEPTH', '5.0')),
            "SAFE_HEIGHT": float(os.getenv('SAFE_HEIGHT', '20.0')),
            "RINSE_CYCLES": int(os.getenv('RINSE_CYCLES', '3')),
            "TRAVEL_SPEED": float(os.getenv('TRAVEL_SPEED', '0.001')),
            "PIPETTE_SPEED": float(os.getenv('PIPETTE_SPEED', '0.002')),
        }
        return {
            "status": "success",
            "config": config
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error reading configuration: {str(e)}"
        )


@app.post("/api/config")
async def update_configuration(config: ConfigurationModel):
    """
    Update configuration settings and save to .env file
    Configuration is reloaded immediately without requiring restart
    """
    global pipetting_controller

    try:
        # Create .env file if it doesn't exist
        if not ENV_FILE.exists():
            ENV_FILE.touch()

        # Update each configuration value in the .env file
        config_dict = config.model_dump()
        for key, value in config_dict.items():
            set_key(str(ENV_FILE), key, str(value))

        # Reload environment variables from .env file
        load_dotenv(override=True)

        # Reinitialize the pipetting controller with new configuration
        if pipetting_controller:
            try:
                pipetting_controller.cleanup()
            except Exception as cleanup_error:
                print(f"Warning during cleanup: {cleanup_error}")

        try:
            pipetting_controller = PipettingController()
            print("Pipetting controller reinitialized with new configuration")
        except Exception as init_error:
            print(f"Warning: Could not reinitialize pipetting controller: {init_error}")
            print("Running in simulation mode")

        return {
            "status": "success",
            "message": "Configuration saved and applied successfully!",
            "config": config_dict
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error saving configuration: {str(e)}"
        )


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
