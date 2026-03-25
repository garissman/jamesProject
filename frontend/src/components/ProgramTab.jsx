import { useState, useRef, useEffect } from 'react'

const inputClass = 'p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]'
const selectClass = inputClass + ' cursor-pointer'

// ─── StepCard ────────────────────────────────────────────────────────────────

function StepCard({ step, index, isActive, onEdit, onDuplicate, onDelete, onDragStart, onDragOver, onDrop }) {
  const stepType = step.stepType || 'pipette'

  const fmtTime = (s) => {
    const n = Number(s)
    if (!n || isNaN(n)) return '?'
    if (n >= 3600) { const v = n / 3600; return `${Number.isInteger(v) ? v : v.toFixed(1)} hr` }
    if (n >= 60) { const v = n / 60; return `${Number.isInteger(v) ? v : v.toFixed(1)} min` }
    return `${n} sec`
  }

  let title, details
  if (stepType === 'home') {
    title = 'Go Home'
    details = step.waitTime ? `Wait: ${step.waitTime}s after` : null
  } else if (stepType === 'wait') {
    title = `Wait ${step.waitTime ? fmtTime(step.waitTime) : '0s'}`
    details = null
  } else {
    const pickup = step.pickupWell || '—'
    const dropoff = step.dropoffWell || '—'
    title = `${pickup} \u2192 ${dropoff}`
    const wash = step.washWell ? `Wash: ${step.washWell}` : null
    const rinse = step.rinseWell ? `Rinse: ${step.rinseWell}` : null
    const volume = step.sampleVolume ? `${step.sampleVolume} µL` : null
    const wait = step.waitTime ? `Wait: ${step.waitTime}s` : null
    const cycles = step.cycles > 1 ? `${step.cycles} cycles` : null

    let repInfo = null
    if (step.repetitionMode === 'quantity' && step.repetitionQuantity > 1) {
      repInfo = `x${step.repetitionQuantity}`
    } else if (step.repetitionMode === 'timeFrequency' && step.repetitionInterval) {
      repInfo = `every ${fmtTime(step.repetitionInterval)} / ${fmtTime(step.repetitionDuration)}`
    }

    details = [volume, wash, rinse, wait, cycles, repInfo].filter(Boolean).join(' | ')
  }

  const badgeColor = stepType === 'home' ? '#059669' : stepType === 'wait' ? '#f59e0b' : '#3b82f6'

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
      onDrop={(e) => { e.preventDefault(); onDrop() }}
      className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-200 cursor-grab active:cursor-grabbing ${
        isActive
          ? 'bg-[rgba(245,158,11,0.12)] border-2 border-[#f59e0b] animate-step-active'
          : 'bg-[var(--bg-tertiary)] border border-[var(--border-color)] hover:border-[var(--border-hover)]'
      }`}
    >
      {/* Drag handle */}
      <div className="flex flex-col gap-[3px] opacity-40 select-none px-1">
        <div className="flex gap-[3px]">
          <span className="w-[4px] h-[4px] rounded-full bg-[var(--text-tertiary)]" />
          <span className="w-[4px] h-[4px] rounded-full bg-[var(--text-tertiary)]" />
        </div>
        <div className="flex gap-[3px]">
          <span className="w-[4px] h-[4px] rounded-full bg-[var(--text-tertiary)]" />
          <span className="w-[4px] h-[4px] rounded-full bg-[var(--text-tertiary)]" />
        </div>
        <div className="flex gap-[3px]">
          <span className="w-[4px] h-[4px] rounded-full bg-[var(--text-tertiary)]" />
          <span className="w-[4px] h-[4px] rounded-full bg-[var(--text-tertiary)]" />
        </div>
      </div>

      {/* Badges */}
      <div className="flex flex-col items-center gap-1 min-w-[36px]">
        <span className="text-xs font-bold text-white rounded-full w-6 h-6 flex items-center justify-center" style={{ backgroundColor: badgeColor }}>
          {index + 1}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-[var(--text-primary)] truncate">
          {title}
        </div>
        {details && (
          <div className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
            {details}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-1 shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit() }}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm hover:bg-[var(--bg-overlay)] text-[var(--text-secondary)] hover:text-[#3b82f6] transition-colors"
          title="Edit"
        >
          &#x270E;
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate() }}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm hover:bg-[var(--bg-overlay)] text-[var(--text-secondary)] hover:text-[#8b5cf6] transition-colors"
          title="Duplicate"
        >
          &#x29C9;
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm hover:bg-[var(--bg-overlay)] text-[var(--text-secondary)] hover:text-[#dc2626] transition-colors"
          title="Delete"
        >
          &#x1F5D1;
        </button>
      </div>
    </div>
  )
}

// ─── StepWizard ──────────────────────────────────────────────────────────────

function StepWizard({ initial, layoutType, onSave, onCancel, validateWellId, setActiveTab, setWellSelectionMode }) {
  const isEditing = !!initial

  const [stage, setStage] = useState(1)
  const [form, setForm] = useState({
    pickupWell: initial?.pickupWell || '',
    dropoffWell: initial?.dropoffWell || '',
    rinseWell: initial?.rinseWell || 'WS2',
    washWell: initial?.washWell || 'WS1',
    sampleVolume: initial?.sampleVolume || '40',
    pipetteCount: 3,
    cycles: initial?.cycles || 1,
    waitTime: initial?.waitTime || '',
    repetitionMode: initial?.repetitionMode || 'quantity',
    repetitionQuantity: initial?.repetitionQuantity || 1,
    repetitionInterval: initial?.repetitionInterval || '',
    repetitionDuration: initial?.repetitionDuration || '',
  })
  const [intervalUnit, setIntervalUnit] = useState('seconds')
  const [durationUnit, setDurationUnit] = useState('seconds')
  const [errors, setErrors] = useState({})

  const unitMultipliers = { seconds: 1, minutes: 60, hours: 3600, days: 86400 }

  const toSeconds = (value, unit) => {
    const num = parseFloat(value)
    if (isNaN(num)) return ''
    return Math.round(num * unitMultipliers[unit])
  }

  /* v8 ignore start -- formatSeconds is reserved for future use */
  const formatSeconds = (totalSeconds) => {
    const s = Number(totalSeconds)
    if (!s || isNaN(s)) return ''
    if (s >= 86400 && s % 86400 === 0) return `${s / 86400}d`
    if (s >= 3600 && s % 3600 === 0) return `${s / 3600}h`
    if (s >= 60 && s % 60 === 0) return `${s / 60}m`
    return `${s}s`
  }
  /* v8 ignore stop */

  const wellPlaceholder = layoutType === 'microchip' ? 'e.g., A1, WS1, MC3' : 'e.g., SA1, VA1, WS2'

  const set = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }))
    setErrors(prev => ({ ...prev, [key]: undefined }))
  }

  const handleSelectFromPlate = (field) => {
    setWellSelectionMode({
      field,
      callback: (wellId) => {
        set(field, wellId)
      }
    })
    setActiveTab('protocol')
  }

  const validateStage1 = () => {
    const newErrors = {}
    if (!form.pickupWell.trim()) {
      newErrors.pickupWell = 'Pickup well is required'
    } else if (!validateWellId(form.pickupWell)) {
      newErrors.pickupWell = 'Invalid well ID'
    }
    if (form.dropoffWell.trim() && !validateWellId(form.dropoffWell)) {
      newErrors.dropoffWell = 'Invalid well ID'
    }
    if (form.rinseWell.trim() && !validateWellId(form.rinseWell)) {
      newErrors.rinseWell = 'Invalid well ID'
    }
    if (form.washWell.trim() && !validateWellId(form.washWell)) {
      newErrors.washWell = 'Invalid well ID'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const goNext = () => {
    if (stage === 1 && !validateStage1()) return
    setStage(s => Math.min(s + 1, 2))
  }

  const goBack = () => setStage(s => Math.max(s - 1, 1))

  const handleSave = () => {
    const savedForm = { ...form }
    if (form.repetitionMode === 'timeFrequency') {
      savedForm.repetitionInterval = toSeconds(form.repetitionInterval, intervalUnit)
      savedForm.repetitionDuration = toSeconds(form.repetitionDuration, durationUnit)
    }
    onSave(savedForm)
  }

  const stages = [
    { num: 1, label: 'Wells & Volume' },
    { num: 2, label: 'Timing & Repetition' },
  ]

  return (
    <div className="flex-1 bg-[var(--bg-secondary)] rounded-[15px] p-8">
      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {stages.map((s, i) => (
          <div key={s.num} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  stage > s.num
                    ? 'bg-[#059669] text-white'
                    : stage === s.num
                    ? 'bg-[#3b82f6] text-white'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] border border-[var(--border-color)]'
                }`}
              >
                {stage > s.num ? '\u2713' : s.num}
              </div>
              <span className={`text-xs font-medium ${stage >= s.num ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'}`}>
                {s.label}
              </span>
            </div>
            {i < stages.length - 1 && (
              <div className={`w-16 h-0.5 mb-5 ${stage > s.num ? 'bg-[#059669]' : 'bg-[var(--border-color)]'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Stage 1: Wells */}
      {stage === 1 && (
        <div className="flex flex-col gap-5 max-w-[500px] mx-auto">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Select Wells</h3>

          {/* Pickup Well */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-[var(--text-primary)]">
              Pickup Well <span className="text-[#dc2626]">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={wellPlaceholder}
                value={form.pickupWell}
                onChange={(e) => set('pickupWell', e.target.value)}
                className={`${inputClass} flex-1 ${errors.pickupWell ? 'border-[#dc2626]' : ''}`}
              />
              <button
                type="button"
                onClick={() => handleSelectFromPlate('pickupWell')}
                className="px-3 py-2 text-sm font-medium rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
              >
                Select from plate
              </button>
            </div>
            {errors.pickupWell && <span className="text-xs text-[#dc2626]">{errors.pickupWell}</span>}
          </div>

          {/* Dropoff Well */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-[var(--text-primary)]">
              Dropoff Well
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={wellPlaceholder}
                value={form.dropoffWell}
                onChange={(e) => set('dropoffWell', e.target.value)}
                className={`${inputClass} flex-1 ${errors.dropoffWell ? 'border-[#dc2626]' : ''}`}
              />
              <button
                type="button"
                onClick={() => handleSelectFromPlate('dropoffWell')}
                className="px-3 py-2 text-sm font-medium rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
              >
                Select from plate
              </button>
            </div>
            {errors.dropoffWell && <span className="text-xs text-[#dc2626]">{errors.dropoffWell}</span>}
          </div>

          {/* Wash Well */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-[var(--text-primary)]">
              Wash Well <span className="text-xs text-[var(--text-tertiary)] font-normal">(optional)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={wellPlaceholder}
                value={form.washWell}
                onChange={(e) => set('washWell', e.target.value)}
                className={`${inputClass} flex-1 ${errors.washWell ? 'border-[#dc2626]' : ''}`}
              />
              <button
                type="button"
                onClick={() => handleSelectFromPlate('washWell')}
                className="px-3 py-2 text-sm font-medium rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
              >
                Select from plate
              </button>
            </div>
            {errors.washWell && <span className="text-xs text-[#dc2626]">{errors.washWell}</span>}
          </div>

          {/* Rinse Well */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-[var(--text-primary)]">
              Rinse Well <span className="text-xs text-[var(--text-tertiary)] font-normal">(optional)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={wellPlaceholder}
                value={form.rinseWell}
                onChange={(e) => set('rinseWell', e.target.value)}
                className={`${inputClass} flex-1 ${errors.rinseWell ? 'border-[#dc2626]' : ''}`}
              />
              <button
                type="button"
                onClick={() => handleSelectFromPlate('rinseWell')}
                className="px-3 py-2 text-sm font-medium rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
              >
                Select from plate
              </button>
            </div>
            {errors.rinseWell && <span className="text-xs text-[#dc2626]">{errors.rinseWell}</span>}
          </div>

          {/* Volume */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-[var(--text-primary)]">Sample Volume (µL)</label>
            <input
              type="number"
              min="0"
              step="0.001"
              placeholder="e.g., 40"
              value={form.sampleVolume}
              onChange={(e) => set('sampleVolume', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      )}

      {/* Stage 2: Timing & Repetition */}
      {stage === 2 && (
        <div className="flex flex-col gap-5 max-w-[500px] mx-auto">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Timing & Repetition</h3>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-[var(--text-primary)]">Wait Time (seconds)</label>
            <input
              type="number"
              min="0"
              placeholder="e.g., 5"
              value={form.waitTime}
              onChange={(e) => set('waitTime', e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-[var(--text-primary)]">Repetition Mode</label>
            <select
              value={form.repetitionMode}
              onChange={(e) => set('repetitionMode', e.target.value)}
              className={selectClass}
            >
              <option value="quantity">By Quantity</option>
              <option value="timeFrequency">By Time Frequency</option>
            </select>
          </div>

          {form.repetitionMode === 'quantity' ? (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-[var(--text-primary)]">Repeat Step (times)</label>
              <input
                type="number"
                min="1"
                placeholder="e.g., 5"
                value={form.repetitionQuantity}
                onChange={(e) => set('repetitionQuantity', e.target.value)}
                className={inputClass}
              />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-[var(--text-primary)]">Interval</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="e.g., 30"
                    value={form.repetitionInterval}
                    onChange={(e) => set('repetitionInterval', e.target.value)}
                    className={`${inputClass} flex-1`}
                  />
                  <select
                    value={intervalUnit}
                    onChange={(e) => setIntervalUnit(e.target.value)}
                    className={selectClass}
                  >
                    <option value="seconds">Seconds</option>
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                </div>
                {form.repetitionInterval && intervalUnit !== 'seconds' && (
                  <span className="text-xs text-[var(--text-tertiary)]">
                    = {toSeconds(form.repetitionInterval, intervalUnit)} seconds
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-[var(--text-primary)]">Total Duration</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="e.g., 5"
                    value={form.repetitionDuration}
                    onChange={(e) => set('repetitionDuration', e.target.value)}
                    className={`${inputClass} flex-1`}
                  />
                  <select
                    value={durationUnit}
                    onChange={(e) => setDurationUnit(e.target.value)}
                    className={selectClass}
                  >
                    <option value="seconds">Seconds</option>
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                </div>
                {form.repetitionDuration && durationUnit !== 'seconds' && (
                  <span className="text-xs text-[var(--text-tertiary)]">
                    = {toSeconds(form.repetitionDuration, durationUnit)} seconds
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between max-w-[500px] mx-auto mt-8">
        <button
          onClick={onCancel}
          className="px-6 py-2.5 text-sm font-semibold rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
        >
          Cancel
        </button>
        <div className="flex gap-3">
          {stage > 1 && (
            <button
              onClick={goBack}
              className="px-6 py-2.5 text-sm font-semibold rounded-lg border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              Back
            </button>
          )}
          {stage < 2 ? (
            <button
              onClick={goNext}
              className="px-6 py-2.5 text-sm font-semibold rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb] transition-colors"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSave}
              className="px-6 py-2.5 text-sm font-semibold rounded-lg bg-[#059669] text-white hover:bg-[#047857] transition-colors"
            >
              {isEditing ? 'Update Step' : 'Save Step'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── ProgramTab (main) ──────────────────────────────────────────────────────

// ─── Estimate program duration ────────────────────────────────────────────────

const Z_UP = 70.0
const SETTLE_TIME = 0.5 // seconds after each aspirate/dispense

function estimateProgramTime(steps, config, layoutType) {
  /* v8 ignore start */
  if (!steps || steps.length === 0) return 0
  /* v8 ignore stop */

  const travelSpeed = config.TRAVEL_SPEED || 0.001
  const pipetteSpeed = config.PIPETTE_SPEED || 0.002
  const spmX = config.STEPS_PER_MM_X || 100
  const spmY = config.STEPS_PER_MM_Y || 100
  const spmZ = config.STEPS_PER_MM_Z || 100
  const spmPipette = config.PIPETTE_STEPS_PER_ML || 1000
  const rinseCycles = config.RINSE_CYCLES || 3
  const coords = config.LAYOUT_COORDINATES?.[layoutType] || {}

  // Time = steps * 2 * speed (HIGH pulse + LOW pulse)
  const zMoveTime = (distMm) => Math.abs(distMm) * spmZ * 2 * travelSpeed
  const pipetteTime = (volMl) => volMl * spmPipette * 2 * pipetteSpeed

  // XY move simultaneously — time = max(x_time, y_time)
  const xyMoveTime = (fromWell, toWell) => {
    const a = coords[fromWell]
    const b = coords[toWell]
    if (!a || !b) {
      // Unknown coordinates, estimate 100mm average
      return 100 * spmX * 2 * travelSpeed
    }
    const xTime = Math.abs(b.x - a.x) * spmX * 2 * travelSpeed
    const yTime = Math.abs(b.y - a.y) * spmY * 2 * travelSpeed
    return Math.max(xTime, yTime)
  }

  // One transfer: pickup -> dropoff -> rinse -> wash
  const transferTime = (fromWell, pickup, dropoff, rinse, wash, volume) => {
    let t = 0
    let prev = fromWell

    // Z up to 70mm (from 0)
    t += zMoveTime(Z_UP)

    // Move to pickup, Z down, aspirate, Z up
    if (pickup) {
      t += xyMoveTime(prev, pickup)
      t += zMoveTime(Z_UP)          // Z down to 0
      t += pipetteTime(volume)
      t += SETTLE_TIME
      t += zMoveTime(Z_UP)          // Z up to 70
      prev = pickup
    }

    // Move to dropoff, Z down, dispense, Z up
    if (dropoff) {
      t += xyMoveTime(prev, dropoff)
      t += zMoveTime(Z_UP)          // Z down
      t += pipetteTime(volume)
      t += SETTLE_TIME
      t += zMoveTime(Z_UP)          // Z up
      prev = dropoff
    }

    // Rinse: move, Z down, N cycles of (aspirate + dispense), Z up
    if (rinse) {
      t += xyMoveTime(prev, rinse)
      t += zMoveTime(Z_UP)          // Z down
      for (let r = 0; r < rinseCycles; r++) {
        t += pipetteTime(volume) + SETTLE_TIME  // aspirate
        t += pipetteTime(volume) + SETTLE_TIME  // dispense
      }
      t += zMoveTime(Z_UP)          // Z up
      prev = rinse
    }

    // Wash: same as rinse
    if (wash) {
      t += xyMoveTime(prev, wash)
      t += zMoveTime(Z_UP)          // Z down
      for (let r = 0; r < rinseCycles; r++) {
        t += pipetteTime(volume) + SETTLE_TIME
        t += pipetteTime(volume) + SETTLE_TIME
      }
      t += zMoveTime(Z_UP)          // Z up
      prev = wash
    }

    return { time: t, lastWell: prev }
  }

  let total = 0
  let prevWell = 'WS1'

  for (const step of steps) {
    const stepType = step.stepType || 'pipette'

    if (stepType === 'wait') {
      total += step.waitTime || 0
      continue
    }

    if (stepType === 'home') {
      // Estimate homing: Z up + XY travel to origin
      total += zMoveTime(Z_UP)
      total += Math.max(300 * spmX * 2 * travelSpeed, 300 * spmY * 2 * travelSpeed)
      total += step.waitTime || 0
      prevWell = 'WS1'
      continue
    }

    // Pipette step
    const cycles = step.cycles || 1
    const volume = step.sampleVolume || 40
    const pickup = step.pickupWell || ''
    const dropoff = step.dropoffWell || ''
    const rinse = step.rinseWell || ''
    const wash = step.washWell || ''

    if (step.repetitionMode === 'timeFrequency' && step.repetitionDuration) {
      // Time-frequency mode: total time is the specified duration
      total += step.repetitionDuration
    } else {
      /* v8 ignore start */
      const reps = (step.repetitionMode === 'quantity') ? (step.repetitionQuantity || 1) : 1
      /* v8 ignore stop */

      for (let rep = 0; rep < reps; rep++) {
        for (let c = 0; c < cycles; c++) {
          const result = transferTime(prevWell, pickup, dropoff, rinse, wash, volume)
          total += result.time
          /* v8 ignore start */
          prevWell = result.lastWell || prevWell
          /* v8 ignore stop */

          // Wait between cycles (except last)
          if (step.waitTime && c < cycles - 1) {
            total += step.waitTime
          }
        }
        // Wait between repetitions (except last)
        if (step.waitTime && rep < reps - 1) {
          total += step.waitTime
        }
      }
    }
  }

  // Final home
  total += zMoveTime(Z_UP)
  total += Math.max(300 * spmX * 2 * travelSpeed, 300 * spmY * 2 * travelSpeed)

  return total
}

function formatDuration(seconds) {
  /* v8 ignore start */
  if (!seconds || seconds <= 0) return '0s'
  /* v8 ignore stop */
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.round(seconds % 60)
  const parts = []
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  if (s > 0 || parts.length === 0) parts.push(`${s}s`)
  return parts.join(' ')
}

// ─── Cron helpers ─────────────────────────────────────────────────────────────

const CRON_PRESETS = [
  { label: 'Every 5 minutes',  cron: '*/5 * * * *' },
  { label: 'Every hour',       cron: '0 * * * *' },
  { label: 'Every 2 hours',    cron: '0 */2 * * *' },
  { label: 'Every 6 hours',    cron: '0 */6 * * *' },
  { label: 'Every 12 hours',   cron: '0 */12 * * *' },
  { label: 'Daily at 8:00 AM', cron: '0 8 * * *' },
  { label: 'Daily at 6:00 PM', cron: '0 18 * * *' },
  { label: 'Mon-Fri at 8 AM',  cron: '0 8 * * 1-5' },
  { label: 'Every Monday 8 AM',cron: '0 8 * * 1' },
]

function describeCron(expr) {
  /* v8 ignore start */
  if (!expr || !expr.trim()) return ''
  /* v8 ignore stop */
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return 'Invalid expression (need 5 fields: min hour dom month dow)'
  const [min, hour, dom, month, dow] = parts

  const dowNames = { '0': 'Sunday', '1': 'Monday', '2': 'Tuesday', '3': 'Wednesday', '4': 'Thursday', '5': 'Friday', '6': 'Saturday', '7': 'Sunday' }

  if (min === '*' && hour === '*' && dom === '*' && month === '*' && dow === '*') return 'Every minute'
  if (min.startsWith('*/') && hour === '*' && dom === '*' && month === '*' && dow === '*') return `Every ${min.slice(2)} minutes`
  if (min === '0' && hour === '*' && dom === '*' && month === '*' && dow === '*') return 'Every hour'
  if (hour.startsWith('*/') && min === '0' && dom === '*' && month === '*' && dow === '*') return `Every ${hour.slice(2)} hours`
  if (min !== '*' && hour !== '*' && !hour.includes('/') && dom === '*' && month === '*') {
    const time = `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`
    if (dow === '*') return `Daily at ${time}`
    if (dow === '1-5') return `Mon\u2013Fri at ${time}`
    if (dowNames[dow]) return `Every ${dowNames[dow]} at ${time}`
    return `At ${time} on day-of-week ${dow}`
  }
  return `Cron: ${expr}`
}

// ─── ProgramTab (main) ──────────────────────────────────────────────────────

export default function ProgramTab({
  steps,
  layoutType,
  handleAddStep,
  handleUpdateStep,
  handleDuplicateStep,
  handleDeleteStep,
  handleReorderSteps,
  handleSaveProgram,
  handleLoadProgram,
  validateWellId,
  setActiveTab,
  setWellSelectionMode,
  schedule,
  onScheduleChange,
  config,
  programExecution,
  isExecuting,
  currentStepIndex,
  totalSteps,
}) {
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editingStep, setEditingStep] = useState(null)
  const dragIndexRef = useRef(null)

  const [waitInput, setWaitInput] = useState(null) // null = hidden, 'home' or 'wait' = which type

  // Program manager state
  const [programName, setProgramName] = useState('')
  const [savedPrograms, setSavedPrograms] = useState([])
  const [showProgramList, setShowProgramList] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)

  const fetchPrograms = async () => {
    try {
      const res = await fetch('/api/programs/list')
      const data = await res.json()
      if (data.programs) setSavedPrograms(data.programs)
    } catch (e) { console.error('Failed to list programs', e) }
  }

  useEffect(() => { fetchPrograms() }, [])

  const handleSaveAs = async () => {
    const name = programName.trim()
    /* v8 ignore start */
    if (!name || steps.length === 0) return
    /* v8 ignore stop */
    try {
      const res = await fetch('/api/programs/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, steps, schedule })
      })
      const data = await res.json()
      if (res.ok) {
        setProgramName(data.name || name)
        setShowSaveDialog(false)
        fetchPrograms()
        // Also save as the scheduled program so the scheduler stays in sync
        handleSaveProgram()
      }
    } catch (e) { console.error('Failed to save program', e) }
  }

  const handleLoadFromList = async (name) => {
    try {
      const res = await fetch(`/api/programs/load/${encodeURIComponent(name)}`)
      const data = await res.json()
      if (res.ok && data.steps) {
        handleLoadProgram(data.steps, data.schedule)
        setProgramName(name)
        setShowProgramList(false)
        // Also save as the scheduled program
        fetch('/api/program/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ steps: data.steps, schedule: data.schedule })
        }).catch(() => {})
      }
    } catch (e) { console.error('Failed to load program', e) }
  }

  const handleDeleteProgram = async (name) => {
    try {
      const res = await fetch(`/api/programs/${encodeURIComponent(name)}`, { method: 'DELETE' })
      if (res.ok) {
        fetchPrograms()
        if (programName === name) setProgramName('')
      }
    } catch (e) { console.error('Failed to delete program', e) }
  }

  const handleDownloadProgram = (name) => {
    const a = document.createElement('a')
    a.href = `/api/programs/download/${encodeURIComponent(name)}`
    a.download = `${name}.json`
    a.click()
  }

  const openAddWizard = () => {
    setEditingStep(null)
    setWizardOpen(true)
  }

  const openEditWizard = (step) => {
    setEditingStep(step)
    if (step.stepType === 'wait') {
      setWaitInput('wait')
      return
    }
    if (step.stepType === 'home') {
      // Home steps have no editable fields, skip
      setEditingStep(null)
      return
    }
    setWizardOpen(true)
  }

  const handleWizardSave = (formData) => {
    if (editingStep) {
      handleUpdateStep(editingStep.id, formData)
    } else {
      handleAddStep(formData)
    }
    setWizardOpen(false)
    setEditingStep(null)
  }

  const handleAddHome = () => {
    handleAddStep({ stepType: 'home', pickupWell: '', dropoffWell: '', sampleVolume: 0, waitTime: 0 })
  }

  const handleAddWait = (seconds) => {
    if (editingStep) {
      handleUpdateStep(editingStep.id, { ...editingStep, waitTime: seconds })
      setEditingStep(null)
    } else {
      handleAddStep({ stepType: 'wait', pickupWell: '', dropoffWell: '', sampleVolume: 0, waitTime: seconds })
    }
    setWaitInput(null)
  }

  const handleWizardCancel = () => {
    setWizardOpen(false)
    setEditingStep(null)
  }

  // Drag handlers
  const onDragStart = (index) => {
    dragIndexRef.current = index
  }

  const onDragOver = /* v8 ignore next */ (e) => {
    e.preventDefault()
  }

  const onDrop = (toIndex) => {
    const fromIndex = dragIndexRef.current
    if (fromIndex !== null && fromIndex !== toIndex) {
      handleReorderSteps(fromIndex, toIndex)
    }
    dragIndexRef.current = null
  }

  if (wizardOpen) {
    return (
      <StepWizard
        initial={editingStep}
        layoutType={layoutType}
        onSave={handleWizardSave}
        onCancel={handleWizardCancel}
        validateWellId={validateWellId}
        setActiveTab={setActiveTab}
        setWellSelectionMode={setWellSelectionMode}
      />
    )
  }

  return (
    <div className="flex-1 bg-[var(--bg-secondary)] rounded-[15px] p-8 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="m-0 text-[1.5rem] font-semibold text-[var(--text-primary)]">
            {programName || 'Program Steps'}
          </h2>
          {steps.length > 0 && (
            <span className="px-3 py-1 text-xs font-medium rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-color)]">
              Est. {formatDuration(estimateProgramTime(steps, config || {}, layoutType))}
            </span>
          )}
        </div>
        <div className="flex gap-2.5">
          <button
            className="py-2.5 px-5 text-sm font-semibold border-none rounded-lg cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg bg-[#8b5cf6] text-white hover:bg-[#7c3aed] disabled:bg-[#6b7280] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              if (programName) {
                // Quick save to existing name
                handleSaveAs()
              } else {
                setShowSaveDialog(true)
              }
            }}
            disabled={steps.length === 0}
          >
            Save
          </button>
          <button
            className="py-2.5 px-5 text-sm font-semibold border-none rounded-lg cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg bg-[#8b5cf6] text-white hover:bg-[#7c3aed] disabled:bg-[#6b7280] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => setShowSaveDialog(true)}
            disabled={steps.length === 0}
          >
            Save As
          </button>
          <button
            className="py-2.5 px-5 text-sm font-semibold border-none rounded-lg cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg bg-[#8b5cf6] text-white hover:bg-[#7c3aed]"
            onClick={() => { fetchPrograms(); setShowProgramList(true) }}
          >
            Load
          </button>
        </div>
      </div>

      {/* Save dialog */}
      {showSaveDialog && (
        <div className="mb-4 p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-color)] flex items-center gap-3">
          <label className="text-sm font-semibold text-[var(--text-primary)] whitespace-nowrap">Program Name:</label>
          <input
            type="text"
            autoFocus
            value={programName}
            onChange={(e) => setProgramName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveAs(); if (e.key === 'Escape') setShowSaveDialog(false) }}
            placeholder="Enter program name..."
            className={inputClass + ' flex-1'}
          />
          <button onClick={handleSaveAs} disabled={!programName.trim()} className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#8b5cf6] text-white hover:bg-[#7c3aed] disabled:bg-[#6b7280] disabled:cursor-not-allowed transition-colors">
            Save
          </button>
          <button onClick={() => setShowSaveDialog(false)} className="px-4 py-2 text-sm font-semibold rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors">
            Cancel
          </button>
        </div>
      )}

      {/* Load program list */}
      {showProgramList && (
        <div className="mb-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-color)] overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-[var(--border-color)]">
            <h3 className="m-0 text-sm font-semibold text-[var(--text-primary)]">Saved Programs</h3>
            <button onClick={() => setShowProgramList(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors text-lg leading-none">&times;</button>
          </div>
          {savedPrograms.length === 0 ? (
            <div className="p-6 text-center text-sm text-[var(--text-tertiary)]">No saved programs</div>
          ) : (
            <div className="max-h-60 overflow-y-auto">
              {savedPrograms.map((prog) => (
                <div key={prog.name} className={`flex items-center gap-3 px-4 py-3 border-b border-[var(--border-color)] last:border-b-0 hover:bg-[var(--bg-secondary)] transition-colors ${prog.name === programName ? 'bg-[rgba(139,92,246,0.08)]' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[var(--text-primary)] truncate">{prog.name}</div>
                    <div className="text-xs text-[var(--text-tertiary)]">
                      {prog.stepCount} step{prog.stepCount !== 1 ? 's' : ''}
                      {prog.modified && ` · ${new Date(prog.modified).toLocaleDateString()}`}
                    </div>
                  </div>
                  <button onClick={() => handleLoadFromList(prog.name)} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb] transition-colors">Load</button>
                  <button onClick={() => handleDownloadProgram(prog.name)} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] transition-colors" title="Download JSON">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </button>
                  <button onClick={() => handleDeleteProgram(prog.name)} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#dc2626]/30 text-[#dc2626] hover:bg-[#dc2626]/10 transition-colors" title="Delete">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step list */}
      <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto mb-4">
        {steps.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
            <div className="text-5xl mb-4 opacity-30">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-tertiary)]">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            </div>
            <p className="text-[var(--text-secondary)] font-semibold text-base mb-1">No steps yet</p>
            <p className="text-[var(--text-tertiary)] text-sm">Add your first step to get started</p>
          </div>
        ) : (
          steps.map((step, index) => (
            <StepCard
              key={step.id}
              step={step}
              index={index}
              isActive={isExecuting && currentStepIndex === index}
              onEdit={() => openEditWizard(step)}
              onDuplicate={() => handleDuplicateStep(step.id)}
              onDelete={() => handleDeleteStep(step.id)}
              onDragStart={() => onDragStart(index)}
              onDragOver={onDragOver}
              onDrop={() => onDrop(index)}
            />
          ))
        )}
      </div>

      {/* Wait time input overlay */}
      {waitInput === 'wait' && (() => {
        const existing = editingStep?.waitTime || 0
        const defUnit = existing >= 3600 && existing % 3600 === 0 ? 'hours' : existing >= 60 && existing % 60 === 0 ? 'minutes' : 'seconds'
        const defVal = defUnit === 'hours' ? existing / 3600 : defUnit === 'minutes' ? existing / 60 : (existing || 5)
        const multipliers = { seconds: 1, minutes: 60, hours: 3600 }
        const submitWait = (container) => {
          /* v8 ignore start */
          const val = Number(container.querySelector('#wait-value').value) || 1
          /* v8 ignore stop */
          const unit = container.querySelector('#wait-unit').value
          handleAddWait(Math.round(val * multipliers[unit]))
        }
        return (
          <div className="flex items-center gap-2 mb-2 p-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Wait:</span>
            <input
              type="number"
              min="1"
              id="wait-value"
              autoFocus
              defaultValue={defVal}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitWait(e.target.closest('div'))
                if (e.key === 'Escape') { setWaitInput(null); setEditingStep(null) }
              }}
              className={`${inputClass} w-20`}
            />
            <select id="wait-unit" defaultValue={defUnit} className={`${selectClass} w-28`}>
              <option value="seconds">Seconds</option>
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
            </select>
            <button
              onClick={(e) => submitWait(e.target.closest('div'))}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#f59e0b] text-white hover:bg-[#d97706] transition-colors"
            >
              {editingStep ? 'Update' : 'Add'}
            </button>
            <button
              onClick={() => { setWaitInput(null); setEditingStep(null) }}
              className="px-4 py-2 text-sm font-semibold rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              Cancel
            </button>
          </div>
        )
      })()}

      {/* Add Step buttons */}
      <div className="flex gap-2">
        <button
          onClick={openAddWizard}
          className="flex-1 py-3.5 rounded-xl border-2 border-dashed border-[var(--border-color)] text-[var(--text-secondary)] font-semibold text-sm hover:border-[#3b82f6] hover:text-[#3b82f6] hover:bg-[#3b82f6]/5 transition-all duration-200"
        >
          + Add Cycle
        </button>
        <button
          onClick={handleAddHome}
          className="py-3.5 px-5 rounded-xl border-2 border-dashed border-[var(--border-color)] text-[var(--text-secondary)] font-semibold text-sm hover:border-[#059669] hover:text-[#059669] hover:bg-[#059669]/5 transition-all duration-200"
        >
          + Home
        </button>
        <button
          onClick={() => { setEditingStep(null); setWaitInput('wait') }}
          className="py-3.5 px-5 rounded-xl border-2 border-dashed border-[var(--border-color)] text-[var(--text-secondary)] font-semibold text-sm hover:border-[#f59e0b] hover:text-[#f59e0b] hover:bg-[#f59e0b]/5 transition-all duration-200"
        >
          + Wait
        </button>
      </div>

      {/* Schedule section */}
      <div className="mt-6 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="m-0 text-base font-semibold text-[var(--text-primary)]">Schedule</h3>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-sm text-[var(--text-secondary)]">{schedule?.enabled ? 'Enabled' : 'Disabled'}</span>
            <div
              className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${schedule?.enabled ? 'bg-[#059669]' : 'bg-[var(--border-color)]'}`}
              onClick={() => onScheduleChange({ ...schedule, enabled: !schedule?.enabled })}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${schedule?.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </label>
        </div>

        <div className={`flex flex-col gap-4 ${!schedule?.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
          {/* Cron expression input */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-[var(--text-primary)]">Cron Expression</label>
            <input
              type="text"
              placeholder="e.g., 0 8 * * *"
              value={schedule?.cronExpression || ''}
              onChange={(e) => onScheduleChange({ ...schedule, cronExpression: e.target.value })}
              className={inputClass + ' font-mono'}
            />
            {schedule?.cronExpression && (
              <span className="text-xs text-[var(--text-secondary)]">
                {describeCron(schedule.cronExpression)}
              </span>
            )}
            <span className="text-xs text-[var(--text-tertiary)]">
              Format: minute hour day-of-month month day-of-week
            </span>
          </div>

          {/* Presets */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-[var(--text-primary)]">Quick Presets</label>
            <div className="flex flex-wrap gap-2">
              {CRON_PRESETS.map((p) => (
                <button
                  key={p.cron}
                  onClick={() => onScheduleChange({ ...schedule, cronExpression: p.cron })}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    schedule?.cronExpression === p.cron
                      ? 'border-[#059669] bg-[#059669]/10 text-[#059669]'
                      : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Execution status */}
        {programExecution && (
          <div className="mt-4 pt-4 border-t border-[var(--border-color)]">
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${
                isExecuting || programExecution.status === 'running'
                  ? 'bg-[#f59e0b] animate-pulse'
                  : programExecution.lastResult === 'error'
                    ? 'bg-[#dc2626]'
                    : 'bg-[#059669]'
              }`} />
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                {isExecuting ? 'Program Running' : programExecution.status === 'running' ? 'Program Running' : 'Idle'}
              </span>
              {isExecuting && currentStepIndex !== null && totalSteps !== null && (
                <span className="text-xs font-medium text-[#f59e0b]">
                  Step {currentStepIndex + 1} of {totalSteps}
                </span>
              )}
              {programExecution.status === 'running' && programExecution.startedAt && (
                <span className="text-xs text-[var(--text-tertiary)]">
                  since {new Date(programExecution.startedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
            {programExecution.status !== 'running' && programExecution.lastRunAt && (
              <div className="mt-2 text-xs text-[var(--text-secondary)]">
                Last run: {new Date(programExecution.lastRunAt).toLocaleString()}
                {' \u2014 '}
                <span className={programExecution.lastResult === 'error' ? 'text-[#dc2626]' : 'text-[#059669]'}>
                  {programExecution.lastResult === 'error' ? 'Failed' : 'Success'}
                </span>
                {programExecution.lastError && (
                  <span className="text-[#dc2626]"> ({programExecution.lastError})</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
