import { StatsDatabase, ILaunchStats, IDailyMeasures } from './stats-database'
import {
  Account,
  isDotComAccount,
} from '../../models/account'
import { Repository } from '../../models/repository'
import { merge } from '../../lib/merge'
import { IUiActivityMonitor } from '../../ui/lib/ui-activity-monitor'
import { Disposable } from 'event-kit'
import { assertNever } from '../fatal-error'
import {
  setNumber,
  getBoolean,
  setBoolean,
  getNumberArray,
  setNumberArray,
} from '../local-storage'
import { PushOptions } from '../git'
import { MultiCommitOperationKind } from '../../models/multi-commit-operation'
import { ValidNotificationPullRequestReviewState } from '../valid-notification-pull-request-review'
import { getUserAgent } from '../http'

type PullRequestReviewStatFieldInfix =
  | 'Approved'
  | 'ChangesRequested'
  | 'Commented'

type PullRequestReviewStatFieldSuffix =
  | 'NotificationCount'
  | 'NotificationClicked'
  | 'DialogSwitchToPullRequestCount'

type PullRequestReviewStatField =
  `pullRequestReview${PullRequestReviewStatFieldInfix}${PullRequestReviewStatFieldSuffix}`

const StatsEndpoint = 'https://central.github.com/api/usage/desktop'

/** The URL to the stats samples page. */
export const SamplesURL = 'https://desktop.github.com/usage-data/'

/** The localStorage key for whether the user has opted out. */
const StatsOptOutKey = 'stats-opt-out'

/** Have we successfully sent the stats opt-in? */
const HasSentOptInPingKey = 'has-sent-stats-opt-in-ping'

const WelcomeWizardInitiatedAtKey = 'welcome-wizard-initiated-at'
const WelcomeWizardCompletedAtKey = 'welcome-wizard-terminated-at'
const FirstRepositoryAddedAtKey = 'first-repository-added-at'
const FirstRepositoryClonedAtKey = 'first-repository-cloned-at'
const FirstRepositoryCreatedAtKey = 'first-repository-created-at'
const FirstCommitCreatedAtKey = 'first-commit-created-at'
const FirstPushToGitHubAtKey = 'first-push-to-github-at'
const FirstNonDefaultBranchCheckoutAtKey =
  'first-non-default-branch-checkout-at'
const RepositoriesCommittedInWithoutWriteAccessKey =
  'repositories-committed-in-without-write-access'

