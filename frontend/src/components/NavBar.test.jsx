import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import NavBar from './NavBar'

function renderNavBar(overrides = {}) {
  const props = {
    activeTab: 'protocol',
    setActiveTab: vi.fn(),
    controllerType: '3-pipette',
    theme: 'light',
    toggleTheme: vi.fn(),
    ...overrides,
  }
  render(<NavBar {...props} />)
  return props
}

describe('NavBar', () => {
  it('renders all tab buttons', () => {
    renderNavBar()
    expect(screen.getByText('Plate Layout')).toBeInTheDocument()
    expect(screen.getByText('Program')).toBeInTheDocument()
    expect(screen.getByText('Manual')).toBeInTheDocument()
    expect(screen.getByText('Drift Test')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('renders theme toggle button', () => {
    renderNavBar()
    expect(screen.getByText('Dark Mode')).toBeInTheDocument()
  })

  it.each([
    ['Plate Layout', 'protocol'],
    ['Program', 'program'],
    ['Manual', 'manual'],
    ['Drift Test', 'drift-test'],
    ['Settings', 'settings'],
  ])('clicking "%s" fires setActiveTab with "%s"', (label, value) => {
    const props = renderNavBar()
    fireEvent.click(screen.getByText(label))
    expect(props.setActiveTab).toHaveBeenCalledWith(value)
  })

  it('active tab gets the active CSS class', () => {
    renderNavBar({ activeTab: 'program' })
    const programBtn = screen.getByText('Program').closest('button')
    expect(programBtn.className).toContain('bg-[var(--nav-active)]')
    expect(programBtn.className).toContain('border-[var(--border-hover)]')

    // A non-active tab should NOT have the active class
    const manualBtn = screen.getByText('Manual').closest('button')
    expect(manualBtn.className).not.toContain('bg-[var(--nav-active)]')
  })

  it('light mode shows "Dark Mode" text', () => {
    renderNavBar({ theme: 'light' })
    expect(screen.getByText('Dark Mode')).toBeInTheDocument()
    expect(screen.getByTitle('Switch to dark mode')).toBeInTheDocument()
  })

  it('dark mode shows "Light Mode" text', () => {
    renderNavBar({ theme: 'dark' })
    expect(screen.getByText('Light Mode')).toBeInTheDocument()
    expect(screen.getByTitle('Switch to light mode')).toBeInTheDocument()
  })

  it('clicking theme toggle fires toggleTheme', () => {
    const props = renderNavBar({ theme: 'light' })
    fireEvent.click(screen.getByText('Dark Mode'))
    expect(props.toggleTheme).toHaveBeenCalledTimes(1)
  })
})
