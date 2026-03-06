import { useState, useRef } from 'react'

const inputClass = 'p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]'
const selectClass = inputClass + ' cursor-pointer'

// ─── StepCard ────────────────────────────────────────────────────────────────

function StepCard({ step, index, onEdit, onDuplicate, onDelete, onDragStart, onDragOver, onDrop }) {
  const stepType = step.stepType || 'pipette'

  const fmtTime = (s) => {
    const n = Number(s)
    if (!n || isNaN(n)) return '?'
    if (n >= 86400 && n % 86400 === 0) return `${n / 86400}d`
    if (n >= 3600 && n % 3600 === 0) return `${n / 3600}h`
    if (n >= 60 && n % 60 === 0) return `${n / 60}m`
    return `${n}s`
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
    const rinse = step.rinseWell ? `Rinse: ${step.rinseWell}` : null
    const wash = step.washWell ? `Wash: ${step.washWell}` : null
    const volume = step.sampleVolume ? `${step.sampleVolume} mL` : null
    const wait = step.waitTime ? `Wait: ${step.waitTime}s` : null
    const cycles = step.cycles > 1 ? `${step.cycles} cycles` : null

    let repInfo = null
    if (step.repetitionMode === 'quantity' && step.repetitionQuantity > 1) {
      repInfo = `x${step.repetitionQuantity}`
    } else if (step.repetitionMode === 'timeFrequency' && step.repetitionInterval) {
      repInfo = `every ${fmtTime(step.repetitionInterval)} / ${fmtTime(step.repetitionDuration)}`
    }

    details = [volume, rinse, wash, wait, cycles, repInfo].filter(Boolean).join(' | ')
  }

  const badgeColor = stepType === 'home' ? '#059669' : stepType === 'wait' ? '#f59e0b' : '#3b82f6'

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-color)] hover:border-[var(--border-hover)] transition-all duration-200 cursor-grab active:cursor-grabbing"
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

  const formatSeconds = (totalSeconds) => {
    const s = Number(totalSeconds)
    if (!s || isNaN(s)) return ''
    if (s >= 86400 && s % 86400 === 0) return `${s / 86400}d`
    if (s >= 3600 && s % 3600 === 0) return `${s / 3600}h`
    if (s >= 60 && s % 60 === 0) return `${s / 60}m`
    return `${s}s`
  }

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

          {/* Volume */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-[var(--text-primary)]">Sample Volume (mL)</label>
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
}) {
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editingStep, setEditingStep] = useState(null)
  const dragIndexRef = useRef(null)

  const [waitInput, setWaitInput] = useState(null) // null = hidden, 'home' or 'wait' = which type

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

  const onDragOver = (e) => {
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
        <h2 className="m-0 text-[1.5rem] font-semibold text-[var(--text-primary)]">
          Program Steps
        </h2>
        <div className="flex gap-2.5">
          <button
            className="py-2.5 px-5 text-sm font-semibold border-none rounded-lg cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg bg-[#8b5cf6] text-white hover:bg-[#7c3aed] disabled:bg-[#6b7280] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleSaveProgram}
            disabled={steps.length === 0}
          >
            Save Program
          </button>
          <label className="py-2.5 px-5 text-sm font-semibold border-none rounded-lg cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg bg-[#8b5cf6] text-white hover:bg-[#7c3aed] text-center flex items-center">
            Load Program
            <input
              type="file"
              accept=".json"
              onChange={handleLoadProgram}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>

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
      {waitInput === 'wait' && (
        <div className="flex items-center gap-2 mb-2 p-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Wait seconds:</span>
          <input
            type="number"
            min="1"
            autoFocus
            defaultValue={editingStep?.waitTime || 5}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddWait(Number(e.target.value) || 5)
              if (e.key === 'Escape') { setWaitInput(null); setEditingStep(null) }
            }}
            className={`${inputClass} w-24`}
          />
          <button
            onClick={(e) => {
              const input = e.target.parentElement.querySelector('input')
              handleAddWait(Number(input.value) || 5)
            }}
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
      )}

      {/* Add Step buttons */}
      <div className="flex gap-2">
        <button
          onClick={openAddWizard}
          className="flex-1 py-3.5 rounded-xl border-2 border-dashed border-[var(--border-color)] text-[var(--text-secondary)] font-semibold text-sm hover:border-[#3b82f6] hover:text-[#3b82f6] hover:bg-[#3b82f6]/5 transition-all duration-200"
        >
          + Add Step
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
    </div>
  )
}