const DefaultDailyMeasures: IDailyMeasures = {
  commits: 0,
  partialCommits: 0,
  openShellCount: 0,
  coAuthoredCommits: 0,
  commitsUndoneWithChanges: 0,
  commitsUndoneWithoutChanges: 0,
  branchComparisons: 0,
  defaultBranchComparisons: 0,
  mergesInitiatedFromComparison: 0,
  updateFromDefaultBranchMenuCount: 0,
  mergeIntoCurrentBranchMenuCount: 0,
  prBranchCheckouts: 0,
  repoWithIndicatorClicked: 0,
  repoWithoutIndicatorClicked: 0,
  dotcomPushCount: 0,
  dotcomForcePushCount: 0,
  enterprisePushCount: 0,
  enterpriseForcePushCount: 0,
  externalPushCount: 0,
  externalForcePushCount: 0,
  active: false,
  mergeConflictFromPullCount: 0,
  mergeConflictFromExplicitMergeCount: 0,
  mergedWithLoadingHintCount: 0,
  mergedWithCleanMergeHintCount: 0,
  mergedWithConflictWarningHintCount: 0,
  mergeSuccessAfterConflictsCount: 0,
  mergeAbortedAfterConflictsCount: 0,
  unattributedCommits: 0,
  enterpriseCommits: 0,
  dotcomCommits: 0,
  mergeConflictsDialogDismissalCount: 0,
  anyConflictsLeftOnMergeConflictsDialogDismissalCount: 0,
  mergeConflictsDialogReopenedCount: 0,
  guidedConflictedMergeCompletionCount: 0,
  unguidedConflictedMergeCompletionCount: 0,
  createPullRequestCount: 0,
  createPullRequestFromPreviewCount: 0,
  rebaseConflictsDialogDismissalCount: 0,
  rebaseConflictsDialogReopenedCount: 0,
  rebaseAbortedAfterConflictsCount: 0,
  rebaseSuccessAfterConflictsCount: 0,
  rebaseSuccessWithoutConflictsCount: 0,
  rebaseWithBranchAlreadyUpToDateCount: 0,
  pullWithRebaseCount: 0,
  pullWithDefaultSettingCount: 0,
  stashEntriesCreatedOutsideDesktop: 0,
  errorWhenSwitchingBranchesWithUncommmittedChanges: 0,
  rebaseCurrentBranchMenuCount: 0,
  stashViewedAfterCheckoutCount: 0,
  stashCreatedOnCurrentBranchCount: 0,
  stashNotViewedAfterCheckoutCount: 0,
  changesTakenToNewBranchCount: 0,
  stashRestoreCount: 0,
  stashDiscardCount: 0,
  stashViewCount: 0,
  noActionTakenOnStashCount: 0,
  suggestedStepOpenInExternalEditor: 0,
  suggestedStepOpenWorkingDirectory: 0,
  suggestedStepViewOnGitHub: 0,
  suggestedStepPublishRepository: 0,
  suggestedStepPublishBranch: 0,
  suggestedStepCreatePullRequest: 0,
  suggestedStepViewStash: 0,
  commitsToProtectedBranch: 0,
  commitsToRepositoryWithBranchProtections: 0,
  tutorialStarted: false,
  tutorialRepoCreated: false,
  tutorialEditorInstalled: false,
  tutorialBranchCreated: false,
  tutorialFileEdited: false,
  tutorialCommitCreated: false,
  tutorialBranchPushed: false,
  tutorialPrCreated: false,
  tutorialCompleted: false,
  // this is `-1` because `0` signifies "tutorial created"
  highestTutorialStepCompleted: -1,
  commitsToRepositoryWithoutWriteAccess: 0,
  forksCreated: 0,
  issueCreationWebpageOpenedCount: 0,
  tagsCreatedInDesktop: 0,
  tagsCreated: 0,
  tagsDeleted: 0,
  diffModeChangeCount: 0,
  diffOptionsViewedCount: 0,
  repositoryViewChangeCount: 0,
  unhandledRejectionCount: 0,
  cherryPickSuccessfulCount: 0,
  cherryPickViaDragAndDropCount: 0,
  cherryPickViaContextMenuCount: 0,
  dragStartedAndCanceledCount: 0,
  cherryPickConflictsEncounteredCount: 0,
  cherryPickSuccessfulWithConflictsCount: 0,
  cherryPickMultipleCommitsCount: 0,
  cherryPickUndoneCount: 0,
  cherryPickBranchCreatedCount: 0,
  amendCommitStartedCount: 0,
  amendCommitSuccessfulWithFileChangesCount: 0,
  amendCommitSuccessfulWithoutFileChangesCount: 0,
  reorderSuccessfulCount: 0,
  reorderStartedCount: 0,
  reorderConflictsEncounteredCount: 0,
  reorderSuccessfulWithConflictsCount: 0,
  reorderMultipleCommitsCount: 0,
  reorderUndoneCount: 0,
  squashConflictsEncounteredCount: 0,
  squashMultipleCommitsInvokedCount: 0,
  squashSuccessfulCount: 0,
  squashSuccessfulWithConflictsCount: 0,
  squashViaContextMenuInvokedCount: 0,
  squashViaDragAndDropInvokedCount: 0,
  squashUndoneCount: 0,
  squashMergeIntoCurrentBranchMenuCount: 0,
  squashMergeSuccessfulWithConflictsCount: 0,
  squashMergeSuccessfulCount: 0,
  squashMergeInvokedCount: 0,
  resetToCommitCount: 0,
  opensCheckRunsPopover: 0,
  viewsCheckOnline: 0,
  viewsCheckJobStepOnline: 0,
  rerunsChecks: 0,
  checksFailedNotificationCount: 0,
  checksFailedNotificationFromRecentRepoCount: 0,
  checksFailedNotificationFromNonRecentRepoCount: 0,
  checksFailedNotificationClicked: 0,
  checksFailedDialogOpenCount: 0,
  checksFailedDialogSwitchToPullRequestCount: 0,
  checksFailedDialogRerunChecksCount: 0,
  pullRequestReviewNotificationFromRecentRepoCount: 0,
  pullRequestReviewNotificationFromNonRecentRepoCount: 0,
  pullRequestReviewApprovedNotificationCount: 0,
  pullRequestReviewApprovedNotificationClicked: 0,
  pullRequestReviewApprovedDialogSwitchToPullRequestCount: 0,
  pullRequestReviewCommentedNotificationCount: 0,
  pullRequestReviewCommentedNotificationClicked: 0,
  pullRequestReviewCommentedDialogSwitchToPullRequestCount: 0,
  pullRequestReviewChangesRequestedNotificationCount: 0,
  pullRequestReviewChangesRequestedNotificationClicked: 0,
  pullRequestReviewChangesRequestedDialogSwitchToPullRequestCount: 0,
  pullRequestCommentNotificationCount: 0,
  pullRequestCommentNotificationClicked: 0,
  pullRequestCommentNotificationFromRecentRepoCount: 0,
  pullRequestCommentNotificationFromNonRecentRepoCount: 0,
  pullRequestCommentDialogSwitchToPullRequestCount: 0,
  multiCommitDiffWithUnreachableCommitWarningCount: 0,
  multiCommitDiffFromHistoryCount: 0,
  multiCommitDiffFromCompareCount: 0,
  multiCommitDiffUnreachableCommitsDialogOpenedCount: 0,
  submoduleDiffViewedFromChangesListCount: 0,
  submoduleDiffViewedFromHistoryCount: 0,
  openSubmoduleFromDiffCount: 0,
  previewedPullRequestCount: 0,
  typedInChangesFilterCount: 0,
  appliesIncludedInCommitFilterCount: 0,
  appliesExcludedFromCommitFilterCount: 0,
  appliesNewFilesChangesFilterCount: 0,
  appliesModifiedFilesChangesFilterCount: 0,
  appliesDeletedFilesChangesFilterCount: 0,
  appliesClearAllChangesListFilterCount: 0,
  adjustedFiltersForHiddenChangesCount: 0,
  enterpriseAccountCount: 0,
  generateCommitMessageButtonClickCount: 0,
  generateCommitMessageCount: 0,
  generateCommitMessageUsedVerbatimCount: 0,
  pushBlockedBySecretScanningCount: 0,
  secretsDetectedOnPushCount: 0,
  secretsDetectedOnPushBypassedCount: 0,
  secretsDetectedOnPushBypassedAsFalsePositiveCount: 0,
  secretsDetectedOnPushBypassedAsUsedInTestCount: 0,
  secretsDetectedOnPushBypassedAsWillFixLaterCount: 0,
  secretsDetectedOnPushDelegatedBypassLinkClickedCount: 0,
  secretRemediationInstructionsLinkClickedCount: 0,
}

