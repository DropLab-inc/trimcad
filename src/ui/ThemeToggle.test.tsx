import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ThemeToggle } from './ThemeToggle'
import { initTheme } from './theme'

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    initTheme()
  })

  it('offers to switch to light while the app is dark', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument()
  })

  it('repaints the app and flips the offer when clicked', () => {
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }))

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument()
  })

  it('switches back again', () => {
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }))
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }))

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('droplabcad.theme')).toBe('dark')
  })
})
