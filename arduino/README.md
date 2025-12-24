# Arduino UNO Q Stepper Controller

This directory contains the Arduino sketch for controlling 4 stepper motors via the STM32U585 MCU on the Arduino UNO Q board.

## Hardware Requirements

- Arduino UNO Q (ABX00162 or ABX00173)
- 4x Stepper motor drivers (DRV8825 or A4988)
- 4x Stepper motors (NEMA 17 recommended, 1.8° step angle)
- 4x Limit switches (normally open, NO)
- 24V power supply for stepper drivers

## Pin Configuration

The motors and limit switches are connected to the JDIGITAL header on the Arduino UNO Q:

| Motor | Function | Pulse Pin | Direction Pin | Limit Pin |
|-------|----------|-----------|---------------|-----------|
| 1     | X-axis   | D2        | D3            | D10       |
| 2     | Y-axis   | D4        | D5            | D11       |
| 3     | Z-axis   | D6        | D7            | D12       |
| 4     | Pipette  | D8        | D9            | D13       |

**Note:** All JDIGITAL pins operate at 3.3V logic. Most stepper drivers (DRV8825, A4988) accept 3.3V logic levels.

## Wiring Diagram

```
Arduino UNO Q (JDIGITAL)          Stepper Driver / Limit Switch
------------------------          -----------------------------
D2 (Pulse) ------------------>    STEP (Motor 1)
D3 (Dir)   ------------------>    DIR  (Motor 1)
D10 (Limit) <-----------------    Limit Switch 1 (other terminal to GND)

D4 (Pulse) ------------------>    STEP (Motor 2)
D5 (Dir)   ------------------>    DIR  (Motor 2)
D11 (Limit) <-----------------    Limit Switch 2 (other terminal to GND)

D6 (Pulse) ------------------>    STEP (Motor 3)
D7 (Dir)   ------------------>    DIR  (Motor 3)
D12 (Limit) <-----------------    Limit Switch 3 (other terminal to GND)

D8 (Pulse) ------------------>    STEP (Motor 4)
D9 (Dir)   ------------------>    DIR  (Motor 4)
D13 (Limit) <-----------------    Limit Switch 4 (other terminal to GND)

GND        ------------------>    GND (all drivers and limit switches)
```

## Limit Switch Wiring

Limit switches are **normally open (NO)** and connected between the limit pin and GND:
- Internal pull-up resistors are enabled on the Arduino
- When switch is **open**: pin reads HIGH (not triggered)
- When switch is **closed/pressed**: pin reads LOW (triggered)

```
Limit Switch Wiring:

  Arduino Pin ----+
                  |
                 [NO Switch]
                  |
  GND        ----+
```

## Arduino Library Dependencies

Install via Arduino IDE Library Manager:
- **ArduinoJson** by Benoit Blanchon (v7.x recommended)
- **Arduino_LED_Matrix** (included with Arduino UNO Q board package)

## Upload Instructions

1. Open Arduino IDE 2.x
2. Select Board: "Arduino UNO Q"
3. Select Port: (usually /dev/ttyACM0 on Linux, COM3+ on Windows)
4. Install ArduinoJson library if not already installed
5. Open `stepper_controller/stepper_controller.ino`
6. Click Upload

## Communication Protocol

The sketch communicates via JSON over serial at 115200 baud.

### Commands

**Initialize Motor:**
```json
{"cmd": "init_motor", "motor_id": 1, "pulse_pin": 2, "dir_pin": 3, "limit_pin": 10}
```

**Move Steps (with limit switch protection):**
```json
{"cmd": "step", "motor_id": 1, "direction": 1, "steps": 100, "delay_us": 1000, "respect_limit": true}
```
- `direction`: 1 = clockwise, 0 = counterclockwise
- `delay_us`: microseconds between steps (controls speed)
- `respect_limit`: if true, stops when limit switch is triggered

**Response:**
```json
{"status": "ok", "steps_executed": 100, "limit_triggered": false}
```

**Home Single Motor:**
```json
{"cmd": "home_motor", "motor_id": 1, "direction": 0, "delay_us": 2000, "max_steps": 10000}
```
Moves motor until limit switch is triggered or max_steps reached.

**Response:**
```json
{"status": "ok", "motor_id": 1, "steps_to_home": 4532, "homed": true}
```

**Home All Motors:**
```json
{"cmd": "home_all", "direction": 0, "delay_us": 2000, "max_steps": 10000}
```

**Response:**
```json
{"status": "ok", "steps_to_home": [4532, 3210, 5678, 2345], "homed": [true, true, true, true]}
```

**Get Limit Switch States:**
```json
{"cmd": "get_limits"}
```