// A subtype of IDailyMeasures filtered to contain only its numeric properties
export type NumericMeasures = {
  [P in keyof IDailyMeasures as IDailyMeasures[P] extends number
    ? P
    : never]: IDailyMeasures[P]
}

/**
 * Testable interface for StatsStore
 *
 * Note: for the moment this only contains methods that are needed for testing,
 * so fight the urge to implement every public method from StatsStore here
 *
 */
export interface IStatsStore {
  increment: (k: keyof NumericMeasures, n?: number) => Promise<void>
}

const defaultPostImplementation = (body: Record<string, any>) =>
  fetch(StatsEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'user-agent': getUserAgent(),
    },
    body: JSON.stringify(body),
  })

/** The store for the app's stats. */
export class StatsStore implements IStatsStore {
  private uiActivityMonitorSubscription: Disposable | null = null

  /** Has the user opted out of stats reporting? */
  private optOut: boolean

  public constructor(
    private readonly db: StatsDatabase,
    private readonly uiActivityMonitor: IUiActivityMonitor,
    private readonly post = defaultPostImplementation
  ) {
    const storedValue = getHasOptedOutOfStats()

    this.optOut = storedValue || false

    // If the user has set an opt out value but we haven't sent the ping yet,
    // give it a shot now.
    if (!getBoolean(HasSentOptInPingKey, false)) {
      this.sendOptInStatusPing(this.optOut, storedValue)
    }

    this.enableUiActivityMonitoring()

    window.addEventListener('unhandledrejection', async () => {
      try {
        this.increment('unhandledRejectionCount')
      } catch (err) {
        log.error(`Failed recording unhandled rejection`, err)
      }
    })
  }

