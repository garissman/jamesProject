#!/usr/bin/env python3
"""
Motor Drift Data Analysis Script
Analyzes JSON log files from motor_drift_test.py
Generates visual charts of drift data
"""

import json
import sys
from datetime import datetime
import os

try:
    import matplotlib
    matplotlib.use('Agg')  # Use non-interactive backend
    import matplotlib.pyplot as plt
    from matplotlib.gridspec import GridSpec
    MATPLOTLIB_AVAILABLE = True
except ImportError:
    MATPLOTLIB_AVAILABLE = False
    print("⚠ Warning: matplotlib not installed. Charts will not be generated.")
    print("  Install with: pip install matplotlib")


def generate_charts(data, log_file):
    """Generate visualization charts for drift data"""

    if not MATPLOTLIB_AVAILABLE:
        print("\n⚠ Skipping chart generation (matplotlib not installed)")
        return None

    cycles = data.get('cycles', [])
    if not cycles:
        print("\n⚠ No data to chart")
        return None

    # Extract data for plotting
    cycle_numbers = [c['cycle_number'] for c in cycles]
    forward_steps = [c['forward_steps'] for c in cycles]
    backward_steps = [c['backward_steps'] for c in cycles]
    drifts_mm = [c['drift_mm'] for c in cycles]
    step_differences = [c['step_difference'] for c in cycles]
    cycle_times = [c['total_cycle_time'] for c in cycles]

    # Calculate cumulative time
    cumulative_time = []
    total = 0
    for t in cycle_times:
        total += t
        cumulative_time.append(total / 60)  # Convert to minutes

    # Create figure with subplots
    fig = plt.figure(figsize=(16, 10))
    gs = GridSpec(3, 2, figure=fig, hspace=0.3, wspace=0.3)

    # Set style
    plt.style.use('seaborn-v0_8-darkgrid')

    # Chart 1: Drift over cycles
    ax1 = fig.add_subplot(gs[0, :])
    ax1.plot(cycle_numbers, drifts_mm, linewidth=2, color='#e74c3c', marker='o',
             markersize=4, markevery=max(1, len(cycle_numbers)//20))
    ax1.axhline(y=sum(drifts_mm)/len(drifts_mm), color='#3498db', linestyle='--',
                linewidth=2, label=f'Average: {sum(drifts_mm)/len(drifts_mm):.3f} mm')
    ax1.set_xlabel('Cycle Number', fontsize=12, fontweight='bold')
    ax1.set_ylabel('Drift (mm)', fontsize=12, fontweight='bold')
    ax1.set_title('Motor Drift Over Time', fontsize=14, fontweight='bold', pad=15)
    ax1.legend(loc='best', fontsize=10)
    ax1.grid(True, alpha=0.3)

    # Chart 2: Forward vs Backward Steps
    ax2 = fig.add_subplot(gs[1, 0])
    ax2.plot(cycle_numbers, forward_steps, linewidth=2, color='#2ecc71',
             label='Forward Steps', alpha=0.8)
    ax2.plot(cycle_numbers, backward_steps, linewidth=2, color='#9b59b6',
             label='Backward Steps', alpha=0.8)
    ax2.set_xlabel('Cycle Number', fontsize=11, fontweight='bold')
    ax2.set_ylabel('Steps', fontsize=11, fontweight='bold')
    ax2.set_title('Forward vs Backward Step Count', fontsize=12, fontweight='bold')
    ax2.legend(loc='best', fontsize=9)
    ax2.grid(True, alpha=0.3)

    # Chart 3: Step Difference
    ax3 = fig.add_subplot(gs[1, 1])
    colors = ['#e74c3c' if abs(d) > sum(step_differences)/len(step_differences)
              else '#3498db' for d in step_differences]
    ax3.bar(cycle_numbers, step_differences, color=colors, alpha=0.7, width=0.8)
    ax3.axhline(y=0, color='black', linestyle='-', linewidth=1)
    ax3.set_xlabel('Cycle Number', fontsize=11, fontweight='bold')
    ax3.set_ylabel('Step Difference', fontsize=11, fontweight='bold')
    ax3.set_title('Step Count Difference (Forward - Backward)', fontsize=12, fontweight='bold')
    ax3.grid(True, alpha=0.3, axis='y')

    # Chart 4: Drift Distribution (Histogram)
    ax4 = fig.add_subplot(gs[2, 0])
    n, bins, patches = ax4.hist(drifts_mm, bins=min(20, len(cycles)//5 + 1),
                                 color='#3498db', alpha=0.7, edgecolor='black')
    ax4.axvline(x=sum(drifts_mm)/len(drifts_mm), color='#e74c3c', linestyle='--',
                linewidth=2, label=f'Mean: {sum(drifts_mm)/len(drifts_mm):.3f} mm')
    ax4.set_xlabel('Drift (mm)', fontsize=11, fontweight='bold')
    ax4.set_ylabel('Frequency', fontsize=11, fontweight='bold')
    ax4.set_title('Drift Distribution', fontsize=12, fontweight='bold')
    ax4.legend(loc='best', fontsize=9)
    ax4.grid(True, alpha=0.3, axis='y')

    # Chart 5: Cycle Time vs Cumulative Time
    ax5 = fig.add_subplot(gs[2, 1])
    ax5_twin = ax5.twinx()

    line1 = ax5.plot(cycle_numbers, cycle_times, linewidth=2, color='#f39c12',
                     label='Cycle Time', marker='o', markersize=3,
                     markevery=max(1, len(cycle_numbers)//20))
    line2 = ax5_twin.plot(cycle_numbers, cumulative_time, linewidth=2, color='#16a085',
                          label='Cumulative Time', linestyle='--')

    ax5.set_xlabel('Cycle Number', fontsize=11, fontweight='bold')
    ax5.set_ylabel('Cycle Time (seconds)', fontsize=11, fontweight='bold', color='#f39c12')
    ax5_twin.set_ylabel('Cumulative Time (minutes)', fontsize=11, fontweight='bold', color='#16a085')
    ax5.set_title('Timing Analysis', fontsize=12, fontweight='bold')
    ax5.tick_params(axis='y', labelcolor='#f39c12')
    ax5_twin.tick_params(axis='y', labelcolor='#16a085')

    # Combine legends
    lines = line1 + line2
    labels = [l.get_label() for l in lines]
    ax5.legend(lines, labels, loc='best', fontsize=9)
    ax5.grid(True, alpha=0.3)

    # Add overall title
    motor_name = data.get('motor', 'Motor')
    start_time = data.get('start_time', '')
    if start_time:
        start_time = datetime.fromisoformat(start_time).strftime('%Y-%m-%d %H:%M')

    fig.suptitle(f'{motor_name} Drift Test Analysis - {start_time}',
                 fontsize=16, fontweight='bold', y=0.995)

    # Save figure
    base_name = os.path.splitext(log_file)[0]
    chart_file = f"{base_name}_charts.png"
    plt.savefig(chart_file, dpi=150, bbox_inches='tight')
    plt.close()

    return chart_file


def analyze_drift_log(log_file, generate_charts_flag=True):
    """Analyze drift test log file and print detailed statistics"""

    try:
        with open(log_file, 'r') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"❌ Error: File '{log_file}' not found")
        return None
    except json.JSONDecodeError:
        print(f"❌ Error: Invalid JSON in '{log_file}'")
        return None

    print("\n" + "="*70)
    print("MOTOR DRIFT TEST ANALYSIS")
    print("="*70)

    # Test metadata
    print(f"\nTest Information:")
    print(f"  Motor: {data.get('motor', 'Unknown')}")
    print(f"  Start time: {data.get('start_time', 'Unknown')}")
    print(f"  End time: {data.get('end_time', 'Not completed')}")

    if 'config' in data:
        config = data['config']
        print(f"\nConfiguration:")
        print(f"  Pulse pin: GPIO{config.get('pulse_pin')}")
        print(f"  Direction pin: GPIO{config.get('dir_pin')}")
        print(f"  Limit switches: GPIO{config.get('limit_min_pin')} (MIN) / GPIO{config.get('limit_max_pin')} (MAX)")
        print(f"  Steps per mm: {config.get('steps_per_mm')}")

    cycles = data.get('cycles', [])

    if not cycles:
        print("\n⚠ No cycle data found in log file")
        return None

    print(f"\n{'='*70}")
    print(f"CYCLE-BY-CYCLE ANALYSIS ({len(cycles)} cycles)")
    print(f"{'='*70}")

    # Print header
    print(f"\n{'Cycle':<6} {'Fwd Steps':<12} {'Back Steps':<12} {'Diff':<8} {'Drift(mm)':<10} {'Time(s)':<10}")
    print("-" * 70)

    # Collect statistics
    forward_steps = []
    backward_steps = []
    drifts_mm = []
    cycle_times = []

    for cycle in cycles:
        cycle_num = cycle.get('cycle_number', 0)
        fwd = cycle.get('forward_steps', 0)
        back = cycle.get('backward_steps', 0)
        diff = cycle.get('step_difference', 0)
        drift = cycle.get('drift_mm', 0)
        total_time = cycle.get('total_cycle_time', 0)

        forward_steps.append(fwd)
        backward_steps.append(back)
        drifts_mm.append(drift)
        cycle_times.append(total_time)

        # Print cycle data
        print(f"{cycle_num:<6} {fwd:<12} {back:<12} {diff:<8} {drift:<10.3f} {total_time:<10.2f}")

    # Statistical analysis
    print(f"\n{'='*70}")
    print("STATISTICAL SUMMARY")
    print(f"{'='*70}")

    avg_fwd = sum(forward_steps) / len(forward_steps)
    avg_back = sum(backward_steps) / len(backward_steps)
    avg_drift = sum(drifts_mm) / len(drifts_mm)
    avg_cycle_time = sum(cycle_times) / len(cycle_times)

    max_drift = max(drifts_mm)
    min_drift = min(drifts_mm)

    # Find which cycle had max drift
    max_drift_cycle = cycles[drifts_mm.index(max_drift)]['cycle_number']

    # Calculate variance and standard deviation for drift
    variance = sum((d - avg_drift) ** 2 for d in drifts_mm) / len(drifts_mm)
    std_dev = variance ** 0.5

    print(f"\nStep Counts:")
    print(f"  Average forward steps:  {avg_fwd:.1f}")
    print(f"  Average backward steps: {avg_back:.1f}")
    print(f"  Average difference:     {abs(avg_fwd - avg_back):.1f} steps")

    print(f"\nDrift Measurements:")
    print(f"  Average drift:   {avg_drift:.3f} mm")
    print(f"  Minimum drift:   {min_drift:.3f} mm")
    print(f"  Maximum drift:   {max_drift:.3f} mm (cycle {max_drift_cycle})")
    print(f"  Std deviation:   {std_dev:.3f} mm")
    print(f"  Drift range:     {max_drift - min_drift:.3f} mm")

    print(f"\nTiming:")
    print(f"  Average cycle time: {avg_cycle_time:.2f} seconds")
    print(f"  Total test time:    {sum(cycle_times):.2f} seconds ({sum(cycle_times)/60:.1f} minutes)")

    # Drift trend analysis
    print(f"\nDrift Trend Analysis:")
    if len(cycles) >= 10:
        first_10_avg = sum(drifts_mm[:10]) / 10
        last_10_avg = sum(drifts_mm[-10:]) / 10
        trend_change = last_10_avg - first_10_avg

        print(f"  First 10 cycles average: {first_10_avg:.3f} mm")
        print(f"  Last 10 cycles average:  {last_10_avg:.3f} mm")
        print(f"  Trend change:            {trend_change:+.3f} mm", end="")

        if abs(trend_change) < 0.01:
            print(" (stable)")
        elif trend_change > 0:
            print(" (increasing drift over time)")
        else:
            print(" (decreasing drift over time)")
    else:
        print("  Insufficient data for trend analysis (need 10+ cycles)")

    # Recommendations
    print(f"\n{'='*70}")
    print("RECOMMENDATIONS")
    print(f"{'='*70}")

    if max_drift > 0.5:
        print("⚠ HIGH DRIFT DETECTED:")
        print("  - Check for mechanical backlash in lead screw or couplings")
        print("  - Verify motor current settings")
        print("  - Inspect for loose components")
    elif max_drift > 0.2:
        print("⚠ MODERATE DRIFT:")
        print("  - Consider calibrating steps per mm")
        print("  - Check belt/lead screw tension")
    else:
        print("✓ LOW DRIFT - Motor performing well")

    if std_dev > 0.1:
        print("\n⚠ HIGH VARIABILITY:")
        print("  - Drift is inconsistent between cycles")
        print("  - Check for environmental factors (temperature, vibration)")
        print("  - Verify limit switch reliability")
    else:
        print("\n✓ CONSISTENT PERFORMANCE - Low variability")

    print(f"\n{'='*70}\n")

    # Generate charts
    if generate_charts_flag and MATPLOTLIB_AVAILABLE:
        print("Generating visualization charts...")
        chart_file = generate_charts(data, log_file)
        if chart_file:
            print(f"✓ Charts saved to: {chart_file}\n")
    elif generate_charts_flag:
        print("\n💡 Tip: Install matplotlib to generate visualization charts:")
        print("   pip install matplotlib\n")

    return data


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description='Analyze motor drift test data and generate charts',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python analyze_drift_data.py motor_drift_log_20250119_143022.json
  python analyze_drift_data.py --no-charts motor_drift_log_20250119_143022.json
        """
    )

    parser.add_argument('log_file', nargs='?', help='JSON log file from motor_drift_test.py')
    parser.add_argument('--no-charts', action='store_true',
                        help='Skip chart generation (text analysis only)')

    args = parser.parse_args()

    # If no file specified, show usage and list available files
    if not args.log_file:
        parser.print_help()

        # Try to find recent log files
        import glob
        log_files = sorted(glob.glob("motor_drift_log_*.json"), reverse=True)

        if log_files:
            print(f"\n{'='*70}")
            print(f"Found {len(log_files)} log file(s) in current directory:")
            print(f"{'='*70}")
            for i, log in enumerate(log_files[:10], 1):
                # Get file modification time
                import time
                mtime = os.path.getmtime(log)
                time_str = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(mtime))
                print(f"  {i:2d}. {log:<50} ({time_str})")

            if len(log_files) > 10:
                print(f"  ... and {len(log_files) - 10} more")

        sys.exit(1)

    # Run analysis
    generate_charts_flag = not args.no_charts
    analyze_drift_log(args.log_file, generate_charts_flag)


if __name__ == "__main__":
    main()
