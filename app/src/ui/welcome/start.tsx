import * as React from 'react'
import { WelcomeStep } from './welcome'
import { Dispatcher } from '../dispatcher'
import { Button } from '../lib/button'

interface IStartProps {
  readonly advance: (step: WelcomeStep) => void
  readonly dispatcher: Dispatcher
  readonly loadingBrowserAuth: boolean
}

/** The first step of the Welcome flow. */
export class Start extends React.Component<IStartProps, {}> {
  public render() {
    return (
      <section
        id="start"
        aria-label="Welcome to OpenGit"
        aria-describedby="start-description"
      >
        <div className="start-content">
          <h1 className="welcome-title">
            Welcome to <span>OpenGit</span>
          </h1>
          <p id="start-description" className="welcome-text">
            OpenGit is a fast, open-source Git client that works with any
            remote. Let's configure Git so your commits are properly
            attributed.
          </p>

          <div className="welcome-main-buttons">
            <Button
              type="submit"
              className="button-with-icon"
              onClick={this.configureGit}
              autoFocus={true}
            >
              Configure Git
            </Button>
          </div>
        </div>
      </section>
    )
  }

  private configureGit = () => {
    this.props.advance(WelcomeStep.ConfigureGit)
  }
}