  /** Report any stats which are eligible for reporting.
   *  OpenGit: Telemetry disabled — this is a no-op. */
  public async reportStats(
    accounts: ReadonlyArray<Account>,
    repositories: ReadonlyArray<Repository>
  ) {
    // OpenGit: Telemetry to central.github.com is disabled.
    return
  }

  /** Record the given launch stats. */
  public async recordLaunchStats(stats: ILaunchStats) {
    await this.db.launches.add(stats)
  }

  /**
   * Clear the stored daily stats. Not meant to be called directly. Marked as
   * public in order to enable testing of a specific scenario, see
   * stats-store-tests for more detail.
   */
  public async clearDailyStats() {
    await this.db.launches.clear()
    await this.db.dailyMeasures.clear()

    // This is a one-off, and the moment we have another computed daily measure
    // we should consider refactoring them into their own interface
    localStorage.removeItem(RepositoriesCommittedInWithoutWriteAccessKey)

    this.enableUiActivityMonitoring()
  }

  private enableUiActivityMonitoring() {
    if (this.uiActivityMonitorSubscription !== null) {
      return
    }

    this.uiActivityMonitorSubscription = this.uiActivityMonitor.onActivity(
      this.onUiActivity
    )
  }

  private disableUiActivityMonitoring() {
    if (this.uiActivityMonitorSubscription === null) {
      return
    }

    this.uiActivityMonitorSubscription.dispose()
    this.uiActivityMonitorSubscription = null
  }

  private async updateDailyMeasures<K extends keyof IDailyMeasures>(
    fn: (measures: IDailyMeasures) => Pick<IDailyMeasures, K>
  ): Promise<void> {
    const defaultMeasures = DefaultDailyMeasures
    await this.db.transaction('rw', this.db.dailyMeasures, async () => {
      const measures = await this.db.dailyMeasures.limit(1).first()
      const measuresWithDefaults = {
        ...defaultMeasures,
        ...measures,
      }
      const newMeasures = merge(measuresWithDefaults, fn(measuresWithDefaults))

      return this.db.dailyMeasures.put(newMeasures)
    })
  }

  /** Record that a commit was accomplished. */
  public async recordCommit(): Promise<void> {
    await this.increment('commits')
    createLocalStorageTimestamp(FirstCommitCreatedAtKey)
  }

  /**
   * Record that a commit was undone.
   *
   * @param cleanWorkingDirectory Whether the working directory is clean.
   */
  public recordCommitUndone = (cleanWorkingDirectory: boolean) =>
    this.increment(
      cleanWorkingDirectory
        ? 'commitsUndoneWithoutChanges'
        : 'commitsUndoneWithChanges'
    )

  /**
   * Record that the user amended a commit.
   *
   * @param withFileChanges Whether the amendment included file changes or not.
   */
  public recordAmendCommitSuccessful = (withFileChanges: boolean) =>
    this.increment(
      withFileChanges
        ? 'amendCommitSuccessfulWithFileChangesCount'
        : 'amendCommitSuccessfulWithoutFileChangesCount'
    )

  /** Record that a merge has been initiated from the `Branch -> Merge Into
   * Current Branch` menu item */
  public recordMenuInitiatedMerge = (isSquash: boolean = false) =>
    this.increment(
      isSquash
        ? 'squashMergeIntoCurrentBranchMenuCount'
        : 'mergeIntoCurrentBranchMenuCount'
    )

  public recordRepoClicked = (repoHasIndicator: boolean) =>
    this.increment(
      repoHasIndicator
        ? 'repoWithIndicatorClicked'
        : 'repoWithoutIndicatorClicked'
    )

