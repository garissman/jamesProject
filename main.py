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

# Drift test state
drift_test_thread: Optional[threading.Thread] = None
drift_test_running = False
drift_test_results: Dict = {
    "status": "idle",
    "current_cycle": 0,
    "total_cycles": 0,
    "cycles": [],
    "summary": None,
    "error": None
}


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


@app.get("/api/limit-switches")
async def get_limit_switches():
    """Get current status of all limit switches - for diagnostics"""
    if pipetting_controller is None:
        raise HTTPException(
            status_code=503,
            detail="Pipetting controller not initialized"
        )

    try:
        stepper = pipetting_controller.stepper_controller
        limit_states = stepper.check_all_limit_switches()

        # Also include pin configuration for reference
        pin_config = {
            motor_id: {
                'min_pin': stepper.LIMIT_SWITCH_PINS.get(motor_id, (None, None))[0],
                'max_pin': stepper.LIMIT_SWITCH_PINS.get(motor_id, (None, None))[1]
            }
            for motor_id in stepper.motors
        }

        return {
            "status": "success",
            "limit_states": limit_states,
            "pin_configuration": pin_config,
            "note": "Switches should read 'true' when triggered (pressed). If always false, check wiring."
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error reading limit switches: {str(e)}"
        )


# Motor Drift Test endpoints
class DriftTestRequest(BaseModel):
    """Request to start a drift test"""
    cycles: int = Field(default=10, gt=0, le=1000, description="Number of test cycles")
    motor_speed: float = Field(default=0.001, gt=0, le=0.1, description="Motor speed (delay between steps)")
    steps_per_mm: int = Field(default=200, gt=0, le=10000, description="Steps per millimeter")


def run_drift_test(cycles: int, motor_speed: float, steps_per_mm: int):
    """Run the actual motor drift test using the stepper controller"""
    global drift_test_running, drift_test_results, pipetting_controller
    import time
    from datetime import datetime
    from stepper_control import Direction, LimitSwitchState

    drift_test_results = {
        "status": "running",
        "current_cycle": 0,
        "total_cycles": cycles,
        "cycles": [],
        "summary": None,
        "error": None,
        "start_time": datetime.now().isoformat()
    }

    try:
        # Get the stepper controller from pipetting controller
        if pipetting_controller is None:
            raise Exception("Pipetting controller not initialized")

        stepper = pipetting_controller.stepper_controller
        motor_id = 1  # X-axis motor for drift test

        # Check if limit switches are available
        motor = stepper.get_motor(motor_id)
        has_limits = motor.limit_min_pin is not None and motor.limit_max_pin is not None

        if not has_limits:
            print("Warning: No limit switches configured for X-axis, running step-based test")

        # Initial homing - find first limit switch
        drift_test_results["status"] = "homing"
        print("Drift Test: Finding first limit switch...")

        if has_limits:
            # Check if already at a limit
            current_limit = None
            if motor.check_min_limit():
                current_limit = 'min'
                print("Drift Test: Already at MIN limit")
            elif motor.check_max_limit():
                current_limit = 'max'
                print("Drift Test: Already at MAX limit")

            # If not at a limit, move until we find one (checking both limits)
            if current_limit is None:
                print("Drift Test: Moving to find a limit switch...")
                steps, which_limit = motor.move_until_any_limit(Direction.CLOCKWISE, motor_speed, 50000)
                if which_limit == 'none':
                    # Try other direction
                    steps, which_limit = motor.move_until_any_limit(Direction.COUNTERCLOCKWISE, motor_speed, 50000)
                current_limit = which_limit

            if current_limit == 'none':
                raise Exception("Failed to reach any limit switch - check wiring")

            print(f"Drift Test: At {current_limit.upper()} limit")

            # Determine which direction moves AWAY from current limit
            # Try moving away from the current limit first
            print("Drift Test: Discovering correct travel direction...")

            # Choose initial direction based on which limit we're at
            # If at MIN, try CLOCKWISE first (typically away from MIN)
            # If at MAX, try COUNTERCLOCKWISE first (typically away from MAX)
            if current_limit == 'min':
                first_dir = Direction.CLOCKWISE
                second_dir = Direction.COUNTERCLOCKWISE
            else:  # at MAX
                first_dir = Direction.COUNTERCLOCKWISE
                second_dir = Direction.CLOCKWISE

            # Move in first direction and see which limit we hit
            test_steps, hit_limit = motor.move_until_any_limit(first_dir, motor_speed, 50000)

            if hit_limit == 'none':
                # Try the other direction
                print("Drift Test: First direction failed, trying opposite...")
                test_steps, hit_limit = motor.move_until_any_limit(second_dir, motor_speed, 50000)

            if hit_limit == 'none':
                raise Exception("Failed to find opposite limit - check wiring")

            # Now we know: CLOCKWISE leads to 'hit_limit', COUNTERCLOCKWISE leads to the other
            if hit_limit == 'max':
                dir_to_max = Direction.CLOCKWISE
                dir_to_min = Direction.COUNTERCLOCKWISE
            else:  # hit_limit == 'min'
                dir_to_max = Direction.COUNTERCLOCKWISE
                dir_to_min = Direction.CLOCKWISE

            print(f"Drift Test: CLOCKWISE → {hit_limit.upper()}, COUNTERCLOCKWISE → {'MIN' if hit_limit == 'max' else 'MAX'}")

            motor.reset_position()
        else:
            # No limit switches - just reset position
            motor.reset_position()
            dir_to_max = Direction.CLOCKWISE
            dir_to_min = Direction.COUNTERCLOCKWISE

        drift_test_results["status"] = "running"
        time.sleep(0.5)

        # Run test cycles
        for cycle in range(1, cycles + 1):
            if not drift_test_running:
                drift_test_results["status"] = "stopped"
                break

            drift_test_results["current_cycle"] = cycle
            cycle_start = time.time()

            if has_limits:
                # Move to one limit
                fwd_start = time.time()
                fwd_steps, fwd_limit = motor.move_until_any_limit(dir_to_max, motor_speed, 50000)
                fwd_time = time.time() - fwd_start

                if fwd_limit == 'none' and not motor.stop_requested:
                    print(f"Warning: Cycle {cycle} - Failed to reach limit")

                time.sleep(0.3)  # Brief pause at limit

                # Move to opposite limit
                back_start = time.time()
                back_steps, back_limit = motor.move_until_any_limit(dir_to_min, motor_speed, 50000)
                back_time = time.time() - back_start

                if back_limit == 'none' and not motor.stop_requested:
                    print(f"Warning: Cycle {cycle} - Failed to reach opposite limit")
            else:
                # No limit switches - move fixed number of steps
                test_steps = 5000  # Fixed test distance

                fwd_start = time.time()
                fwd_steps, _ = motor.step(Direction.CLOCKWISE, test_steps, motor_speed, check_limits=False)
                fwd_time = time.time() - fwd_start

                time.sleep(0.3)

                back_start = time.time()
                back_steps, _ = motor.step(Direction.COUNTERCLOCKWISE, test_steps, motor_speed, check_limits=False)
                back_time = time.time() - back_start

            cycle_elapsed = time.time() - cycle_start

            # Calculate drift metrics
            step_difference = abs(fwd_steps - back_steps)
            drift_mm = step_difference / steps_per_mm

            # Store cycle data
            cycle_data = {
                "cycle_number": cycle,
                "timestamp": datetime.now().isoformat(),
                "forward_steps": fwd_steps,
                "forward_time": round(fwd_time, 2),
                "backward_steps": back_steps,
                "backward_time": round(back_time, 2),
                "total_cycle_time": round(cycle_elapsed, 2),
                "step_difference": step_difference,
                "drift_mm": round(drift_mm, 3)
            }

            drift_test_results["cycles"].append(cycle_data)
            print(f"Drift Test: Cycle {cycle}/{cycles} - Forward: {fwd_steps}, Backward: {back_steps}, Drift: {drift_mm:.3f}mm")

            time.sleep(0.3)  # Brief pause between cycles

        # Calculate summary
        if drift_test_results["cycles"]:
            drifts = [c["drift_mm"] for c in drift_test_results["cycles"]]
            fwd_steps_list = [c["forward_steps"] for c in drift_test_results["cycles"]]
            back_steps_list = [c["backward_steps"] for c in drift_test_results["cycles"]]

            drift_test_results["summary"] = {
                "total_cycles": len(drift_test_results["cycles"]),
                "avg_forward_steps": round(sum(fwd_steps_list) / len(fwd_steps_list), 1),
                "avg_backward_steps": round(sum(back_steps_list) / len(back_steps_list), 1),
                "avg_drift_mm": round(sum(drifts) / len(drifts), 3),
                "max_drift_mm": round(max(drifts), 3),
                "min_drift_mm": round(min(drifts), 3)
            }

        if drift_test_results["status"] == "running":
            drift_test_results["status"] = "completed"

    except Exception as e:
        drift_test_results["status"] = "error"
        drift_test_results["error"] = str(e)
        print(f"Drift Test Error: {e}")

    finally:
        drift_test_running = False
        drift_test_results["end_time"] = datetime.now().isoformat()
        print("Drift Test: Complete")


