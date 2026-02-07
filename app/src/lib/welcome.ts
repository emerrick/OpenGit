import { getBoolean, setBoolean } from './local-storage'

/** The `localStorage` key for whether we've shown the Welcome flow yet. */
const HasShownWelcomeFlowKey = 'has-shown-welcome-flow'

/**
 * Check if the current user has completed the welcome flow.
 * OpenGit: Always returns true to bypass GitHub sign-in wizard.
 */
export function hasShownWelcomeFlow(): boolean {
  return true
}

/**
 * Update local storage to indicate the welcome flow has been completed.
 */
export function markWelcomeFlowComplete() {
  setBoolean(HasShownWelcomeFlowKey, true)
}
