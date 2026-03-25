export default function NavBar({ activeTab, setActiveTab, theme, toggleTheme }) {
  const baseTab =
    'bg-transparent border-2 border-[var(--border-color)] text-[var(--text-primary)] py-3 px-10 text-[1.1rem] cursor-pointer transition-all duration-300 flex items-center gap-2.5 rounded-none';
  const activeClass = 'bg-[var(--nav-active)] border-[var(--border-hover)]';
  const hoverClass = 'hover:bg-[var(--nav-hover)]';

  function tabClass(tab) {
    return `${baseTab} ${hoverClass} ${activeTab === tab ? activeClass : ''}`;
  }

  return (
    <nav className="flex justify-center gap-0 p-[15px] bg-transparent">
      <button
        className={tabClass('protocol')}
        onClick={() => setActiveTab('protocol')}
      >
        <span className="text-[1.2rem]">{'\u2610'}</span>
        Plate Layout
      </button>
      <button
        className={tabClass('program')}
        onClick={() => setActiveTab('program')}
      >
        <span className="text-[1.2rem]">{'\u25C7'}</span> Program
      </button>
      <button
        className={tabClass('manual')}
        onClick={() => setActiveTab('manual')}
      >
        <span className="text-[1.2rem]">{'\u2194'}</span> Manual
      </button>
      <button
        className={tabClass('drift-test')}
        onClick={() => setActiveTab('drift-test')}
      >
        <span className="text-[1.2rem]">{'\u27F3'}</span> Drift Test
      </button>
      <button
        className={tabClass('settings')}
        onClick={() => setActiveTab('settings')}
      >
        <span className="text-[1.2rem]">{'\u2699'}</span> Settings
      </button>
      <button
        className={`${baseTab} ${hoverClass} ml-auto rounded-lg`}
        onClick={toggleTheme}
        title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      >
        <span className="text-[1.2rem]">{theme === 'light' ? '\uD83C\uDF19' : '\u2600\uFE0F'}</span>
        {theme === 'light' ? 'Dark' : 'Light'} Mode
      </button>
    </nav>
  );
}
