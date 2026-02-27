import { useState } from 'react'

export default function ManualTab({
  axisPositions,
  isExecuting,
  selectedWell,
  systemStatus,
  handleAxisMove,
  handleSetPosition,
  fetchCurrentPosition,
  fetchAxisPositions,
}) {
  const [axisStepInputs, setAxisStepInputs] = useState({ x: 100, y: 100, z: 100, pipette: 100 })
  const [positionEditMode, setPositionEditMode] = useState(false)
  const [positionInputs, setPositionInputs] = useState({ x: '0', y: '0', z: '0', pipette_ml: '0' })

  const handleEnterPositionEdit = () => {
    setPositionInputs({
      x: String(axisPositions.x),
      y: String(axisPositions.y),
      z: String(axisPositions.z),
      pipette_ml: String(axisPositions.pipette_ml),
    })
    setPositionEditMode(true)
  }

  const onApplyPosition = () => {
    handleSetPosition(
      parseFloat(positionInputs.x),
      parseFloat(positionInputs.y),
      parseFloat(positionInputs.z),
      parseFloat(positionInputs.pipette_ml)
    )
    setPositionEditMode(false)
  }

  const axes = [
    { key: 'x', label: 'X-Axis', unit: 'mm', value: axisPositions.x },
    { key: 'y', label: 'Y-Axis', unit: 'mm', value: axisPositions.y },
    { key: 'z', label: 'Z-Axis', unit: 'mm', value: axisPositions.z },
    { key: 'pipette', label: 'Pipette', unit: 'mL', value: axisPositions.pipette_ml },
  ]

  return (
    <div className="flex-1 bg-[var(--bg-secondary)] rounded-[15px] p-[30px] max-w-full">
      <h2 className="m-0 mb-2.5 text-[1.6rem] font-semibold text-[var(--text-primary)]">
        Manual Axis Control
      </h2>
      <p className="text-[var(--text-tertiary)] mb-[25px] text-[0.95rem]">
        Manually move individual axes using step controls. Use with caution.
      </p>

      {/* Axis Controls Grid */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-5 mb-[25px]">
        {axes.map(({ key, label, unit, value }) => (
          <div
            key={key}
            className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl p-5 transition-all duration-300 hover:border-[var(--border-hover)] hover:shadow-md"
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-[15px] pb-2.5 border-b border-[var(--border-color)]">
              <h3 className="m-0 text-[1.2rem] font-semibold text-[var(--text-primary)]">
                {label}
              </h3>
              <span className="font-mono text-base font-semibold text-[var(--text-secondary)] bg-[var(--bg-overlay)] px-2.5 py-1 rounded-md">
                {value} {unit}
              </span>
            </div>

            {/* Step Input */}
            <div className="flex items-center gap-2.5 mb-[15px]">
              <label className="text-[0.95rem] font-semibold text-[var(--text-secondary)]">
                Steps:
              </label>
              <input
                type="number"
                min="1"
                max="10000"
                value={axisStepInputs[key]}
                onChange={(e) =>
                  setAxisStepInputs((prev) => ({
                    ...prev,
                    [key]: parseInt(e.target.value) || 1,
                  }))
                }
                className="flex-1 py-2.5 px-3.5 text-[1.1rem] font-semibold text-center border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[#3b82f6] focus:bg-[var(--input-focus-bg)] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isExecuting}
              />
            </div>

            {/* Axis Buttons */}
            <div className="flex gap-2.5 justify-center">
              <button
                className="flex-1 py-3.5 px-5 text-[1.1rem] font-bold border-none rounded-lg cursor-pointer transition-all duration-200 min-w-[100px] bg-gradient-to-br from-[#f59e0b] to-[#d97706] text-white hover:enabled:-translate-y-0.5 hover:enabled:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => handleAxisMove(key, axisStepInputs[key], 'ccw')}
                disabled={isExecuting}
              >
                - {axisStepInputs[key]}
              </button>
              <button
                className="flex-1 py-3.5 px-5 text-[1.1rem] font-bold border-none rounded-lg cursor-pointer transition-all duration-200 min-w-[100px] bg-gradient-to-br from-[#10b981] to-[#059669] text-white hover:enabled:-translate-y-0.5 hover:enabled:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => handleAxisMove(key, axisStepInputs[key], 'cw')}
                disabled={isExecuting}
              >
                + {axisStepInputs[key]}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Set Position Section */}
      <div className="mt-5">
        {!positionEditMode ? (
          <button
            className="w-full p-3 bg-[var(--bg-tertiary)] text-[var(--text-primary)] border-2 border-dashed border-[var(--border-color)] rounded-[10px] text-[0.95rem] cursor-pointer transition-all duration-200 hover:border-[#4A90D9] hover:bg-[rgba(74,144,217,0.08)]"
            onClick={handleEnterPositionEdit}
            disabled={isExecuting}
          >
            Set Current Position
          </button>
        ) : (
          <div className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-[10px] p-5">
            <h3 className="m-0 mb-1 text-base">Set Current Position (mm)</h3>
            <p className="m-0 mb-[15px] text-[0.82rem] text-[var(--text-secondary)]">
              Override the tracked position without moving motors.
            </p>
            <div className="flex gap-[15px] mb-[15px]">
              <label className="flex items-center gap-1.5 font-semibold text-[0.9rem]">
                X:
                <input
                  type="number"
                  step="0.1"
                  value={positionInputs.x}
                  onChange={(e) =>
                    setPositionInputs((prev) => ({ ...prev, x: e.target.value }))
                  }
                  className="w-[100px] py-2.5 px-3.5 text-[1.1rem] font-semibold text-center border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[#3b82f6] focus:bg-[var(--input-focus-bg)] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]"
                />
              </label>
              <label className="flex items-center gap-1.5 font-semibold text-[0.9rem]">
                Y:
                <input
                  type="number"
                  step="0.1"
                  value={positionInputs.y}
                  onChange={(e) =>
                    setPositionInputs((prev) => ({ ...prev, y: e.target.value }))
                  }
                  className="w-[100px] py-2.5 px-3.5 text-[1.1rem] font-semibold text-center border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[#3b82f6] focus:bg-[var(--input-focus-bg)] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]"
                />
              </label>
              <label className="flex items-center gap-1.5 font-semibold text-[0.9rem]">
                Z:
                <input
                  type="number"
                  step="0.1"
                  value={positionInputs.z}
                  onChange={(e) =>
                    setPositionInputs((prev) => ({ ...prev, z: e.target.value }))
                  }
                  className="w-[100px] py-2.5 px-3.5 text-[1.1rem] font-semibold text-center border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[#3b82f6] focus:bg-[var(--input-focus-bg)] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]"
                />
              </label>
              <label className="flex items-center gap-1.5 font-semibold text-[0.9rem]">
                Pipette (mL):
                <input
                  type="number"
                  step="0.01"
                  value={positionInputs.pipette_ml}
                  onChange={(e) =>
                    setPositionInputs((prev) => ({ ...prev, pipette_ml: e.target.value }))
                  }
                  className="w-[100px] py-2.5 px-3.5 text-[1.1rem] font-semibold text-center border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 focus:outline-none focus:border-[#3b82f6] focus:bg-[var(--input-focus-bg)] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]"
                />
              </label>
            </div>
            <div className="flex gap-2.5">
              <button
                className="py-2 px-5 bg-[#059669] text-white border-none rounded-lg cursor-pointer hover:bg-[#047857]"
                onClick={onApplyPosition}
              >
                Apply
              </button>
              <button
                className="py-2 px-5 bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-lg cursor-pointer hover:bg-[var(--bg-tertiary)]"
                onClick={() => setPositionEditMode(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Manual Info */}
      <div className="bg-[var(--bg-tertiary)] rounded-[10px] py-[15px] px-5 flex gap-[30px] flex-wrap mt-5">
        <p className="m-0 text-[0.95rem] text-[var(--text-secondary)]">
          Current Well: {selectedWell || 'Unknown'}
        </p>
        <p className="m-0 text-[0.95rem] text-[var(--text-secondary)]">
          Status: {systemStatus}
        </p>
      </div>
    </div>
  )
}
