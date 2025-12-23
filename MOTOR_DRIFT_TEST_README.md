# Motor Drift Test - Setup Guide

## Overview

These scripts test your X-axis stepper motor precision by running it back and forth between two limit switches, measuring how much drift/inaccuracy accumulates over time.

## Hardware Requirements

1. **X-axis Stepper Motor** connected to:
   - Pulse Pin: GPIO4
   - Direction Pin: GPIO17

2. **Limit Switches** (normally-open, connects to ground when triggered):
   - X-MIN limit switch: GPIO6
   - X-MAX limit switch: GPIO13

3. **Wiring**:
   - Connect each limit switch between its GPIO pin and GND
   - Script uses internal pull-up resistors (switch triggers when closed to GND)

## Installation

```bash
# Install required libraries
pip install RPi.GPIO matplotlib

# Or install from requirements file
pip install -r requirements.txt
```

## Configuration

Before running, adjust these parameters in `motor_drift_test.py`:

```python
# Motor Parameters (line 18-20)
STEPS_PER_MM = 200        # Adjust for your motor + lead screw
MOTOR_SPEED = 0.001       # Lower = faster, higher = slower
MAX_STEPS_SAFETY = 50000  # Safety limit

# Test Configuration (line 22-23)
TEST_CYCLES = 100         # How many back-and-forth cycles to run
```

### Calculating STEPS_PER_MM

For your setup:
- **Formula**: `STEPS_PER_MM = (motor_steps × microstepping) / lead_screw_pitch`
- **Example**: 200 steps/rev × 16 microsteps ÷ 8mm pitch = 400 steps/mm

## Running the Test

### 1. Run the drift test:

```bash
# On Raspberry Pi
python motor_drift_test.py
```

or

```bash
./motor_drift_test.py
```

**What it does:**
1. Homes the motor to MIN limit switch
2. Runs specified number of cycles:
   - Moves forward until MAX limit switch triggers
   - Pauses briefly
   - Moves backward until MIN limit switch triggers
   - Measures steps taken in each direction
3. Calculates drift (difference in forward vs backward steps)
4. Saves detailed log to JSON file

**During the test:**
- Press `Ctrl+C` to stop early (data will be saved)
- Watch the console for real-time drift measurements
- Data auto-saves every 10 cycles

### 2. Analyze the results:

```bash
# Analyze with automatic chart generation
python analyze_drift_data.py motor_drift_log_YYYYMMDD_HHMMSS.json

# Or without file argument to see list of available logs
python analyze_drift_data.py

# Text analysis only (no charts)
python analyze_drift_data.py --no-charts motor_drift_log_YYYYMMDD_HHMMSS.json
```

**Analysis includes:**
- Cycle-by-cycle drift measurements
- Statistical summary (average, min, max, standard deviation)
- Drift trend analysis (is it getting worse over time?)
- Recommendations based on drift levels
- **Visual charts** (automatically generated as PNG file):
  - Drift over time (line chart)
  - Forward vs backward step comparison
  - Step difference bar chart
  - Drift distribution histogram
  - Timing analysis

## Understanding the Results

### Drift Levels

- **< 0.2mm**: Excellent - motor is very precise
- **0.2 - 0.5mm**: Moderate - acceptable for most applications
- **> 0.5mm**: High - investigate mechanical issues

### Common Causes of Drift

1. **Mechanical backlash**: Play in couplings, lead screw nuts, or bearings
2. **Lost steps**: Motor current too low, speed too high
3. **Thermal expansion**: Temperature changes during long tests
4. **Limit switch bounce**: Unreliable switch triggering
5. **Belt/lead screw slippage**: Insufficient tension

## Troubleshooting

### Motor doesn't move
- Check GPIO pin connections
- Verify motor driver is powered
- Ensure motor driver enable pin is active

### Hits safety limit before reaching switch
- Increase `MAX_STEPS_SAFETY` value
- Check limit switch wiring
- Verify switch is properly positioned

### High drift measurements
- Tighten mechanical components
- Increase motor current on driver
- Reduce `MOTOR_SPEED` (increase delay)
- Check for binding in linear motion

### Inconsistent drift
- Check limit switch mounting (vibration/movement)
- Verify power supply stability
- Look for temperature-related expansion

## Log File Format

JSON format with structure:
```json
{
  "start_time": "ISO timestamp",
  "motor": "X-axis",
  "cycles": [
    {
      "cycle_number": 1,
      "forward_steps": 5000,
      "backward_steps": 4998,
      "step_difference": 2,
      "drift_mm": 0.010,
      "total_cycle_time": 45.2
    }
  ],
  "config": { ... }
}
```

## Safety Notes

- ⚠️ Ensure proper limit switch installation before running
- ⚠️ Clear the X-axis travel path of obstructions
- ⚠️ Stay near the emergency stop during testing
- ⚠️ Monitor first few cycles to ensure proper operation

## Customization

### Test different motor:
1. Update `PULSE_PIN` and `DIR_PIN` in script
2. Update `LIMIT_MIN_PIN` and `LIMIT_MAX_PIN` for that axis
3. Adjust `STEPS_PER_MM` for that motor/axis

### Change GPIO pins:
Simply edit the pin definitions at the top of `motor_drift_test.py`

### Run longer tests:
Increase `TEST_CYCLES` value (recommended: run overnight tests with 1000+ cycles)

## Generated Charts

The analysis script automatically creates a comprehensive visualization saved as `motor_drift_log_YYYYMMDD_HHMMSS_charts.png` containing:

### Chart 1: Drift Over Time (Top, Full Width)
- **Red line**: Drift measurement for each cycle
- **Blue dashed line**: Average drift across all cycles
- **Use**: Identify if drift is increasing, decreasing, or stable over time

### Chart 2: Forward vs Backward Steps (Middle Left)
- **Green line**: Steps taken moving forward to MAX limit
- **Purple line**: Steps taken moving backward to MIN limit
- **Use**: Detect systematic differences in forward vs backward travel

### Chart 3: Step Difference Bar Chart (Middle Right)
- **Blue bars**: Cycles with below-average difference
- **Red bars**: Cycles with above-average difference
- **Use**: Spot individual cycles with unusual drift

### Chart 4: Drift Distribution Histogram (Bottom Left)
- **Blue bars**: Frequency distribution of drift measurements
- **Red dashed line**: Mean drift value
- **Use**: Understand if drift is normally distributed or has outliers

### Chart 5: Timing Analysis (Bottom Right)
- **Orange line**: Time taken for each cycle (left y-axis)
- **Teal dashed line**: Cumulative test time (right y-axis)
- **Use**: Detect if motor is slowing down or timing is consistent

The chart file is saved in the same directory as the log file with `_charts.png` suffix.

## Example Output

```
================================================================================
Cycle 50/100
  Moving forward to MAX... Done! (5043 steps, 22.31s)
  Moving backward to MIN... Done! (5041 steps, 22.28s)
  → Forward: 5043 steps, Backward: 5041 steps
  → Drift: 2 steps (0.010 mm)
  → Cycle time: 45.12s

STATISTICAL SUMMARY
================================================================================
Average drift:   0.012 mm
Maximum drift:   0.025 mm (cycle 37)
Std deviation:   0.008 mm

✓ LOW DRIFT - Motor performing well
✓ CONSISTENT PERFORMANCE - Low variability
```

## Next Steps

After running tests:
1. Review drift trends - is it stable or degrading?
2. Compare before/after maintenance or adjustments
3. Establish baseline performance for your system
4. Schedule regular drift tests to monitor wear over time