@app.post("/api/drift-test/start")
async def start_drift_test(request: DriftTestRequest):
    """Start a motor drift test"""
    global drift_test_thread, drift_test_running, drift_test_results

    if drift_test_running:
        raise HTTPException(
            status_code=400,
            detail="Drift test is already running"
        )

    if pipetting_controller is None:
        raise HTTPException(
            status_code=503,
            detail="Pipetting controller not initialized"
        )

    drift_test_running = True

    # Start the test in a background thread
    drift_test_thread = threading.Thread(
        target=run_drift_test,
        args=(request.cycles, request.motor_speed, request.steps_per_mm)
    )
    drift_test_thread.start()

    return {
        "status": "started",
        "message": f"Drift test started with {request.cycles} cycles",
        "cycles": request.cycles
    }


@app.post("/api/drift-test/stop")
async def stop_drift_test():
    """Stop the running drift test"""
    global drift_test_running

    if not drift_test_running:
        raise HTTPException(
            status_code=400,
            detail="No drift test is running"
        )

    drift_test_running = False

    return {
        "status": "stopping",
        "message": "Drift test stop requested"
    }


@app.get("/api/drift-test/status")
async def get_drift_test_status():
    """Get the current drift test status and results"""
    return {
        "status": "success",
        "running": drift_test_running,
        "data": drift_test_results
    }


@app.post("/api/drift-test/clear")
async def clear_drift_test_results():
    """Clear drift test results"""
    global drift_test_results

    if drift_test_running:
        raise HTTPException(
            status_code=400,
            detail="Cannot clear results while test is running"
        )

    drift_test_results = {
        "status": "idle",
        "current_cycle": 0,
        "total_cycles": 0,
        "cycles": [],
        "summary": None,
        "error": None
    }

    return {
        "status": "success",
        "message": "Drift test results cleared"
    }


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
