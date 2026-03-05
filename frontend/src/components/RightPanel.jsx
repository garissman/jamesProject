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