  /** Set whether the user has opted out of stats reporting. */
  public async setOptOut(
    optOut: boolean,
    userViewedPrompt: boolean
  ): Promise<void> {
    const changed = this.optOut !== optOut

    this.optOut = optOut

    const previousValue = getBoolean(StatsOptOutKey)

    setBoolean(StatsOptOutKey, optOut)

    if (changed || userViewedPrompt) {
      await this.sendOptInStatusPing(optOut, previousValue)
    }
  }

  /** Has the user opted out of stats reporting? */
  public getOptOut(): boolean {
    return this.optOut
  }

  public async recordPush(account: Account | null, options?: PushOptions) {
    if (account === null) {
      await this.recordPushToGenericRemote(options)
    } else if (isDotComAccount(account)) {
      await this.recordPushToGitHub(options)
    } else {
      await this.recordPushToGitHubEnterprise(options)
    }
  }

  /** Record that the user pushed to GitHub.com */
  private async recordPushToGitHub(options?: PushOptions): Promise<void> {
    await this.increment(
      options && options.forceWithLease
        ? 'dotcomForcePushCount'
        : 'dotcomPushCount'
    )
    createLocalStorageTimestamp(FirstPushToGitHubAtKey)
  }

  /** Record that the user pushed to a GitHub Enterprise instance */
  private async recordPushToGitHubEnterprise(
    options?: PushOptions
  ): Promise<void> {
    await this.increment(
      options && options.forceWithLease
        ? 'enterpriseForcePushCount'
        : 'enterprisePushCount'
    )

    // Note, this is not a typo. We track both GitHub.com and GitHub Enterprise
    // under the same key
    createLocalStorageTimestamp(FirstPushToGitHubAtKey)
  }

  /** Record that the user pushed to a generic remote */
  private recordPushToGenericRemote = (options?: PushOptions) =>
    this.increment(
      options && options.forceWithLease
        ? 'externalForcePushCount'
        : 'externalPushCount'
    )

  public recordWelcomeWizardInitiated() {
    setNumber(WelcomeWizardInitiatedAtKey, Date.now())
    localStorage.removeItem(WelcomeWizardCompletedAtKey)
  }

  public recordWelcomeWizardTerminated() {
    setNumber(WelcomeWizardCompletedAtKey, Date.now())
  }

  public recordAddExistingRepository() {
    createLocalStorageTimestamp(FirstRepositoryAddedAtKey)
  }

  public recordCloneRepository() {
    createLocalStorageTimestamp(FirstRepositoryClonedAtKey)
  }

  public recordCreateRepository() {
    createLocalStorageTimestamp(FirstRepositoryCreatedAtKey)
  }

  public recordNonDefaultBranchCheckout() {
    createLocalStorageTimestamp(FirstNonDefaultBranchCheckoutAtKey)
  }

  /** Record the number of stash entries created outside of Desktop for the day
   * */
  public addStashEntriesCreatedOutsideDesktop = (stashCount: number) =>
    this.increment('stashEntriesCreatedOutsideDesktop', stashCount)

  private onUiActivity = async () => {
    this.disableUiActivityMonitoring()

    return this.updateDailyMeasures(m => ({ active: true }))
  }

  /*
   * Onboarding tutorial metrics
   */

  /**
   * Onboarding tutorial has been started, the user has clicked the button to
   * start the onboarding tutorial.
   */
  public recordTutorialStarted() {
    return this.updateDailyMeasures(() => ({ tutorialStarted: true }))
  }

  /** Onboarding tutorial has been successfully created */
  public recordTutorialRepoCreated() {
    return this.updateDailyMeasures(() => ({ tutorialRepoCreated: true }))
  }

  public recordTutorialEditorInstalled() {
    return this.updateDailyMeasures(() => ({ tutorialEditorInstalled: true }))
  }

  public recordTutorialBranchCreated() {
    return this.updateDailyMeasures(() => ({
      tutorialEditorInstalled: true,
      tutorialBranchCreated: true,
    }))
  }

  public recordTutorialFileEdited() {
    return this.updateDailyMeasures(() => ({
      tutorialEditorInstalled: true,
      tutorialBranchCreated: true,
      tutorialFileEdited: true,
    }))
  }

  public recordTutorialCommitCreated() {
    return this.updateDailyMeasures(() => ({
      tutorialEditorInstalled: true,
      tutorialBranchCreated: true,
      tutorialFileEdited: true,
      tutorialCommitCreated: true,
    }))
  }

