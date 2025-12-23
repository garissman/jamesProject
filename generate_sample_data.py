#!/usr/bin/env python3
"""
Generate Sample Motor Drift Data
Creates a sample JSON log file for testing the analysis script without hardware
"""

import json
import random
from datetime import datetime, timedelta


def generate_sample_data(num_cycles=50, base_steps=5000, drift_level="low"):
    """
    Generate sample motor drift test data

    Args:
        num_cycles: Number of test cycles to generate
        base_steps: Average steps for forward travel
        drift_level: "low", "medium", or "high" drift simulation
    """

    # Set drift parameters based on level
    drift_params = {
        "low": {"std_dev": 5, "trend": 0.01},
        "medium": {"std_dev": 20, "trend": 0.05},
        "high": {"std_dev": 50, "trend": 0.1}
    }

    params = drift_params.get(drift_level, drift_params["low"])

    # Initialize data structure
    start_time = datetime.now()
    data = {
        "start_time": start_time.isoformat(),
        "motor": "X-axis (SAMPLE DATA)",
        "cycles": [],
        "config": {
            "pulse_pin": 4,
            "dir_pin": 17,
            "limit_min_pin": 6,
            "limit_max_pin": 13,
            "steps_per_mm": 200
        }
    }

    current_time = start_time

    for cycle_num in range(1, num_cycles + 1):
        # Simulate drift with slight trend over time
        trend_factor = 1 + (cycle_num / num_cycles) * params["trend"]

        # Forward steps (base + some variation)
        fwd_steps = int(base_steps + random.gauss(0, params["std_dev"]) * trend_factor)

        # Backward steps (should be similar but with drift)
        back_steps = int(base_steps + random.gauss(0, params["std_dev"]) * trend_factor)

        # Calculate metrics
        step_diff = abs(fwd_steps - back_steps)
        drift_mm = step_diff / data["config"]["steps_per_mm"]

        # Simulate timing (with slight variation)
        fwd_time = (fwd_steps / base_steps) * 20 + random.uniform(-1, 1)
        back_time = (back_steps / base_steps) * 20 + random.uniform(-1, 1)
        total_time = fwd_time + back_time + 1  # +1 for pause

        # Create cycle data
        cycle_data = {
            "cycle_number": cycle_num,
            "timestamp": current_time.isoformat(),
            "forward_steps": fwd_steps,
            "forward_time": round(fwd_time, 2),
            "backward_steps": back_steps,
            "backward_time": round(back_time, 2),
            "total_cycle_time": round(total_time, 2),
            "step_difference": step_diff,
            "drift_mm": round(drift_mm, 3)
        }

        data["cycles"].append(cycle_data)
        current_time += timedelta(seconds=total_time)

    # Set end time
    data["end_time"] = current_time.isoformat()

    return data


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description='Generate sample motor drift test data for testing analysis script'
    )

    parser.add_argument('-c', '--cycles', type=int, default=50,
                        help='Number of cycles to generate (default: 50)')
    parser.add_argument('-d', '--drift', choices=['low', 'medium', 'high'],
                        default='low', help='Drift level to simulate (default: low)')
    parser.add_argument('-o', '--output', type=str,
                        help='Output file name (default: auto-generated)')

    args = parser.parse_args()

    # Generate data
    print(f"Generating sample data:")
    print(f"  Cycles: {args.cycles}")
    print(f"  Drift level: {args.drift}")

    data = generate_sample_data(num_cycles=args.cycles, drift_level=args.drift)

    # Determine output filename
    if args.output:
        output_file = args.output
    else:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_file = f"motor_drift_log_{timestamp}_SAMPLE.json"

    # Save to file
    with open(output_file, 'w') as f:
        json.dump(data, f, indent=2)

    print(f"\n✓ Sample data saved to: {output_file}")
    print(f"\nTo analyze this data, run:")
    print(f"  python analyze_drift_data.py {output_file}")

    # Print quick summary
    drifts = [c['drift_mm'] for c in data['cycles']]
    avg_drift = sum(drifts) / len(drifts)
    max_drift = max(drifts)

    print(f"\nGenerated data summary:")
    print(f"  Average drift: {avg_drift:.3f} mm")
    print(f"  Maximum drift: {max_drift:.3f} mm")


if __name__ == "__main__":
    main()
