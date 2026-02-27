# Pin Configuration - Arduino UNO Q Stepper Controller

## Motor Pin Assignments

| Motor | Axis/Function | Pulse Pin | Direction Pin | Limit Switch Pin |
|-------|---------------|-----------|---------------|------------------|
| 1     | X-axis        | D2        | D3            | D10              |
| 2     | Y-axis        | D4        | D5            | D11              |
| 3     | Z-axis        | D6        | D7            | D12              |
| 4     | Pipette       | D8        | D9            | D13              |

## Pin Summary

### Motor Control Pins (Output)
| Pin | Function          |
|-----|-------------------|
| D2  | Motor 1 Pulse     |
| D3  | Motor 1 Direction |
| D4  | Motor 2 Pulse     |
| D5  | Motor 2 Direction |
| D6  | Motor 3 Pulse     |
| D7  | Motor 3 Direction |
| D8  | Motor 4 Pulse     |
| D9  | Motor 4 Direction |

### Limit Switch Pins (Input with Pull-up)
| Pin | Function              |
|-----|-----------------------|
| D10 | Motor 1 Limit Switch  |
| D11 | Motor 2 Limit Switch  |
| D12 | Motor 3 Limit Switch  |
| D13 | Motor 4 Limit Switch  |

## Wiring Diagram

```
ARDUINO UNO Q                    STEPPER DRIVERS & SWITCHES
JDIGITAL HEADER
===============                  ===========================

     D2  ──────────────────────► Motor 1 (X) STEP
     D3  ──────────────────────► Motor 1 (X) DIR
     D10 ◄────────[NO Switch]─── GND  (Limit Switch 1)

     D4  ──────────────────────► Motor 2 (Y) STEP
     D5  ──────────────────────► Motor 2 (Y) DIR
     D11 ◄────────[NO Switch]─── GND  (Limit Switch 2)

     D6  ──────────────────────► Motor 3 (Z) STEP
     D7  ──────────────────────► Motor 3 (Z) DIR
     D12 ◄────────[NO Switch]─── GND  (Limit Switch 3)

     D8  ──────────────────────► Motor 4 (Pipette) STEP
     D9  ──────────────────────► Motor 4 (Pipette) DIR
     D13 ◄────────[NO Switch]─── GND  (Limit Switch 4)

     GND ──────────────────────► All Drivers GND
```

## Signal Details

### Pulse/Step Signal
- **Type:** Digital Output
- **Logic Level:** 3.3V
- **Function:** Each HIGH-to-LOW transition moves motor one step
- **Typical Delay:** 1000-2000 microseconds between pulses

### Direction Signal
- **Type:** Digital Output
- **Logic Level:** 3.3V
- **Function:** Sets rotation direction
  - HIGH (1) = Clockwise
  - LOW (0) = Counter-clockwise

### Limit Switch Signal
- **Type:** Digital Input with Internal Pull-up
- **Logic Level:** 3.3V
- **Switch Type:** Normally Open (NO)
- **Function:** Detects home/end position
  - HIGH = Switch open (not triggered)
  - LOW = Switch closed (triggered)

## Physical Layout

```
┌─────────────────────────────────────────────────┐
│                 ARDUINO UNO Q                    │
│                                                  │
│  JDIGITAL Header                                 │
│  ┌──────────────────────────────────────────┐   │
│  │ D0  D1  D2  D3  D4  D5  D6  D7           │   │
│  │          ▲   ▲   ▲   ▲   ▲   ▲           │   │
│  │          │   │   │   │   │   │           │   │
│  │         M1  M1  M2  M2  M3  M3           │   │
│  │        PLS DIR PLS DIR PLS DIR           │   │
│  └──────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────┐   │
│  │ D8  D9  D10 D11 D12 D13 D20 D21          │   │
│  │  ▲   ▲   ▲   ▲   ▲   ▲                   │   │
│  │  │   │   │   │   │   │                   │   │
│  │ M4  M4  L1  L2  L3  L4                   │   │
│  │PLS DIR LIM LIM LIM LIM                   │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  Legend:                                         │
│  M1-M4 = Motors 1-4                             │
│  PLS = Pulse, DIR = Direction                   │
│  L1-L4 = Limit Switches 1-4                     │
│  LIM = Limit Switch Input                       │
│                                                  │
└─────────────────────────────────────────────────┘
```

## Stepper Driver Connections

For DRV8825 or A4988 drivers:

```
┌────────────────────┐
│    DRV8825/A4988   │
│                    │
│  STEP ◄──────────── Arduino Pulse Pin (D2/D4/D6/D8)
│  DIR  ◄──────────── Arduino Dir Pin (D3/D5/D7/D9)
│  GND  ◄──────────── Arduino GND
│                    │
│  VMOT ◄──────────── 12-24V Power Supply +
│  GND  ◄──────────── 12-24V Power Supply -
│                    │
│  1A ──────────────► Stepper Coil A+
│  1B ──────────────► Stepper Coil A-
│  2A ──────────────► Stepper Coil B+
│  2B ──────────────► Stepper Coil B-
│                    │
└────────────────────┘
```

## Notes

1. All digital pins operate at **3.3V logic** (Arduino UNO Q MCU)
2. Most stepper drivers (DRV8825, A4988) accept 3.3V logic levels
3. Limit switches use **internal pull-up resistors** - no external resistors needed
4. Limit switches must be **Normally Open (NO)** type
5. Total pins used: **12 pins** (8 for motors + 4 for limit switches)