  public recordTutorialBranchPushed() {
    return this.updateDailyMeasures(() => ({
      tutorialEditorInstalled: true,
      tutorialBranchCreated: true,
      tutorialFileEdited: true,
      tutorialCommitCreated: true,
      tutorialBranchPushed: true,
    }))
  }

  public recordTutorialPrCreated() {
    return this.updateDailyMeasures(() => ({
      tutorialEditorInstalled: true,
      tutorialBranchCreated: true,
      tutorialFileEdited: true,
      tutorialCommitCreated: true,
      tutorialBranchPushed: true,
      tutorialPrCreated: true,
    }))
  }

  public recordTutorialCompleted() {
    return this.updateDailyMeasures(() => ({ tutorialCompleted: true }))
  }

  public recordHighestTutorialStepCompleted(step: number) {
    return this.updateDailyMeasures(m => ({
      highestTutorialStepCompleted: Math.max(
        step,
        m.highestTutorialStepCompleted
      ),
    }))
  }

  /**
   * Record that the user made a commit in a repository they don't have `write`
   * access to. Dedupes based on the database ID provided
   *
   * @param gitHubRepositoryDbId database ID for the GitHubRepository of the
   *                             local repo this commit was made in
   */
  public recordRepositoryCommitedInWithoutWriteAccess(
    gitHubRepositoryDbId: number
  ) {
    const ids = getNumberArray(RepositoriesCommittedInWithoutWriteAccessKey)
    if (!ids.includes(gitHubRepositoryDbId)) {
      setNumberArray(RepositoriesCommittedInWithoutWriteAccessKey, [
        ...ids,
        gitHubRepositoryDbId,
      ])
    }
  }

  private recordSquashUndone = () => this.increment('squashUndoneCount')

  public async recordOperationConflictsEncounteredCount(
    kind: MultiCommitOperationKind
  ): Promise<void> {
    switch (kind) {
      case MultiCommitOperationKind.Squash:
        return this.increment('squashConflictsEncounteredCount')
      case MultiCommitOperationKind.Reorder:
        return this.increment('reorderConflictsEncounteredCount')
      case MultiCommitOperationKind.Rebase:
        // ignored because rebase records different stats
        return
      case MultiCommitOperationKind.CherryPick:
      case MultiCommitOperationKind.Merge:
        log.error(
          `[recordOperationConflictsEncounteredCount] - Operation not supported: ${kind}`
        )
        return
      default:
        return assertNever(kind, `Unknown operation kind of ${kind}.`)
    }
  }

  public async recordOperationSuccessful(
    kind: MultiCommitOperationKind
  ): Promise<void> {
    switch (kind) {
      case MultiCommitOperationKind.Squash:
        return this.increment('squashSuccessfulCount')
      case MultiCommitOperationKind.Reorder:
        return this.increment('reorderSuccessfulCount')
      case MultiCommitOperationKind.CherryPick:
        return this.increment('cherryPickSuccessfulCount')
      case MultiCommitOperationKind.Rebase:
        // ignored because rebase records different stats
        return
      case MultiCommitOperationKind.Merge:
        log.error(
          `[recordOperationSuccessful] - Operation not supported: ${kind}`
        )
        return
      default:
        return assertNever(kind, `Unknown operation kind of ${kind}.`)
    }
  }

  public async recordOperationSuccessfulWithConflicts(
    kind: MultiCommitOperationKind
  ): Promise<void> {
    switch (kind) {
      case MultiCommitOperationKind.Squash:
        return this.increment('squashSuccessfulWithConflictsCount')
      case MultiCommitOperationKind.Reorder:
        return this.increment('reorderSuccessfulWithConflictsCount')
      case MultiCommitOperationKind.Rebase:
        return this.increment('rebaseSuccessAfterConflictsCount')
      case MultiCommitOperationKind.CherryPick:
      case MultiCommitOperationKind.Merge:
        log.error(
          `[recordOperationSuccessfulWithConflicts] - Operation not supported: ${kind}`
        )
        return
      default:
        return assertNever(kind, `Unknown operation kind of ${kind}.`)
    }
  }