**Response:**
```json
{
  "status": "ok",
  "limits": [
    {"motor_id": 1, "triggered": false, "pin": 10},
    {"motor_id": 2, "triggered": true, "pin": 11},
    {"motor_id": 3, "triggered": false, "pin": 12},
    {"motor_id": 4, "triggered": false, "pin": 13}
  ]
}
```

**Stop Motor:**
```json
{"cmd": "stop", "motor_id": 1}
```

**Stop All Motors:**
```json
{"cmd": "stop_all"}
```

**Batch Move (Simultaneous with limit protection):**
```json
{
  "cmd": "move_batch",
  "respect_limits": true,
  "movements": [
    {"motor_id": 1, "steps": 100, "direction": 1, "delay_us": 1000},
    {"motor_id": 2, "steps": 50, "direction": 0, "delay_us": 2000}
  ]
}
```

**Response:**
```json
{
  "status": "ok",
  "results": [
    {"motor_id": 1, "steps_executed": 100, "limit_hit": false},
    {"motor_id": 2, "steps_executed": 42, "limit_hit": true}
  ]
}
```

**Ping (Connection Test):**
```json
{"cmd": "ping"}
```

**LED Test (Visual Feedback Test):**
```json
{"cmd": "led_test", "pattern": "all"}
```

Available patterns:
- `"all"` - Full test sequence (matrix sweep, progress bar, motor indicators, status patterns)
- `"matrix"` - LED matrix sweep animation
- `"rgb"` - RGB LED color cycle test
- `"progress"` - Show progress bar (use `"value": 0-100` for percentage)
- `"motor"` - Show motor indicator (use `"value": 0-3` for motor X/Y/Z/P)
- `"idle"` - Idle state animation (breathing pattern)
- `"moving"` - Moving state (fast blue pulse)
- `"homing"` - Homing animation (use `"value": 0-3` for motor)
- `"error"` - Error pattern (red X on matrix)
- `"success"` - Success pattern (green checkmark)

**Examples:**
```json
{"cmd": "led_test", "pattern": "progress", "value": 75}
{"cmd": "led_test", "pattern": "motor", "value": 2}
{"cmd": "led_test", "pattern": "matrix"}
```

### Visual Feedback System

The Arduino UNO Q provides rich visual feedback:

**LED Matrix (8x12 Blue LEDs):**
- Progress bars during motor movements
- Motor indicators showing X, Y, Z, P letters
- Animated patterns for idle, homing, error states
- Checkmark for success, X for error

**RGB LEDs (LED3 & LED4 - MCU controlled):**
| State | LED3 Color | LED4 Color |
|-------|-----------|-----------|
| Idle | Green | Dim Green |
| Moving | Blue | Cyan |
| Homing | Yellow | Orange |
| Error | Red | Red |
| Success | Green | Green |

**Motor-Specific Colors (LED3):**
| Motor | Color |
|-------|-------|
| X-axis | Magenta |
| Y-axis | Cyan |
| Z-axis | Purple |
| Pipette | Cyan |

### Responses

All commands return JSON responses:

**Success:**
```json
{"status": "ok", "message": "Steps completed"}
```

**Error:**
```json
{"status": "error", "message": "Invalid motor_id"}
```

## Python Integration

Use the `stepper_control_arduino.py` module in the parent directory:

```python
from stepper_control_arduino import StepperController, Direction

# Auto-detect Arduino port
controller = StepperController()

# Check limit switch states
limits = controller.get_limit_states()
print(f"Limit states: {limits}")

# Home all motors (moves until limit switches trigger)
controller.home_all()

# Move motor 1 forward 100 steps (stops if limit triggered)
result = controller.move_motor(1, 100, Direction.CLOCKWISE, delay=0.001)
print(f"Steps executed: {result['steps_executed']}")
print(f"Limit triggered: {result['limit_triggered']}")

# Move without respecting limit (be careful!)
controller.move_motor(1, 100, Direction.CLOCKWISE, respect_limit=False)

# Home a single motor
controller.home_motor(2, Direction.COUNTERCLOCKWISE)

# Cleanup
controller.cleanup()
```

## Troubleshooting

1. **Arduino not detected**: Check USB connection, ensure correct drivers installed
2. **Motors not moving**: Verify driver power supply, check wiring
3. **Erratic movement**: Reduce speed (increase delay_us), check driver microstepping
4. **JSON parse errors**: Ensure commands are properly formatted with newline terminator
5. **Limit switch not triggering**: Check wiring (NO switch between pin and GND), verify switch is working
6. **Motor doesn't home**: Increase max_steps, check limit switch direction, verify switch is at home position
