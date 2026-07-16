import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { sanitizeSupervisorLayout } from './supervisor-layout'

describe('sanitizeSupervisorLayout', () => {
  it('keeps a healthy split where the main panel is dominant', () => {
    const layout = { main: 70, supervisor: 30 }
    assert.deepEqual(sanitizeSupervisorLayout(layout), layout)
  })

  it('keeps a split where main is only slightly wider', () => {
    const layout = { main: 56, supervisor: 44 }
    assert.deepEqual(sanitizeSupervisorLayout(layout), layout)
  })

  it('drops a stale split that starves the main panel', () => {
    assert.equal(
      sanitizeSupervisorLayout({ main: 3, supervisor: 97 }),
      undefined,
    )
  })

  it('drops an equal split (never produced by interactive resize)', () => {
    assert.equal(
      sanitizeSupervisorLayout({ main: 50, supervisor: 50 }),
      undefined,
    )
  })

  it('drops undefined, malformed, or non-positive layouts', () => {
    assert.equal(sanitizeSupervisorLayout(undefined), undefined)
    assert.equal(
      sanitizeSupervisorLayout({ main: 70 } as Record<string, number>),
      undefined,
    )
    assert.equal(
      sanitizeSupervisorLayout({ main: 0, supervisor: 0 }),
      undefined,
    )
    assert.equal(
      sanitizeSupervisorLayout({
        main: Number.NaN,
        supervisor: 30,
      }),
      undefined,
    )
  })
})