  public async recordOperationUndone(
    kind: MultiCommitOperationKind
  ): Promise<void> {
    switch (kind) {
      case MultiCommitOperationKind.Squash:
        return this.recordSquashUndone()
      case MultiCommitOperationKind.Reorder:
        return this.increment('reorderUndoneCount')
      case MultiCommitOperationKind.CherryPick:
        return this.increment('cherryPickUndoneCount')
      case MultiCommitOperationKind.Rebase:
      case MultiCommitOperationKind.Merge:
        log.error(`[recordOperationUndone] - Operation not supported: ${kind}`)
        return
      default:
        return assertNever(kind, `Unknown operation kind of ${kind}.`)
    }
  }

  // Generates the stat field name for the given PR review type and suffix.
  private getStatFieldForRequestReviewState(
    reviewType: ValidNotificationPullRequestReviewState,
    suffix: PullRequestReviewStatFieldSuffix
  ): PullRequestReviewStatField {
    const infixMap: Record<
      ValidNotificationPullRequestReviewState,
      PullRequestReviewStatFieldInfix
    > = {
      CHANGES_REQUESTED: 'ChangesRequested',
      APPROVED: 'Approved',
      COMMENTED: 'Commented',
    }

    return `pullRequestReview${infixMap[reviewType]}${suffix}`
  }

  // Generic method to record stats related to Pull Request review
  // notifications.
  private recordPullRequestReviewStat(
    reviewType: ValidNotificationPullRequestReviewState,
    suffix: PullRequestReviewStatFieldSuffix
  ) {
    const statField = this.getStatFieldForRequestReviewState(reviewType, suffix)
    return this.increment(statField)
  }

  public recordPullRequestReviewNotificationShown(
    reviewType: ValidNotificationPullRequestReviewState
  ): Promise<void> {
    return this.recordPullRequestReviewStat(reviewType, 'NotificationCount')
  }

  public recordPullRequestReviewNotificationClicked(
    reviewType: ValidNotificationPullRequestReviewState
  ): Promise<void> {
    return this.recordPullRequestReviewStat(reviewType, 'NotificationClicked')
  }

  public recordPullRequestReviewDialogSwitchToPullRequest(
    reviewType: ValidNotificationPullRequestReviewState
  ): Promise<void> {
    return this.recordPullRequestReviewStat(
      reviewType,
      'DialogSwitchToPullRequestCount'
    )
  }

  public increment = (k: keyof NumericMeasures, n = 1) =>
    this.updateDailyMeasures(
      m => ({ [k]: m[k] + n } as Pick<IDailyMeasures, keyof NumericMeasures>)
    )

  /**
   * Send opt-in ping with details of previous stored value (if known)
   *
   * @param optOut        Whether or not the user has opted out of usage
   *                      reporting.
   * @param previousValue The raw, current value stored for the "stats-opt-out"
   *                      localStorage key, or undefined if no previously stored
   *                      value exists.
   */
  private async sendOptInStatusPing(
    optOut: boolean,
    previousValue: boolean | undefined
  ): Promise<void> {
    // The analytics pipeline expects us to submit `optIn` but we track `optOut`
    // so we need to invert the value before we send it.
    const optIn = !optOut
    const previousOptInValue =
      previousValue === undefined ? null : !previousValue
    const direction = optIn ? 'in' : 'out'

    try {
      const response = await this.post({
        eventType: 'ping',
        optIn,
        previousOptInValue,
      })
      if (!response.ok) {
        throw new Error(
          `Unexpected status: ${response.statusText} (${response.status})`
        )
      }

      setBoolean(HasSentOptInPingKey, true)

      log.info(`Opt ${direction} reported.`)
    } catch (e) {
      log.error(`Error reporting opt ${direction}:`, e)
    }
  }
}

/**
 * Store the current date (in unix time) in localStorage.
 *
 * If the provided key already exists it will not be overwritten.
 */
function createLocalStorageTimestamp(key: string) {
  if (localStorage.getItem(key) === null) {
    setNumber(key, Date.now())
  }
}

/**
 * Return a value indicating whether the user has opted out of stats reporting
 * or not.
 */
export function getHasOptedOutOfStats() {
  return getBoolean(StatsOptOutKey)
}
