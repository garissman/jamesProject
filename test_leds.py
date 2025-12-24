#!/usr/bin/env python3
"""
LED Test Script for Arduino UNO Q Stepper Controller
Tests the LED matrix and RGB LED visual feedback system
"""

import serial
import serial.tools.list_ports
import json
import time
import sys


def find_arduino_port():
    """Auto-detect Arduino UNO Q port"""
    ports = serial.tools.list_ports.comports()
    for port in ports:
        if "usbmodem" in port.device.lower() or "Arduino" in (port.description or ""):
            return port.device
    return None


def send_command(ser, cmd_dict):
    """Send JSON command and get response"""
    cmd_str = json.dumps(cmd_dict) + "\n"
    ser.write(cmd_str.encode())
    ser.flush()

    # Wait for response
    time.sleep(0.1)
    response = ""
    while ser.in_waiting:
        response += ser.read(ser.in_waiting).decode('utf-8', errors='ignore')
        time.sleep(0.05)

    return response.strip()


def main():
    # Find Arduino port
    port = find_arduino_port()
    if not port:
        print("Arduino UNO Q not found!")
        print("Available ports:")
        for p in serial.tools.list_ports.comports():
            print(f"  {p.device}: {p.description}")
        sys.exit(1)

    print(f"Connecting to Arduino UNO Q on {port}...")

    # Connect
    ser = serial.Serial(port, 115200, timeout=2)
    time.sleep(2)  # Wait for Arduino to reset

    # Clear any startup messages
    while ser.in_waiting:
        ser.read(ser.in_waiting)

    print("Connected!\n")

    # Test menu
    tests = [
        ("1", "Full LED Test", {"cmd": "led_test", "pattern": "all"}),
        ("2", "Matrix Sweep", {"cmd": "led_test", "pattern": "matrix"}),
        ("3", "RGB Color Cycle", {"cmd": "led_test", "pattern": "rgb"}),
        ("4", "Progress Bar Demo", None),  # Special handling
        ("5", "Motor Indicators", None),  # Special handling
        ("6", "Idle State", {"cmd": "led_test", "pattern": "idle"}),
        ("7", "Moving State", {"cmd": "led_test", "pattern": "moving"}),
        ("8", "Homing Animation", {"cmd": "led_test", "pattern": "homing", "value": 0}),
        ("9", "Error Pattern", {"cmd": "led_test", "pattern": "error"}),
        ("0", "Success Pattern", {"cmd": "led_test", "pattern": "success"}),
        ("p", "Ping Test", {"cmd": "ping"}),
        ("q", "Quit", None),
    ]

    while True:
        print("\n" + "=" * 50)
        print("LED Test Menu - Arduino UNO Q")
        print("=" * 50)
        for key, name, _ in tests:
            print(f"  [{key}] {name}")
        print("=" * 50)

        choice = input("Select test: ").strip().lower()

        if choice == 'q':
            print("Goodbye!")
            break

        # Handle special cases
        if choice == '4':
            # Progress bar demo
            print("\nProgress Bar Demo:")
            for percent in range(0, 101, 10):
                cmd = {"cmd": "led_test", "pattern": "progress", "value": percent}
                response = send_command(ser, cmd)
                print(f"  {percent}% ", end="", flush=True)
                time.sleep(0.3)
            print("\nDone!")
            continue

        if choice == '5':
            # Motor indicators demo
            print("\nMotor Indicators Demo:")
            motors = ["X-axis", "Y-axis", "Z-axis", "Pipette"]
            for i, name in enumerate(motors):
                cmd = {"cmd": "led_test", "pattern": "motor", "value": i}
                response = send_command(ser, cmd)
                print(f"  Showing {name} (Motor {i+1})...")
                time.sleep(1)
            print("Done!")
            continue

        # Find and execute command
        for key, name, cmd in tests:
            if choice == key and cmd:
                print(f"\nRunning: {name}")
                response = send_command(ser, cmd)
                print(f"Response: {response}")
                break
        else:
            if choice not in ['q', '4', '5']:
                print("Invalid choice!")

    ser.close()


if __name__ == "__main__":
    main()
