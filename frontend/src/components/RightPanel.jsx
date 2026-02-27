export default function RightPanel({
  logs,
  logsEndRef,
  activeTab,
  steps,
  targetWell,
  isExecuting,
  handleMoveToWell,
  handleExecute,
  handleStop,
  handleHome,
  handleDeleteAll,
}) {
  return (
    <div className="w-[250px] min-w-[250px] flex flex-col gap-[15px] max-lg:w-full max-lg:min-w-full max-lg:order-2">
      {/* Logs Section */}
      <div className="bg-[var(--bg-secondary)] rounded-[15px] p-[15px] max-h-[250px] flex flex-col">
        <h3 className="m-0 mb-2.5 text-[1.1rem] font-semibold text-[var(--text-primary)]">System Logs</h3>
        <div className="bg-[var(--logs-bg)] rounded-lg p-2.5 flex-1 overflow-y-auto font-mono text-[0.75rem] max-h-[200px]">
          {logs.length > 0 ? (
            <>
              {logs.map((log, index) => (
                <div key={index} className="py-0.5 text-[var(--logs-text)] whitespace-pre-wrap break-words">{log}</div>
              ))}
              <div ref={logsEndRef} />
            </>
          ) : (
            <div className="text-[var(--text-tertiary)] italic text-center p-2.5">No logs available</div>
          )}
        </div>
      </div>

      {/* Concentration Section - only on program tab */}
      {activeTab === 'program' && (
        <div className="bg-[var(--bg-secondary)] rounded-[15px] p-5 flex-1">
          <h3 className="m-0 mb-[15px] text-[1.2rem] font-semibold text-[var(--text-primary)]">Cycles</h3>
          <div className="flex flex-col gap-[15px] max-h-[400px] overflow-y-auto">
            {steps.map((step, stepIndex) => {
              const totalReps = step.repetitionMode === 'timeFrequency' && step.repetitionInterval && step.repetitionDuration
                ? Math.floor(step.repetitionDuration / step.repetitionInterval)
                : step.repetitionQuantity || 1;
              return (
                <div key={step.id} className="bg-[var(--bg-overlay)] p-[15px] rounded-[10px] mb-2.5">
                  <h4 className="m-0 mb-2.5 text-[1.1rem] text-[var(--text-primary)] border-b border-[var(--border-color)] pb-2">
                    Step {stepIndex + 1}
                  </h4>
                  <div className="mb-2 py-2 px-3 bg-[var(--bg-tertiary)] rounded-md border-l-[3px] border-l-[#8b5cf6]">
                    <div className="text-[0.95rem] font-semibold text-[var(--text-primary)]">
                      {'\uD83D\uDD27'} {step.pipetteCount || 3} Pipette{(step.pipetteCount || 3) > 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="mb-2.5 py-2 px-3 bg-[var(--bg-tertiary)] rounded-md border-l-[3px] border-l-[#3b82f6]">
                    {step.repetitionMode === 'quantity' ? (
                      <div className="text-[0.95rem] font-semibold text-[var(--text-primary)]">
                        {'\u21BB'} Repeat {step.repetitionQuantity} time(s)
                      </div>
                    ) : (
                      <div className="text-[0.95rem] font-semibold text-[var(--text-primary)]">
                        {'\u23F1'} Every {step.repetitionInterval}s for {step.repetitionDuration}s ({totalReps} times)
                      </div>
                    )}
                  </div>
                  {[...Array(step.cycles)].map((_, cycleIndex) => (
                    <div key={cycleIndex} className="bg-[var(--bg-tertiary)] p-3 rounded-lg border-l-[3px] border-l-[var(--border-color)]">
                      {step.pickupWell && <div className="py-1 text-[0.95rem] text-[var(--text-tertiary)]">{'\u2022'} Pickup from well: {step.pickupWell}</div>}
                      {step.sampleVolume && <div className="py-1 text-[0.95rem] text-[var(--text-tertiary)]">{'\u2022'} Sample volume: {step.sampleVolume} mL</div>}
                      {step.dropoffWell && <div className="py-1 text-[0.95rem] text-[var(--text-tertiary)]">{'\u2022'} Dropoff to well: {step.dropoffWell}</div>}
                      {step.rinseWell && <div className="py-1 text-[0.95rem] text-[var(--text-tertiary)]">{'\u2022'} Rinse at well: {step.rinseWell}</div>}
                      {step.waitTime && <div className="py-1 text-[0.95rem] text-[var(--text-tertiary)]">{'\u2022'} Wait: {step.waitTime}s</div>}
                    </div>
                  ))}
                </div>
              );
            })}
            {steps.length === 0 && (
              <div className="text-[var(--text-tertiary)] italic text-center p-5">Add steps to see program</div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col gap-[15px] max-lg:flex-row max-lg:flex-wrap">
        {targetWell && (
          <button
            className="py-[15px] px-[30px] text-[1.1rem] font-semibold border-none rounded-[10px] cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_8px_rgba(0,0,0,0.3)] bg-[#10b981] text-white hover:bg-[#059669] disabled:bg-[#6b7280] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[#6b7280] disabled:hover:translate-y-0 disabled:hover:shadow-none"
            onClick={handleMoveToWell}
            disabled={isExecuting}
          >
            Move to {targetWell}
          </button>
        )}
        <button
          className="py-[15px] px-[30px] text-[1.1rem] font-semibold border-none rounded-[10px] cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_8px_rgba(0,0,0,0.3)] bg-[#16a34a] text-white hover:bg-[#15803d] disabled:bg-[#6b7280] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[#6b7280] disabled:hover:translate-y-0 disabled:hover:shadow-none"
          onClick={handleExecute}
          disabled={isExecuting || steps.length === 0}
        >
          {isExecuting ? 'Executing...' : 'Execute'}
        </button>
        <button
          className="py-[15px] px-[30px] text-[1.1rem] font-semibold border-none rounded-[10px] cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_8px_rgba(0,0,0,0.3)] bg-[#f59e0b] text-white hover:bg-[#d97706]"
          onClick={handleStop}
        >
          Stop
        </button>
        <button
          className="py-[15px] px-[30px] text-[1.1rem] font-semibold border-none rounded-[10px] cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_8px_rgba(0,0,0,0.3)] bg-[#3b82f6] text-white hover:bg-[#2563eb] disabled:bg-[#6b7280] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[#6b7280] disabled:hover:translate-y-0 disabled:hover:shadow-none"
          onClick={handleHome}
          disabled={isExecuting}
        >
          Home
        </button>
        <button
          className="py-[15px] px-[30px] text-[1.1rem] font-semibold border-none rounded-[10px] cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_8px_rgba(0,0,0,0.3)] bg-[#dc2626] text-white hover:bg-[#b91c1c]"
          onClick={handleDeleteAll}
        >
          Delete all
        </button>
      </div>
    </div>
  );
}
