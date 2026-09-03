import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createOAuthReturnLifecycle } from './oauth-return-recovery'

describe('OAuth return recovery', () => {
  it('does not reset an untouched login form on its initial page show', () => {
    const pending = false
    let recoveries = 0
    const lifecycle = createOAuthReturnLifecycle(
      () => pending,
      () => {
        recoveries += 1
      }
    )

    assert.equal(lifecycle.pageShow(), false)
    assert.equal(recoveries, 0)
  })

  it('releases a pending OAuth lock once after page-history restoration', () => {
    let pending = true
    let recoveries = 0
    const lifecycle = createOAuthReturnLifecycle(
      () => pending,
      () => {
        pending = false
        recoveries += 1
      }
    )

    lifecycle.pageHide()
    assert.equal(lifecycle.pageShow(), true)
    assert.equal(lifecycle.pageShow(), false)
    assert.equal(recoveries, 1)
  })

  it('recovers when an OAuth tab returns from hidden to visible', () => {
    let pending = true
    let recoveries = 0
    const lifecycle = createOAuthReturnLifecycle(
      () => pending,
      () => {
        pending = false
        recoveries += 1
      }
    )

    assert.equal(lifecycle.visibilityChange('hidden'), false)
    assert.equal(lifecycle.visibilityChange('visible'), true)
    assert.equal(recoveries, 1)
  })

  it('does not revive a request that already failed before the page returned', () => {
    let pending = true
    let recoveries = 0
    const lifecycle = createOAuthReturnLifecycle(
      () => pending,
      () => {
        recoveries += 1
      }
    )

    lifecycle.pageHide()
    pending = false

    assert.equal(lifecycle.pageShow(), false)
    assert.equal(recoveries, 0)
  })
})
