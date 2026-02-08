import * as React from 'react'
import classNames from 'classnames'

import { Dispatcher } from '../dispatcher'
import { encodePathAsUrl } from '../../lib/path'
import { Account } from '../../models/account'
import { assertNever } from '../../lib/fatal-error'
import { Start } from './start'
import { ConfigureGit } from './configure-git'
import { UiView } from '../ui-view'
import { getGlobalConfigValue } from '../../lib/git'

/** The steps along the Welcome flow. */
export enum WelcomeStep {
  Start = 'Start',
  /** @deprecated Kept for type compatibility, not used in OpenGit */
  SignInToDotComWithBrowser = 'SignInToDotComWithBrowser',
  /** @deprecated Kept for type compatibility, not used in OpenGit */
  SignInToEnterprise = 'SignInToEnterprise',
  ConfigureGit = 'ConfigureGit',
}

interface IWelcomeProps {
  readonly dispatcher: Dispatcher
  readonly accounts: ReadonlyArray<Account>
}

interface IWelcomeState {
  readonly currentStep: WelcomeStep

  /**
   * Whether the welcome wizard is terminating. Used
   * in order to delay the actual dismissal of the view
   * such that the exit animations (defined in css) have
   * time to run to completion.
   */
  readonly exiting: boolean

  readonly globalUserName?: string
  readonly globalUserEmail?: string
}

// Note that we're reusing the welcome illustrations in the crash process, any
// changes to these will have to be reflected in the crash process as well.
const WelcomeRightImageUri = encodePathAsUrl(
  __dirname,
  'static/welcome-illustration-right.svg'
)
export const WelcomeLeftTopImageUri = encodePathAsUrl(
  __dirname,
  'static/welcome-illustration-left-top.svg'
)
export const WelcomeLeftBottomImageUri = encodePathAsUrl(
  __dirname,
  'static/welcome-illustration-left-bottom.svg'
)

/** The Welcome flow. */
export class Welcome extends React.Component<IWelcomeProps, IWelcomeState> {
  public constructor(props: IWelcomeProps) {
    super(props)

    this.state = {
      currentStep: WelcomeStep.Start,
      exiting: false,
    }
  }

  public componentDidMount() {
    this.props.dispatcher.recordWelcomeWizardInitiated()
    this.refreshGlobalGitAuthorInfo()
  }

  public refreshGlobalGitAuthorInfo() {
    Promise.all([
      getGlobalConfigValue('user.name'),
      getGlobalConfigValue('user.email'),
    ])
      .then(([globalUserName, globalUserEmail]) => {
        this.setState({
          globalUserName: globalUserName ?? undefined,
          globalUserEmail: globalUserEmail ?? undefined,
        })
      })
      .catch(e => {
        log.error(`[Welcome] error while fetching global user config`, e)
      })
  }

  private getComponentForCurrentStep() {
    const step = this.state.currentStep

    switch (step) {
      case WelcomeStep.Start:
      case WelcomeStep.SignInToDotComWithBrowser:
      case WelcomeStep.SignInToEnterprise:
        return <Start advance={this.advanceToStep} />

      case WelcomeStep.ConfigureGit:
        return (
          <ConfigureGit
            advance={this.advanceToStep}
            accounts={this.props.accounts}
            done={this.done}
            globalUserName={this.state.globalUserName}
            globalUserEmail={this.state.globalUserEmail}
          />
        )

      default:
        return assertNever(step, `Unknown welcome step: ${step}`)
    }
  }

  private advanceToStep = (step: WelcomeStep) => {
    log.info(`[Welcome] advancing to step: ${step}`)

    // Refresh the global user name and email if we're moving to the
    // ConfigureGit step.
    if (step === WelcomeStep.ConfigureGit) {
      this.refreshGlobalGitAuthorInfo()
    }

    this.setState({ currentStep: step })
  }

  private done = () => {
    // Add a delay so that the exit animations (defined in css)
    // have time to run to completion.
    this.setState({ exiting: true }, () => {
      setTimeout(() => {
        this.props.dispatcher.endWelcomeFlow()
      }, 250)
    })
  }

  public render() {
    const className = classNames({
      exiting: this.state.exiting,
    })
    return (
      <UiView id="welcome" className={className}>
        <div className="welcome-left">
          <div className="welcome-content">
            {this.getComponentForCurrentStep()}
            <img
              className="welcome-graphic-top"
              src={WelcomeLeftTopImageUri}
              alt=""
            />
            <img
              className="welcome-graphic-bottom"
              src={WelcomeLeftBottomImageUri}
              alt=""
            />
          </div>
        </div>

        <div className="welcome-right">
          <img className="welcome-graphic" src={WelcomeRightImageUri} alt="" />
        </div>
      </UiView>
    )
  }
}
