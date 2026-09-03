import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES, getPreferences, resetPreferences } from '../core/preferences'
import { PreferencesMenu } from './PreferencesMenu'

const open = () => {
  render(<PreferencesMenu />)
  fireEvent.click(screen.getByRole('button', { name: 'Preferences' }))
}

describe('the Preferences panel', () => {
  beforeEach(() => {
    localStorage.clear()
    resetPreferences()
  })

  it('stays out of the way until it is opened', () => {
    render(<PreferencesMenu />)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it("groups the settings the way AutoCAD's Options dialog does", () => {
    open()

    const headings = screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent)
    expect(headings).toEqual(['Selection', 'Drafting', 'Display', 'Modify', 'Files', 'Appearance'])
  })

  it('shows the current value of a setting', () => {
    open()

    expect(screen.getByLabelText(/Pick box size/)).toHaveValue(DEFAULT_PREFERENCES.pickBoxSize)
  })

  it('changes a number as it is typed', () => {
    open()

    fireEvent.change(screen.getByLabelText(/Pick box size/), { target: { value: '18' } })

    expect(getPreferences().pickBoxSize).toBe(18)
  })

  it('will not take a number that would make the interface unusable', () => {
    open()

    fireEvent.change(screen.getByLabelText(/Grip size/), { target: { value: '4000' } })

    expect(getPreferences().gripSize).toBe(40)
  })

  it('switches how a selection window is drawn out', () => {
    open()

    fireEvent.change(screen.getByLabelText(/Window selection/), { target: { value: 'click' } })

    expect(getPreferences().windowSelection).toBe('click')
  })

  it('turns a setting off with its checkbox', () => {
    open()

    fireEvent.click(screen.getByLabelText(/Show grid/))

    expect(getPreferences().showGrid).toBe(false)
  })

  it('offers the polar angles that divide a turn evenly', () => {
    open()

    const options = Array.from(screen.getByLabelText(/Polar tracking angle/).querySelectorAll('option'))
    expect(options.map((option) => option.textContent)).toEqual(['90°', '45°', '30°', '22.5°', '15°', '10°', '5°'])
  })

  it('explains what reading polylines as lines actually changes', () => {
    open()

    const row = screen.getByLabelText(/Read polylines as their lines/).closest('label')
    expect(row).toHaveAttribute('title', expect.stringContaining('JOIN and OVERKILL'))
  })

  it('offers nothing to restore while everything is still as it shipped', () => {
    open()

    expect(screen.getByRole('button', { name: 'Restore defaults' })).toBeDisabled()
  })

  it('puts every setting back at once', () => {
    open()
    fireEvent.change(screen.getByLabelText(/Pick box size/), { target: { value: '18' } })
    fireEvent.click(screen.getByLabelText(/Show grid/))

    fireEvent.click(screen.getByRole('button', { name: 'Restore defaults' }))

    expect(getPreferences()).toEqual(DEFAULT_PREFERENCES)
  })

  it('closes on Escape', () => {
    open()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes when something else is clicked', () => {
    open()

    fireEvent.pointerDown(document.body)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
