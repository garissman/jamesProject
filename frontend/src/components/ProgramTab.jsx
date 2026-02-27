export default function ProgramTab({
  pipetteCount,
  setPipetteCount,
  cycles,
  setCycles,
  pickupWell,
  setPickupWell,
  dropoffWell,
  setDropoffWell,
  rinseWell,
  setRinseWell,
  waitTime,
  setWaitTime,
  sampleVolume,
  setSampleVolume,
  repetitionMode,
  setRepetitionMode,
  repetitionQuantity,
  setRepetitionQuantity,
  repetitionInterval,
  setRepetitionInterval,
  repetitionDuration,
  setRepetitionDuration,
  layoutType,
  handleAddStep,
  handleSaveProgram,
  handleLoadProgram,
  steps,
}) {
  const wellPlaceholder =
    layoutType === 'microchip'
      ? 'e.g., A1, WS1, MC3'
      : 'e.g., SA1, VA1, WS2';

  return (
    <div className="flex-1 bg-[var(--bg-secondary)] rounded-[15px] p-10">
      <h2 className="m-0 mb-[30px] text-[1.8rem] font-semibold text-[var(--text-primary)]">
        Program Configuration
      </h2>
      <div className="flex flex-col gap-[25px] max-w-[500px]">
        {/* Pipette Configuration */}
        <div className="flex flex-col gap-2">
          <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">
            Pipette Configuration:
          </label>
          <select
            value={pipetteCount}
            onChange={(e) => setPipetteCount(Number(e.target.value))}
            className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)] cursor-pointer"
          >
            <option value={1}>1 Pipette</option>
            <option value={3}>3 Pipettes</option>
          </select>
        </div>

        {/* Cycles */}
        <div className="flex flex-col gap-2">
          <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">
            Cycles:
          </label>
          <input
            type="number"
            min="1"
            value={cycles}
            onChange={(e) => setCycles(e.target.value)}
            className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
          />
        </div>

        {/* Pickup Well */}
        <div className="flex flex-col gap-2">
          <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">
            Pickup Well:
          </label>
          <input
            type="text"
            placeholder={wellPlaceholder}
            value={pickupWell}
            onChange={(e) => setPickupWell(e.target.value)}
            className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
          />
        </div>

        {/* Dropoff Well */}
        <div className="flex flex-col gap-2">
          <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">
            Dropoff Well:
          </label>
          <input
            type="text"
            placeholder={wellPlaceholder}
            value={dropoffWell}
            onChange={(e) => setDropoffWell(e.target.value)}
            className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
          />
        </div>

        {/* Rinse Well */}
        <div className="flex flex-col gap-2">
          <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">
            Rinse Well:
          </label>
          <input
            type="text"
            placeholder={wellPlaceholder}
            value={rinseWell}
            onChange={(e) => setRinseWell(e.target.value)}
            className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
          />
        </div>

        {/* Wait Time */}
        <div className="flex flex-col gap-2">
          <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">
            Wait Time (seconds):
          </label>
          <input
            type="number"
            min="0"
            placeholder="e.g., 5"
            value={waitTime}
            onChange={(e) => setWaitTime(e.target.value)}
            className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
          />
        </div>

        {/* Sample Volume */}
        <div className="flex flex-col gap-2">
          <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">
            Sample Volume (mL):
          </label>
          <input
            type="number"
            min="0"
            step="0.001"
            placeholder="e.g., 0.5"
            value={sampleVolume}
            onChange={(e) => setSampleVolume(e.target.value)}
            className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
          />
        </div>

        {/* Divider */}
        <div className="h-px bg-[var(--border-color)] my-2.5" />

        {/* Repetition Mode */}
        <div className="flex flex-col gap-2">
          <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">
            Repetition Mode:
          </label>
          <select
            value={repetitionMode}
            onChange={(e) => setRepetitionMode(e.target.value)}
            className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)] cursor-pointer"
          >
            <option value="quantity">By Quantity</option>
            <option value="timeFrequency">By Time Frequency</option>
          </select>
        </div>

        {/* Repetition Options */}
        {repetitionMode === 'quantity' ? (
          <div className="flex flex-col gap-2">
            <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">
              Repeat Step (times):
            </label>
            <input
              type="number"
              min="1"
              value={repetitionQuantity}
              onChange={(e) => setRepetitionQuantity(e.target.value)}
              className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
              placeholder="e.g., 5"
            />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">
                Interval (seconds):
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={repetitionInterval}
                onChange={(e) => setRepetitionInterval(e.target.value)}
                className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                placeholder="e.g., 30"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[1.1rem] font-semibold text-[var(--text-primary)]">
                Total Duration (seconds):
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={repetitionDuration}
                onChange={(e) => setRepetitionDuration(e.target.value)}
                className="p-3 px-4 text-base border-2 border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] transition-all duration-300 placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-hover)] focus:bg-[var(--input-focus-bg)]"
                placeholder="e.g., 300"
              />
            </div>
          </>
        )}

        {/* Add Step Button */}
        <button
          className="py-[15px] px-[30px] text-[1.1rem] font-semibold border-none rounded-[10px] cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg bg-[#059669] text-white mt-2.5 hover:bg-[#047857]"
          onClick={handleAddStep}
        >
          Add Step
        </button>

        {/* File Actions */}
        <div className="flex gap-2.5 mt-5 pt-5 border-t border-[var(--border-color)]">
          <button
            className="py-[15px] px-[30px] text-[1.1rem] font-semibold border-none rounded-[10px] cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg bg-[#8b5cf6] text-white flex-1 hover:bg-[#7c3aed] disabled:bg-[#6b7280] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleSaveProgram}
            disabled={steps.length === 0}
          >
            Save Program
          </button>
          <label className="py-[15px] px-[30px] text-[1.1rem] font-semibold border-none rounded-[10px] cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg bg-[#8b5cf6] text-white flex-1 hover:bg-[#7c3aed] text-center">
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
    </div>
  );
}
