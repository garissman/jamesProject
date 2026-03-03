import asyncio
import threading
from contextlib import asynccontextmanager
from functools import partial
from pathlib import Path
from typing import Optional, List, Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import settings
from pipetting_controller import PipettingController, PipettingStep, CoordinateMapper

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

    # Load stored per-layout coordinates into CoordinateMapper
    cfg = settings.load()
    CoordinateMapper.LAYOUT_COORDINATES = cfg.get("LAYOUT_COORDINATES", {})
    print(f"Loaded LAYOUT_COORDINATES for layouts: {list(CoordinateMapper.LAYOUT_COORDINATES.keys())}")

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
    sampleVolume: float = Field(..., gt=0, description="Volume in mL")
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

    global is_executing
    try:
        is_executing = True
        pipetting_controller.current_operation = "homing"
        await asyncio.to_thread(pipetting_controller.home)
        return {"status": "success", "message": "System moved to home position (well A1)"}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error homing system: {str(e)}"
        )
    finally:
        is_executing = False
        pipetting_controller.current_operation = "idle"


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
        await asyncio.to_thread(pipetting_controller.move_to_well, request.wellId, 0)
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
        layout_type = pipetting_controller.layout_type
        current_operation = pipetting_controller.current_operation
        operation_well = pipetting_controller.operation_well
        controller_type = pipetting_controller.controller_type
        return {
            "initialized": True,
            "position": {
                "x": position.x,
                "y": position.y,
                "z": position.z
            },
            "current_well": current_well,
            "pipette_count": pipette_count,
            "layout_type": layout_type,
            "controller_type": controller_type,
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


class SetLayoutTypeRequest(BaseModel):
    """Request to set layout type"""
    layoutType: str = Field(..., description="Layout type: 'microchip' or 'wellplate'")


@app.post("/api/pipetting/set-layout-type")
async def set_layout_type(request: SetLayoutTypeRequest):
    """Set the layout type (microchip or wellplate)"""
    if pipetting_controller is None:
        raise HTTPException(
            status_code=503,
            detail="Pipetting controller not initialized"
        )

    if request.layoutType not in ['microchip', 'wellplate']:
        raise HTTPException(
            status_code=400,
            detail="Layout type must be 'microchip' or 'wellplate'"
        )

    try:
        pipetting_controller.layout_type = request.layoutType
        CoordinateMapper.CURRENT_LAYOUT = request.layoutType
        pipetting_controller.save_position()
        return {
            "status": "success",
            "message": f"Layout type set to {request.layoutType}",
            "layout_type": request.layoutType
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error setting layout type: {str(e)}"
        )


class SetLayoutRequest(BaseModel):
    """Request to set layout type (short-form endpoint)"""
    layoutType: str = Field(..., description="'microchip' or 'wellplate'")


@app.post("/api/pipetting/set-layout")
async def set_layout(request: SetLayoutRequest):
    """Set the layout type — canonical endpoint used by the frontend"""
    if pipetting_controller is None:
        raise HTTPException(status_code=503, detail="Pipetting controller not initialized")

    if request.layoutType not in ['microchip', 'wellplate']:
        raise HTTPException(status_code=400, detail="layoutType must be 'microchip' or 'wellplate'")

    try:
        pipetting_controller.layout_type = request.layoutType
        CoordinateMapper.CURRENT_LAYOUT = request.layoutType
        pipetting_controller.save_position()

        # Find first mapped well for auto-move
        layout_coords = CoordinateMapper.LAYOUT_COORDINATES.get(request.layoutType, {})
        first_mapped_well = None
        for well_id, coords in layout_coords.items():
            if coords is not None:
                first_mapped_well = well_id
                break

        return {
            "status": "success",
            "layout_type": request.layoutType,
            "first_mapped_well": first_mapped_well,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error setting layout: {str(e)}")


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
        await asyncio.to_thread(pipetting_controller.toggle_z, request.direction)
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
    volume: float = Field(..., gt=0, description="Volume in mL")


@app.post("/api/pipetting/aspirate")
async def aspirate_liquid(request: VolumeRequest):
    """Aspirate (collect) liquid into pipette"""
    if pipetting_controller is None:
        raise HTTPException(
            status_code=503,
            detail="Pipetting controller not initialized"
        )

    try:
        await asyncio.to_thread(pipetting_controller.aspirate, request.volume)
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
        await asyncio.to_thread(pipetting_controller.dispense, request.volume)
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


# Controller type switching endpoint
class SetControllerTypeRequest(BaseModel):
    """Request to switch controller type"""
    controllerType: str = Field(..., description="Controller type: 'raspberry_pi' or 'arduino_uno_q'")


@app.post("/api/pipetting/set-controller-type")
async def set_controller_type(request: SetControllerTypeRequest):
    """Switch the hardware controller type at runtime"""
    global pipetting_controller

    if request.controllerType not in ('raspberry_pi', 'arduino_uno_q'):
        raise HTTPException(status_code=400, detail="controllerType must be 'raspberry_pi' or 'arduino_uno_q'")

    try:
        # Persist to config.json
        cfg = settings.load()
        cfg['CONTROLLER_TYPE'] = request.controllerType
        settings.save(cfg)

        # Reinitialize controller with new type
        if pipetting_controller:
            try:
                pipetting_controller.cleanup()
            except Exception as cleanup_error:
                print(f"Warning during cleanup: {cleanup_error}")

        pipetting_controller = PipettingController()
        print(f"Controller switched to: {request.controllerType}")

        return {
            "status": "success",
            "message": f"Controller switched to {request.controllerType}",
            "controller_type": request.controllerType
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error switching controller: {str(e)}")


# Arduino-specific endpoints (LED test, MCU ping, limit switches via RPC)
class LedTestRequest(BaseModel):
    """Request for LED test"""
    pattern: str = Field("all", description="LED pattern: all, matrix, rgb, progress, motor, idle, sweep, etc.")
    value: int = Field(0, description="Optional value for pattern")


@app.post("/api/led/test")
async def test_led(request: LedTestRequest):
    """Test LED matrix and RGB LEDs on Arduino UNO Q"""
    if pipetting_controller is None:
        raise HTTPException(status_code=503, detail="Pipetting controller not initialized")

    if pipetting_controller.controller_type != 'arduino_uno_q':
        raise HTTPException(status_code=400, detail="LED test is only available in Arduino UNO Q mode")

    try:
        result = await asyncio.to_thread(pipetting_controller.stepper_controller.led_test, request.pattern, request.value)
        return {
            "status": "success" if result else "failed",
            "message": f"LED test '{request.pattern}' executed",
            "pattern": request.pattern,
            "value": request.value
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error running LED test: {str(e)}")


@app.get("/api/mcu/ping")
async def ping_mcu():
    """Ping the MCU to verify communication (Arduino UNO Q only)"""
    if pipetting_controller is None:
        raise HTTPException(status_code=503, detail="Pipetting controller not initialized")

    if pipetting_controller.controller_type != 'arduino_uno_q':
        raise HTTPException(status_code=400, detail="MCU ping is only available in Arduino UNO Q mode")

    try:
        if pipetting_controller.stepper_controller.lock.locked():
            return {"status": "busy", "connected": True, "message": "MCU is busy (motor moving)"}
        result = await asyncio.to_thread(pipetting_controller.stepper_controller.ping)
        return {
            "status": "success" if result else "failed",
            "connected": result,
            "message": "MCU responded with pong" if result else "No response from MCU"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error pinging MCU: {str(e)}")


@app.get("/api/mcu/limits")
async def get_mcu_limit_switches():
    """Get state of all limit switches via Arduino RPC"""
    if pipetting_controller is None:
        raise HTTPException(status_code=503, detail="Pipetting controller not initialized")

    if pipetting_controller.controller_type != 'arduino_uno_q':
        raise HTTPException(status_code=400, detail="MCU limits endpoint is only available in Arduino UNO Q mode")

    try:
        if pipetting_controller.stepper_controller.lock.locked():
            return {"status": "busy", "limits": [], "message": "MCU is busy"}
        limits = await asyncio.to_thread(pipetting_controller.stepper_controller.get_limit_states)
        return {"status": "success", "limits": limits}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting limit states: {str(e)}")


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
        positions = await asyncio.to_thread(
            pipetting_controller.move_axis,
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


class SetPositionRequest(BaseModel):
    """Request to override the current tracked position"""
    x: float = Field(..., description="X position in mm")
    y: float = Field(..., description="Y position in mm")
    z: float = Field(..., description="Z position in mm")
    pipette_ml: float = Field(0.0, description="Pipette position in mL")


@app.post("/api/axis/set-position")
async def set_axis_position(request: SetPositionRequest):
    """Override the current tracked position (does NOT move motors)"""
    if pipetting_controller is None:
        raise HTTPException(
            status_code=503,
            detail="Pipetting controller not initialized"
        )

    try:
        from pipetting_controller import WellCoordinates
        pipetting_controller.current_position = WellCoordinates(
            x=request.x, y=request.y, z=request.z
        )
        # Also reset motor step counters to match (RPi only — Arduino doesn't expose per-motor objects)
        if pipetting_controller.controller_type != 'arduino_uno_q':
            mapper = pipetting_controller.mapper
            pipetting_controller.stepper_controller.get_motor(1).current_position = int(request.x * mapper.STEPS_PER_MM_X)
            pipetting_controller.stepper_controller.get_motor(2).current_position = int(request.y * mapper.STEPS_PER_MM_Y)
            pipetting_controller.stepper_controller.get_motor(3).current_position = int(request.z * mapper.STEPS_PER_MM_Z)
        pipetting_controller.pipette_ml = request.pipette_ml
        pipetting_controller.save_position()
        return {
            "status": "success",
            "message": f"Position set to X={request.x}, Y={request.y}, Z={request.z}, Pipette={request.pipette_ml}mL",
            "positions": pipetting_controller.get_axis_positions()
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error setting position: {str(e)}"
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
        # Arduino: transform flat limits array to match frontend format
        if pipetting_controller.controller_type == 'arduino_uno_q':
            # Non-blocking: return cached data if MCU is occupied (e.g. during motor move)
            if pipetting_controller.stepper_controller.lock.locked():
                cached = getattr(get_limit_switches, '_last_result', None)
                if cached:
                    result = cached.copy()
                    result["status"] = "busy"
                    result["message"] = "MCU is busy (motor moving) - showing last known state"
                    return result
                return {
                    "status": "busy",
                    "message": "MCU is busy (motor moving)",
                    "limit_states": {},
                    "pin_configuration": {},
                    "limits": [],
                }
            limits = await asyncio.to_thread(pipetting_controller.stepper_controller.get_limit_states)
            limit_states = {}
            pin_config = {}
            for lim in limits:
                mid = lim["motor_id"]
                limit_states[mid] = {
                    "min": lim["min_triggered"],
                    "max": lim["max_triggered"],
                }
                pin_config[mid] = {
                    "min_pin": lim.get("limit_min_pin"),
                    "max_pin": lim.get("limit_max_pin"),
                }
            result = {
                "status": "success",
                "limit_states": limit_states,
                "pin_configuration": pin_config,
                "limits": limits,
            }
            get_limit_switches._last_result = result.copy()
            return result

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
DRIFT_TEST_MOTOR_NAMES = {1: "X-Axis", 2: "Y-Axis", 3: "Z-Axis", 4: "Pipette"}


class DriftTestRequest(BaseModel):
    """Request to start a drift test"""
    cycles: int = Field(default=10, gt=0, le=1000, description="Number of test cycles")
    motor_speed: float = Field(default=0.001, gt=0, le=0.1, description="Motor speed (delay between steps)")
    steps_per_mm: int = Field(default=200, gt=0, le=10000, description="Steps per millimeter")
    motor: int = Field(default=1, ge=1, le=4, description="Motor to test: 1=X, 2=Y, 3=Z, 4=Pipette")


def _move_until_limit_rpi(motor, direction, motor_speed):
    """RPi: use motor object's move_until_limit method.
    Returns (steps_taken, hit_limit: bool)"""
    steps, hit = motor.move_until_limit(direction, motor_speed, override_min_delay=True)
    return steps, hit != 'none'


def _move_until_limit_arduino(stepper, motor_num, direction, motor_speed):
    """Arduino: use dedicated move_until_limit RPC for proper limit handling.
    motor_speed is delay in seconds - convert to microseconds for Arduino.
    Returns (steps_taken, hit_limit: bool)"""
    delay_us = max(50, int(motor_speed * 1_000_000))
    result = stepper.move_until_limit(motor_num, direction, delay_us)
    # Refresh the limit switch cache now that motor is stopped
    _refresh_limit_cache(stepper)
    return result["steps_taken"], result["hit_limit"]


def _refresh_limit_cache(stepper):
    """Read limit switches from MCU and update the cache used by /api/limit-switches"""
    try:
        import time
        time.sleep(0.05)  # Brief settle time after motor stops
        limits = stepper.get_limit_states()
        limit_states = {}
        pin_config = {}
        for lim in limits:
            mid = lim["motor_id"]
            limit_states[mid] = {
                "min": lim["min_triggered"],
                "max": lim["max_triggered"],
            }
            pin_config[mid] = {
                "min_pin": lim.get("limit_min_pin"),
                "max_pin": lim.get("limit_max_pin"),
            }
        get_limit_switches._last_result = {
            "status": "success",
            "limit_states": limit_states,
            "pin_configuration": pin_config,
            "limits": limits,
        }
    except Exception as e:
        print(f"Warning: failed to refresh limit cache: {e}")


def run_drift_test(cycles: int, motor_speed: float, steps_per_mm: int, motor_num: int = 1):
    """
    Simple drift test: move back and forth between limits, count steps.
    Works with both RPi (direct motor access) and Arduino (RPC move_motor).
    Respects motor inversion settings so directions are physically correct.
    """
    global drift_test_running, drift_test_results, pipetting_controller
    import time
    from datetime import datetime
    from pipetting_controller import Direction, PipettingController

    motor_name = DRIFT_TEST_MOTOR_NAMES.get(motor_num, f"Motor {motor_num}")

    # Get inversion flag for this motor
    invert_map = {
        1: PipettingController.INVERT_X,
        2: PipettingController.INVERT_Y,
        3: PipettingController.INVERT_Z,
        4: PipettingController.INVERT_PIPETTE,
    }
    invert = invert_map.get(motor_num, False)

    def inv(direction):
        """Flip direction if motor is inverted."""
        if invert:
            return Direction.COUNTERCLOCKWISE if direction == Direction.CLOCKWISE else Direction.CLOCKWISE
        return direction

    drift_test_results = {
        "status": "running",
        "motor": motor_num,
        "motor_name": motor_name,
        "current_cycle": 0,
        "total_cycles": cycles,
        "cycles": [],
        "summary": None,
        "error": None,
        "start_time": datetime.now().isoformat()
    }

    try:
        if pipetting_controller is None:
            raise Exception("Pipetting controller not initialized")

        stepper = pipetting_controller.stepper_controller
        is_arduino = pipetting_controller.controller_type == 'arduino_uno_q'

        # Validate limit switches exist (RPi only - Arduino always has limits wired)
        if not is_arduino:
            motor = stepper.get_motor(motor_num)
            has_limits = motor.limit_min_pin is not None and motor.limit_max_pin is not None
            if not has_limits:
                raise Exception(f"No limit switches configured for {motor_name}")

        def move_until_limit(direction):
            """Abstracted move-until-limit for both controllers"""
            if is_arduino:
                return _move_until_limit_arduino(stepper, motor_num, direction, motor_speed)
            else:
                return _move_until_limit_rpi(motor, direction, motor_speed)

        # Start by moving toward max (CW, respecting inversion)
        drift_test_results["status"] = "homing"
        print(f"Drift Test: Homing {motor_name} (inverted={invert})...")

        current_dir = inv(Direction.CLOCKWISE)
        print(f"Drift Test: Moving {current_dir.name} to find first limit...")
        steps, hit = move_until_limit(current_dir)

        if not hit:
            # Try other direction
            current_dir = inv(Direction.COUNTERCLOCKWISE)
            print(f"Drift Test: Trying {current_dir.name}...")
            steps, hit = move_until_limit(current_dir)

        if not hit:
            raise Exception("Could not find any limit switch")

        dir_label = "CW" if current_dir == Direction.CLOCKWISE else "CCW"
        print(f"Drift Test: Found limit ({dir_label}). Ready to start cycles.")
        drift_test_results["status"] = "running"

        # Now just go back and forth
        for cycle in range(1, cycles + 1):
            if not drift_test_running:
                drift_test_results["status"] = "stopped"
                break

            drift_test_results["current_cycle"] = cycle
            cycle_start = time.time()

            # Reverse direction
            current_dir = Direction.COUNTERCLOCKWISE if current_dir == Direction.CLOCKWISE else Direction.CLOCKWISE

            # Move until we hit the other limit
            print(f"Cycle {cycle}: Moving {current_dir.name}...")
            fwd_start = time.time()
            fwd_steps, fwd_hit = move_until_limit(current_dir)
            fwd_time = time.time() - fwd_start
            print(f"Cycle {cycle}: Hit limit after {fwd_steps} steps")

            # Reverse again
            current_dir = Direction.COUNTERCLOCKWISE if current_dir == Direction.CLOCKWISE else Direction.CLOCKWISE

            # Move back
            print(f"Cycle {cycle}: Moving {current_dir.name}...")
            back_start = time.time()
            back_steps, back_hit = move_until_limit(current_dir)
            back_time = time.time() - back_start
            print(f"Cycle {cycle}: Hit limit after {back_steps} steps")

            cycle_elapsed = time.time() - cycle_start

            # Calculate drift metrics
            step_difference = abs(fwd_steps - back_steps)
            drift_mm = step_difference / steps_per_mm

            # Inter-cycle deltas (how steps changed from previous cycle)
            prev = drift_test_results["cycles"][-1] if drift_test_results["cycles"] else None
            fwd_delta = fwd_steps - prev["forward_steps"] if prev else 0
            bwd_delta = back_steps - prev["backward_steps"] if prev else 0

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
                "drift_mm": round(drift_mm, 3),
                "fwd_delta": fwd_delta,
                "bwd_delta": bwd_delta,
            }

            drift_test_results["cycles"].append(cycle_data)
            print(f"Drift Test: Cycle {cycle}/{cycles} - Forward: {fwd_steps}, Backward: {back_steps}, Drift: {drift_mm:.3f}mm")

        # Calculate summary at the end
        if drift_test_results["cycles"]:
            cycles_data = drift_test_results["cycles"]
            drifts = [c["drift_mm"] for c in cycles_data]
            fwd_steps_list = [c["forward_steps"] for c in cycles_data]
            back_steps_list = [c["backward_steps"] for c in cycles_data]
            fwd_times = [c["forward_time"] for c in cycles_data]
            back_times = [c["backward_time"] for c in cycles_data]
            cycle_times = [c["total_cycle_time"] for c in cycles_data]
            n = len(cycles_data)

            # Inter-cycle deltas (skip first cycle which has delta=0)
            fwd_deltas = [abs(c["fwd_delta"]) for c in cycles_data[1:]] if n > 1 else [0]
            bwd_deltas = [abs(c["bwd_delta"]) for c in cycles_data[1:]] if n > 1 else [0]

            drift_test_results["summary"] = {
                "total_cycles": n,
                "avg_forward_steps": round(sum(fwd_steps_list) / n, 1),
                "avg_backward_steps": round(sum(back_steps_list) / n, 1),
                "avg_drift_mm": round(sum(drifts) / n, 3),
                "max_drift_mm": round(max(drifts), 3),
                "min_drift_mm": round(min(drifts), 3),
                "avg_forward_time": round(sum(fwd_times) / n, 2),
                "avg_backward_time": round(sum(back_times) / n, 2),
                "avg_cycle_time": round(sum(cycle_times) / n, 2),
                "total_test_time": round(sum(cycle_times), 2),
                "avg_fwd_delta": round(sum(fwd_deltas) / len(fwd_deltas), 1),
                "max_fwd_delta": max(fwd_deltas),
                "avg_bwd_delta": round(sum(bwd_deltas) / len(bwd_deltas), 1),
                "max_bwd_delta": max(bwd_deltas),
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
        args=(request.cycles, request.motor_speed, request.steps_per_mm, request.motor)
    )
    drift_test_thread.start()

    motor_name = DRIFT_TEST_MOTOR_NAMES.get(request.motor, f"Motor {request.motor}")
    return {
        "status": "started",
        "message": f"Drift test started for {motor_name} with {request.cycles} cycles",
        "cycles": request.cycles,
        "motor": request.motor,
        "motor_name": motor_name
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

class CaptureCoordinateRequest(BaseModel):
    """Request to capture current motor position as a well coordinate"""
    layout: str = Field(..., description="Layout name: 'microchip', 'vial', or 'wellplate'")
    wellId: str = Field(..., description="Well identifier (e.g., 'A2', 'MC1', 'VA2', 'SA2')")


@app.post("/api/coordinates/capture")
async def capture_coordinate(request: CaptureCoordinateRequest):
    """Capture current motor X,Y position and save as coordinate for a well/layout"""
    if pipetting_controller is None:
        raise HTTPException(status_code=503, detail="Pipetting controller not initialized")

    try:
        # Read current motor position in mm
        positions = pipetting_controller.stepper_controller.get_positions()
        x_mm = positions.get("x", 0.0)
        y_mm = positions.get("y", 0.0)

        # Load current config, update the coordinate, and save
        cfg = settings.load()
        layout_coords = cfg.setdefault("LAYOUT_COORDINATES", {})
        layout_wells = layout_coords.setdefault(request.layout, {})
        layout_wells[request.wellId] = {"x": x_mm, "y": y_mm}
        settings.save(cfg)

        # Update in-memory CoordinateMapper
        CoordinateMapper.LAYOUT_COORDINATES = cfg["LAYOUT_COORDINATES"]

        return {
            "status": "success",
            "message": f"Captured position for {request.wellId} in {request.layout}: X={x_mm:.2f}, Y={y_mm:.2f}",
            "well": request.wellId,
            "layout": request.layout,
            "x": x_mm,
            "y": y_mm,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error capturing coordinate: {str(e)}")


class SaveCoordinateRequest(BaseModel):
    """Request to manually save or clear a coordinate for a well"""
    layout: str = Field(..., description="Layout name")
    wellId: str = Field(..., description="Well identifier")
    x: Optional[float] = Field(None, description="X position in mm (null to clear)")
    y: Optional[float] = Field(None, description="Y position in mm (null to clear)")


@app.post("/api/coordinates/save")
async def save_coordinate(request: SaveCoordinateRequest):
    """Manually save or clear X,Y coordinate for a well in a layout"""
    try:
        cfg = settings.load()
        layout_coords = cfg.setdefault("LAYOUT_COORDINATES", {})
        layout_wells = layout_coords.setdefault(request.layout, {})

        if request.x is None or request.y is None:
            layout_wells[request.wellId] = None
            msg = f"Cleared coordinate for {request.wellId}"
        else:
            layout_wells[request.wellId] = {"x": request.x, "y": request.y}
            msg = f"Saved coordinate for {request.wellId}: X={request.x:.2f}, Y={request.y:.2f}"

        settings.save(cfg)
        CoordinateMapper.LAYOUT_COORDINATES = cfg["LAYOUT_COORDINATES"]

        return {
            "status": "success",
            "message": msg,
            "well": request.wellId,
            "layout": request.layout,
            "x": request.x,
            "y": request.y,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving coordinate: {str(e)}")


@app.get("/api/coordinates/{layout}")
async def get_coordinates(layout: str):
    """Get all stored coordinates for a layout"""
    cfg = settings.load()
    layout_coords = cfg.get("LAYOUT_COORDINATES", {}).get(layout, {})
    return {"status": "success", "layout": layout, "coordinates": layout_coords}


class ConfigurationModel(BaseModel):
    """Configuration settings model"""
    # Bed Offset
    BED_OFFSET_X: float = Field(..., description="Bed X offset from home in mm")
    BED_OFFSET_Y: float = Field(..., description="Bed Y offset from home in mm")

    # Well Plate Physical Dimensions
    WELL_SPACING: float = Field(..., gt=0, description="Spacing between well centers in mm")
    WELL_DIAMETER: float = Field(..., gt=0, description="Diameter of each well in mm")
    WELL_HEIGHT: float = Field(..., gt=0, description="Height of each well in mm")

    # Vial Layout Physical Dimensions
    VIAL_WELL_SPACING:  float = Field(..., gt=0, description="Vial/small well spacing in mm")
    VIAL_WELL_DIAMETER: float = Field(..., gt=0, description="Vial/small well diameter in mm")
    VIAL_WELL_HEIGHT:   float = Field(..., gt=0, description="Vial/small well height in mm")

    # Motor Configuration
    STEPS_PER_MM_X: int = Field(..., gt=0, description="X-axis steps per mm")
    STEPS_PER_MM_Y: int = Field(..., gt=0, description="Y-axis steps per mm")
    STEPS_PER_MM_Z: int = Field(..., gt=0, description="Z-axis steps per mm")

    # Pipette Configuration
    PIPETTE_STEPS_PER_ML: int = Field(..., gt=0, description="Pipette steps per mL")
    PIPETTE_MAX_ML: float = Field(..., gt=0, description="Maximum pipette volume in mL")

    # Pipetting Operation Parameters
    PICKUP_DEPTH: float = Field(..., gt=0, description="Depth to descend for pickup in mm")
    DROPOFF_DEPTH: float = Field(..., gt=0, description="Depth to descend for dropoff in mm")
    SAFE_HEIGHT: float = Field(..., gt=0, description="Safe height above well for travel in mm")
    RINSE_CYCLES: int = Field(..., ge=0, description="Number of rinse cycles")

    # Movement Speed Configuration
    TRAVEL_SPEED: float = Field(..., gt=0, description="Fast movement speed (seconds/step)")
    PIPETTE_SPEED: float = Field(..., gt=0, description="Pipetting operation speed (seconds/step)")

    # Washing Station Dimensions
    WS_POSITION_X: float = Field(..., description="X position of washing station in mm")
    WS_POSITION_Y: float = Field(..., description="Y position of washing station in mm")
    WS_HEIGHT:     float = Field(..., gt=0, description="Height of each washing station in mm")
    WS_WIDTH:      float = Field(..., gt=0, description="Width of each washing station in mm")
    WS_GAP:        float = Field(..., ge=0, description="Gap between WS1 and WS2 in mm")

    # Motor Inversion Flags
    INVERT_X:       bool = Field(..., description="Invert X-axis motor direction")
    INVERT_Y:       bool = Field(..., description="Invert Y-axis motor direction")
    INVERT_Z:       bool = Field(..., description="Invert Z-axis motor direction")
    INVERT_PIPETTE: bool = Field(..., description="Invert pipette motor direction")

    # Controller Type
    CONTROLLER_TYPE: str = Field("raspberry_pi", description="Controller type: 'raspberry_pi' or 'arduino_uno_q'")


@app.get("/api/config")
async def get_configuration():
    """
    Get current configuration settings
    Returns current values from config.json or defaults
    """
    try:
        return {"status": "success", "config": settings.load()}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error reading configuration: {str(e)}"
        )


@app.post("/api/config")
async def update_configuration(config: ConfigurationModel):
    """
    Update configuration settings and save to config.json
    Configuration is reloaded immediately without requiring restart
    """
    global pipetting_controller

    try:
        # Persist new values to config.json, preserving LAYOUT_COORDINATES
        cfg = config.model_dump()
        existing = settings.load()
        cfg["LAYOUT_COORDINATES"] = existing.get("LAYOUT_COORDINATES", {})
        settings.save(cfg)

        # Patch CoordinateMapper stored coordinates
        CoordinateMapper.LAYOUT_COORDINATES = cfg["LAYOUT_COORDINATES"]

        # Patch CoordinateMapper class-level attributes so they reflect new values
        # without requiring a full process restart (class attrs are set at import time)
        CoordinateMapper.BED_OFFSET_X       = cfg['BED_OFFSET_X']
        CoordinateMapper.BED_OFFSET_Y       = cfg['BED_OFFSET_Y']
        CoordinateMapper.WELL_SPACING       = cfg['WELL_SPACING']
        CoordinateMapper.WELL_DIAMETER      = cfg['WELL_DIAMETER']
        CoordinateMapper.WELL_HEIGHT        = cfg['WELL_HEIGHT']
        CoordinateMapper.SMALL_WELL_SPACING = cfg['VIAL_WELL_SPACING']
        CoordinateMapper.VIAL_WELL_DIAMETER = cfg['VIAL_WELL_DIAMETER']
        CoordinateMapper.VIAL_WELL_HEIGHT   = cfg['VIAL_WELL_HEIGHT']
        CoordinateMapper.STEPS_PER_MM_X     = cfg['STEPS_PER_MM_X']
        CoordinateMapper.STEPS_PER_MM_Y     = cfg['STEPS_PER_MM_Y']
        CoordinateMapper.STEPS_PER_MM_Z     = cfg['STEPS_PER_MM_Z']

        # Patch PipettingController inversion flags and pipette config
        from pipetting_controller import PipettingController as PC
        PC.INVERT_X       = cfg['INVERT_X']
        PC.INVERT_Y       = cfg['INVERT_Y']
        PC.INVERT_Z       = cfg['INVERT_Z']
        PC.INVERT_PIPETTE = cfg['INVERT_PIPETTE']
        PC.PIPETTE_STEPS_PER_ML = cfg['PIPETTE_STEPS_PER_ML']
        PC.PIPETTE_MAX_ML       = cfg['PIPETTE_MAX_ML']

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
            "config": cfg
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
