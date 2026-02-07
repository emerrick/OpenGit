import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  hasShownWelcomeFlow,
  markWelcomeFlowComplete,
} from '../../src/lib/welcome'

describe('Welcome', () => {
  describe('hasShownWelcomeFlow', () => {
    it('always returns true (OpenGit bypasses welcome)', () => {
      assert(hasShownWelcomeFlow())
    })
  })

  describe('markWelcomeFlowComplete', () => {
    it('sets localStorage to 1', () => {
      markWelcomeFlowComplete()
      const value = localStorage.getItem('has-shown-welcome-flow')
      assert.equal(value, '1')
    })
  })
})
