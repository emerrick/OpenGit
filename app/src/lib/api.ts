import * as URL from 'url'
import { Account } from '../models/account'

import { GitProtocol } from './remote-parsing'
import {
  isDotCom,
  isGHE,
} from './endpoint-capabilities'
import { BypassReasonType } from '../ui/secret-scanning/bypass-push-protection-dialog'

const envEndpoint = process.env['DESKTOP_GITHUB_DOTCOM_API_ENDPOINT']
const envHTMLURL = process.env['DESKTOP_GITHUB_DOTCOM_HTML_URL']

type AffiliationFilter =
  | 'owner'
  | 'collaborator'
  | 'organization_member'
  | 'owner,collabor'
  | 'owner,organization_member'
  | 'collaborator,organization_member'
  | 'owner,collaborator,organization_member'

/** Copilot-related info relevant to Desktop */
type UserCopilotInfo = {
  readonly isCopilotDesktopEnabled: boolean
  readonly copilotEndpoint: string
}

/**
 * Optional set of configurable settings for the fetchAll method
 */
interface IFetchAllOptions<T> {
  /**
   * The number of results to ask for on each page when making
   * requests to paged API endpoints.
   */
  perPage?: number

  /**
   * An optional predicate which determines whether or not to
   * continue loading results from the API. This can be used
   * to put a limit on the number of results to return from
   * a paged API resource.
   *
   * As an example, to stop loading results after 500 results:
   *
   * `(results) => results.length < 500`
   *
   * @param results  All results retrieved thus far
   */
  continue?: (results: ReadonlyArray<T>) => boolean | Promise<boolean>

  /**
   * An optional callback which is invoked after each page of results is loaded
   * from the API. This can be used to enable streaming of results.
   *
   * @param page The last fetched page of results
   */
  onPage?: (page: ReadonlyArray<T>) => void

  /**
   * Calculate the next page path given the response.
   *
   * Optional, see `getNextPagePathFromLink` for the default
   * implementation.
   */
  getNextPagePath?: (response: Response) => string | null

  /**
   * Whether or not to silently suppress request errors and
   * return the results retrieved thus far. If this field is
   * `true` the fetchAll method will suppress errors (this is
   * also the default behavior if no value is provided for
   * this field). Setting this field to false will cause the
   * fetchAll method to throw if it encounters an API error
   * on any page.
   */
  suppressErrors?: boolean
}

const ClientID = process.env.TEST_ENV ? '' : __OAUTH_CLIENT_ID__
const ClientSecret = process.env.TEST_ENV ? '' : __OAUTH_SECRET__

if (!ClientID || !ClientID.length || !ClientSecret || !ClientSecret.length) {
  log.warn(
    `DESKTOP_OAUTH_CLIENT_ID and/or DESKTOP_OAUTH_CLIENT_SECRET is undefined. You won't be able to authenticate new users.`
  )
}

export type GitHubAccountType = 'User' | 'Organization'

/**
 * Information about a repository as returned by the GitHub API.
 */
export interface IAPIRepository {
  readonly clone_url: string
  readonly ssh_url: string
  readonly html_url: string
  readonly name: string
  readonly owner: IAPIIdentity
  readonly private: boolean
  readonly fork: boolean
  readonly default_branch: string
  readonly pushed_at: string
  readonly has_issues: boolean
  readonly archived: boolean
}

/** Information needed to clone a repository. */
export interface IAPIRepositoryCloneInfo {
  /** Canonical clone URL of the repository. */
  readonly url: string

  /**
   * Default branch of the repository, if any. This is usually either retrieved
   * from the API for GitHub repositories, or undefined for other repositories.
   */
  readonly defaultBranch?: string
}

export interface IAPIFullRepository extends IAPIRepository {
  /**
   * The parent repository of a fork.
   *
   * HACK: BEWARE: This is defined as `parent: IAPIRepository | undefined`
   * rather than `parent?: ...` even though the parent property is actually
   * optional in the API response. So we're lying a bit to the type system
   * here saying that this will be present but the only time the difference
   * between omission and explicit undefined matters is when using constructs
   * like `x in y` or `y.hasOwnProperty('x')` which we do very rarely.
   *
   * Without at least one non-optional type in this interface TypeScript will
   * happily let us pass an IAPIRepository in place of an IAPIFullRepository.
   */
  readonly parent: IAPIRepository | undefined

  /**
   * The high-level permissions that the currently authenticated
   * user enjoys for the repository. Undefined if the API call
   * was made without an authenticated user or if the repository
   * isn't the primarily requested one (i.e. if this is the parent
   * repository of the requested repository)
   *
   * The permissions hash will also be omitted when the repository
   * information is embedded within another object such as a pull
   * request (base.repo or head.repo).
   *
   * In other words, the only time when the permissions property
   * will be present is when explicitly fetching the repository
   * through the `/repos/user/name` endpoint or similar.
   */
  readonly permissions?: IAPIRepositoryPermissions
}

/*
 * Information about how the user is permitted to interact with a repository.
 */
export interface IAPIRepositoryPermissions {
  readonly admin: boolean
  /* aka 'write' */
  readonly push: boolean
  /* aka 'read' */
  readonly pull: boolean
}

/**
 * Information about a commit as returned by the GitHub API.
 */
export interface IAPICommit {
  readonly sha: string
  readonly author: IAPIIdentity | {} | null
}

/**
 * Entity returned by the `/user/orgs` endpoint.
 *
 * Because this is specific to one endpoint it omits the `type` member from
 * `IAPIIdentity` that callers might expect.
 */
export interface IAPIOrganization {
  readonly id: number
  readonly url: string
  readonly login: string
  readonly avatar_url: string
}

/**
 * Minimum subset of an identity returned by the GitHub API
 */
export interface IAPIIdentity {
  readonly id: number
  readonly login: string
  readonly avatar_url: string
  readonly html_url: string
  readonly type: GitHubAccountType
}

/**
 * Complete identity details returned in some situations by the GitHub API.
 *
 * If you are not sure what is returned as part of an API response, you should
 * use `IAPIIdentity` as that contains the known subset of an identity and does
 * not cover scenarios where privacy settings of a user control what information
 * is returned.
 */
interface IAPIFullIdentity {
  readonly id: number
  readonly html_url: string
  readonly login: string
  readonly avatar_url: string

  /**
   * The user's real name or null if the user hasn't provided
   * a real name for their public profile.
   */
  readonly name: string | null

  /**
   * The email address for this user or null if the user has not
   * specified a public email address in their profile.
   */
  readonly email: string | null
  readonly type: GitHubAccountType
  readonly plan?: {
    readonly name: string
  }
}

/** The users we get from the mentionables endpoint. */
export interface IAPIMentionableUser {
  /**
   * A url to an avatar image chosen by the user
   */
  readonly avatar_url: string

  /**
   * The user's attributable email address or null if the
   * user doesn't have an email address that they can be
   * attributed by
   */
  readonly email: string | null

  /**
   * The username or "handle" of the user
   */
  readonly login: string

  /**
   * The user's real name (or at least the name that the user
   * has configured to be shown) or null if the user hasn't provided
   * a real name for their public profile.
   */
  readonly name: string | null
}

/** Represents the commit details (title and description) generated by Copilot */
interface ICopilotCommitMessage {
  readonly title: string
  readonly description: string
}

/**
 * Error thrown by `fetchUpdatedPullRequests` when receiving more results than
 * what the `maxResults` parameter allows for.
 */
export class MaxResultsError extends Error {}

/**
 * `null` can be returned by the API for legacy reasons. A non-null value is
 * set for the primary email address currently, but in the future visibility
 * may be defined for each email address.
 */
export type EmailVisibility = 'public' | 'private' | null

/**
 * Information about a user's email as returned by the GitHub API.
 */
export interface IAPIEmail {
  readonly email: string
  readonly verified: boolean
  readonly primary: boolean
  readonly visibility: EmailVisibility
}

/** Information about an issue as returned by the GitHub API. */
export interface IAPIIssue {
  readonly number: number
  readonly title: string
  readonly state: 'open' | 'closed'
  readonly updated_at: string
}

/** The combined state of a ref. */
export type APIRefState = 'failure' | 'pending' | 'success' | 'error'

/** The overall status of a check run */
export enum APICheckStatus {
  Queued = 'queued',
  InProgress = 'in_progress',
  Completed = 'completed',
}

/** The conclusion of a completed check run */
export enum APICheckConclusion {
  ActionRequired = 'action_required',
  Canceled = 'cancelled',
  TimedOut = 'timed_out',
  Failure = 'failure',
  Neutral = 'neutral',
  Success = 'success',
  Skipped = 'skipped',
  Stale = 'stale',
}

/**
 * The API response for a combined view of a commit
 * status for a given ref
 */
export interface IAPIRefStatusItem {
  readonly state: APIRefState
  readonly target_url: string | null
  readonly description: string
  readonly context: string
  readonly id: number
}

/** The API response to a ref status request. */
export interface IAPIRefStatus {
  readonly state: APIRefState
  readonly total_count: number
  readonly statuses: ReadonlyArray<IAPIRefStatusItem>
}

export interface IAPIRefCheckRun {
  readonly id: number
  readonly url: string
  readonly status: APICheckStatus
  readonly conclusion: APICheckConclusion | null
  readonly name: string
  readonly check_suite: IAPIRefCheckRunCheckSuite
  readonly app: IAPIRefCheckRunApp
  readonly completed_at: string
  readonly started_at: string
  readonly html_url: string
  readonly pull_requests: ReadonlyArray<IAPIPullRequest>
}

// NB. Only partially mapped
export interface IAPIRefCheckRunApp {
  readonly name: string
}

// NB. Only partially mapped
export interface IAPIRefCheckRunOutput {
  readonly title: string | null
  readonly summary: string | null
  readonly text: string | null
}

export interface IAPIRefCheckRunCheckSuite {
  readonly id: number
}

export interface IAPICheckSuite {
  readonly id: number
  readonly rerequestable: boolean
  readonly runs_rerequestable: boolean
  readonly status: APICheckStatus
  readonly created_at: string
}

export interface IAPIRefCheckRuns {
  readonly total_count: number
  readonly check_runs: IAPIRefCheckRun[]
}

interface IAPIWorkflowRuns {
  readonly total_count: number
  readonly workflow_runs: ReadonlyArray<IAPIWorkflowRun>
}
// NB. Only partially mapped
export interface IAPIWorkflowRun {
  readonly id: number
  /**
   * The workflow_id is the id of the workflow not the individual run.
   **/
  readonly workflow_id: number
  readonly cancel_url: string
  readonly created_at: string
  readonly logs_url: string
  readonly name: string
  readonly rerun_url: string
  readonly check_suite_id: number
  readonly event: string
}

export interface IAPIWorkflowJobs {
  readonly total_count: number
  readonly jobs: IAPIWorkflowJob[]
}

// NB. Only partially mapped
export interface IAPIWorkflowJob {
  readonly id: number
  readonly name: string
  readonly status: APICheckStatus
  readonly conclusion: APICheckConclusion | null
  readonly completed_at: string
  readonly started_at: string
  readonly steps: ReadonlyArray<IAPIWorkflowJobStep>
  readonly html_url: string
}

export interface IAPIWorkflowJobStep {
  readonly name: string
  readonly number: number
  readonly status: APICheckStatus
  readonly conclusion: APICheckConclusion | null
  readonly completed_at: string
  readonly started_at: string
  readonly log: string
}

/** Protected branch information returned by the GitHub API */
export interface IAPIPushControl {
  /**
   * What status checks are required before merging?
   *
   * Empty array if user is admin and branch is not admin-enforced
   */
  required_status_checks: Array<string>

  /**
   * How many reviews are required before merging?
   *
   * 0 if user is admin and branch is not admin-enforced
   */
  required_approving_review_count: number

  /**
   * Is user permitted?
   *
   * Always `true` for admins.
   * `true` if `Restrict who can push` is not enabled.
   * `true` if `Restrict who can push` is enabled and user is in list.
   * `false` if `Restrict who can push` is enabled and user is not in list.
   */
  allow_actor: boolean

  /**
   * Currently unused properties
   */
  pattern: string | null
  required_signatures: boolean
  required_linear_history: boolean
  allow_deletions: boolean
  allow_force_pushes: boolean
}

/** Branch information returned by the GitHub API */
export interface IAPIBranch {
  /**
   * The name of the branch stored on the remote.
   *
   * NOTE: this is NOT a fully-qualified ref (i.e. `refs/heads/main`)
   */
  readonly name: string
  /**
   * Branch protection settings:
   *
   *  - `true` indicates that the branch is protected in some way
   *  - `false` indicates no branch protection set
   */
  readonly protected: boolean
}

/** Repository rule information returned by the GitHub API */
export interface IAPIRepoRule {
  /**
   * The ID of the ruleset this rule is configured in.
   */
  readonly ruleset_id: number

  /**
   * The type of the rule.
   */
  readonly type: APIRepoRuleType

  /**
   * The parameters that apply to the rule if it is a metadata rule.
   * Other rule types may have parameters, but they are not used in
   * this app so they are ignored. Do not attempt to use this field
   * unless you know `type` matches a metadata rule type.
   */
  readonly parameters?: IAPIRepoRuleMetadataParameters
}

/**
 * A non-exhaustive list of rules that can be configured. Only the rule
 * types used by this app are included.
 */
export enum APIRepoRuleType {
  Creation = 'creation',
  Update = 'update',
  RequiredDeployments = 'required_deployments',
  RequiredSignatures = 'required_signatures',
  RequiredStatusChecks = 'required_status_checks',
  PullRequest = 'pull_request',
  CommitMessagePattern = 'commit_message_pattern',
  CommitAuthorEmailPattern = 'commit_author_email_pattern',
  CommitterEmailPattern = 'committer_email_pattern',
  BranchNamePattern = 'branch_name_pattern',
}

/**
 * A ruleset returned from the GitHub API's "get all rulesets for a repo" endpoint.
 * This endpoint returns a slimmed-down version of the full ruleset object, though
 * only the ID is used.
 */
export interface IAPISlimRepoRuleset {
  readonly id: number
}

/**
 * A ruleset returned from the GitHub API's "get a ruleset for a repo" endpoint.
 */
export interface IAPIRepoRuleset extends IAPISlimRepoRuleset {
  /**
   * Whether the user making the API request can bypass the ruleset.
   */
  readonly current_user_can_bypass: 'always' | 'pull_requests_only' | 'never'
}

/**
 * Metadata parameters for a repo rule metadata rule.
 */
export interface IAPIRepoRuleMetadataParameters {
  /**
   * User-supplied name/description of the rule
   */
  name: string

  /**
   * Whether the operator is negated. For example, if `true`
   * and `operator` is `starts_with`, then the rule
   * will be negated to 'does not start with'.
   */
  negate: boolean

  /**
   * The pattern to match against. If the operator is 'regex', then
   * this is a regex string match. Otherwise, it is a raw string match
   * of the type specified by `operator` with no additional parsing.
   */
  pattern: string

  /**
   * The type of match to use for the pattern. For example, `starts_with`
   * means `pattern` must be at the start of the string.
   */
  operator: APIRepoRuleMetadataOperator
}

export enum APIRepoRuleMetadataOperator {
  StartsWith = 'starts_with',
  EndsWith = 'ends_with',
  Contains = 'contains',
  RegexMatch = 'regex',
}

interface IAPIPullRequestRef {
  readonly ref: string
  readonly sha: string

  /**
   * The repository in which this ref lives. It could be null if the repository
   * has been deleted since the PR was opened.
   */
  readonly repo: IAPIRepository | null
}

/** Information about a pull request as returned by the GitHub API. */
export interface IAPIPullRequest {
  readonly number: number
  readonly title: string
  readonly created_at: string
  readonly updated_at: string
  readonly user: IAPIIdentity
  readonly head: IAPIPullRequestRef
  readonly base: IAPIPullRequestRef
  readonly body: string
  readonly state: 'open' | 'closed'
  readonly draft?: boolean
}

/** Information about a pull request review as returned by the GitHub API. */
export interface IAPIPullRequestReview {
  readonly id: number
  readonly user: IAPIIdentity
  readonly body: string
  readonly html_url: string
  readonly submitted_at: string
  readonly state:
    | 'APPROVED'
    | 'DISMISSED'
    | 'PENDING'
    | 'COMMENTED'
    | 'CHANGES_REQUESTED'
}

/** Represents both issue comments and PR review comments */
export interface IAPIComment {
  readonly id: number
  readonly body: string
  readonly html_url: string
  readonly user: IAPIIdentity
  readonly created_at: string
}

/** The response we receive from fetching mentionables. */
interface IAPIMentionablesResponse {
  readonly etag: string | undefined
  readonly users: ReadonlyArray<IAPIMentionableUser>
}

/**
 * Parses the Link header from GitHub and returns the 'next' path
 * if one is present.
 *
 * If no link rel next header is found this method returns null.
 */
function getNextPagePathFromLink(response: Response): string | null {
  const linkHeader = response.headers.get('Link')

  if (!linkHeader) {
    return null
  }

  for (const part of linkHeader.split(',')) {
    // https://github.com/philschatz/octokat.js/blob/5658abe442e8bf405cfda1c72629526a37554613/src/plugins/pagination.js#L17
    const match = part.match(/<([^>]+)>; rel="([^"]+)"/)

    if (match && match[2] === 'next') {
      const nextURL = URL.parse(match[1])
      return nextURL.path || null
    }
  }

  return null
}

/**
 * Parses the 'next' Link header from GitHub using
 * `getNextPagePathFromLink`. Unlike `getNextPagePathFromLink`
 * this method will attempt to double the page size when
 * the current page index and the page size allows for it
 * leading to a ramp up in page size.
 *
 * This might sound confusing, and it is, but the primary use
 * case for this is when retrieving updated PRs. By specifying
 * an initial page size of, for example, 10 this method will
 * increase the page size to 20 once the second page has been
 * loaded. See the table below for an example. The ramp-up
 * will stop at a page size of 100 since that's the maximum
 * that the GitHub API supports.
 *
 * ```
 * |-----------|------|-----------|-----------------|
 * | Request # | Page | Page size | Retrieved items |
 * |-----------|------|-----------|-----------------|
 * | 1         | 1    | 10        | 10              |
 * | 2         | 2    | 10        | 20              |
 * | 3         | 2    | 20        | 40              |
 * | 4         | 2    | 40        | 80              |
 * | 5         | 2    | 80        | 160             |
 * | 6         | 3    | 80        | 240             |
 * | 7         | 4    | 80        | 320             |
 * | 8         | 5    | 80        | 400             |
 * | 9         | 5    | 100       | 500             |
 * |-----------|------|-----------|-----------------|
 * ```
 * This algorithm means we can have the best of both worlds.
 * If there's a small number of changed pull requests since
 * our last update we'll do small requests that use minimal
 * bandwidth but if we encounter a repository where a lot
 * of PRs have changed since our last fetch (like a very
 * active repository or one we haven't fetched in a long time)
 * we'll spool up our page size in just a few requests and load
 * in bulk.
 *
 * As an example I used a very active internal repository and
 * asked for all PRs updated in the last 24 hours which was 320.
 * With the previous regime of fetching with a page size of 10
 * that obviously took 32 requests. With this new regime it
 * would take 7.
 */
export function getNextPagePathWithIncreasingPageSize(response: Response) {
  const nextPath = getNextPagePathFromLink(response)

  if (!nextPath) {
    return null
  }

  const { pathname, query } = URL.parse(nextPath, true)
  const { per_page, page } = query

  const pageSize = typeof per_page === 'string' ? parseInt(per_page, 10) : NaN
  const pageNumber = typeof page === 'string' ? parseInt(page, 10) : NaN

  if (!pageSize || !pageNumber) {
    return nextPath
  }

  // Confusing, but we're looking at the _next_ page path here
  // so the current is whatever came before it.
  const currentPage = pageNumber - 1

  // Number of received items thus far
  const received = currentPage * pageSize

  // Can't go above 100, that's the max the API will allow.
  const nextPageSize = Math.min(100, pageSize * 2)

  // Have we received exactly the amount of items
  // such that doubling the page size and loading the
  // second page would seamlessly fit? No sense going
  // above 100 since that's the max the API supports
  if (pageSize !== nextPageSize && received % nextPageSize === 0) {
    query.per_page = `${nextPageSize}`
    query.page = `${received / nextPageSize + 1}`
    return URL.format({ pathname, query })
  }

  return nextPath
}

interface IAPIAliveSignedChannel {
  readonly channel_name: string
  readonly signed_channel: string
}

type TokenInvalidatedCallback = (endpoint: string, token: string) => void

export interface IAPICreatePushProtectionBypassResponse {
  reason: BypassReasonType
  expire_at: string
  token_type: string
}

/**
 * An object for making authenticated requests to the GitHub API
 *
 * OpenGit: All methods are stubbed to return empty/default values.
 * No network calls are made.
 */
export class API {
  private static readonly tokenInvalidatedListeners =
    new Set<TokenInvalidatedCallback>()

  public static onTokenInvalidated(callback: TokenInvalidatedCallback) {
    this.tokenInvalidatedListeners.add(callback)
  }

  /** Create a new API client from the given account. */
  public static fromAccount(account: Account): API {
    return new API(account.endpoint, account.token, account.copilotEndpoint)
  }

  /** Create a new API client for the endpoint, authenticated with the token. */
  public constructor(
    _endpoint: string,
    _token: string,
    _copilotEndpoint?: string
  ) {
    // OpenGit: parameters ignored, no API calls are made
  }

  public async getAliveDesktopChannel(): Promise<IAPIAliveSignedChannel | null> {
    return null
  }

  public async getAliveWebSocketURL(): Promise<string | null> {
    return null
  }

  public async fetchIssueComment(
    owner: string,
    name: string,
    commentId: string
  ): Promise<IAPIComment | null> {
    return null
  }

  public async fetchPullRequestReviewComment(
    owner: string,
    name: string,
    commentId: string
  ): Promise<IAPIComment | null> {
    return null
  }

  /** Fetch a repo by its owner and name. */
  public async fetchRepository(
    owner: string,
    name: string
  ): Promise<IAPIFullRepository | null> {
    return null
  }

  public async fetchRepositoryCloneInfo(
    owner: string,
    name: string,
    protocol: GitProtocol | undefined
  ): Promise<IAPIRepositoryCloneInfo | null> {
    return null
  }

  public async streamUserRepositories(
    callback: (repos: ReadonlyArray<IAPIRepository>) => void,
    affiliation?: AffiliationFilter,
    options?: IFetchAllOptions<IAPIRepository>
  ) {
    // No-op: no repositories to stream
  }

  /** Fetch the logged in account. */
  public async fetchAccount(): Promise<IAPIFullIdentity> {
    throw new Error('fetchAccount is disabled in OpenGit')
  }

  /** Fetch the current user's emails. */
  public async fetchEmails(): Promise<ReadonlyArray<IAPIEmail>> {
    return []
  }

  /** Fetch all the orgs to which the user belongs. */
  public async fetchOrgs(): Promise<ReadonlyArray<IAPIOrganization>> {
    return []
  }

  /** Create a new GitHub repository with the given properties. */
  public async createRepository(
    org: IAPIOrganization | null,
    name: string,
    description: string,
    private_: boolean
  ): Promise<IAPIFullRepository> {
    throw new Error('createRepository is disabled in OpenGit')
  }

  /** Create a new GitHub fork of this repository (owner and name) */
  public async forkRepository(
    owner: string,
    name: string
  ): Promise<IAPIFullRepository> {
    throw new Error('forkRepository is disabled in OpenGit')
  }

  public async fetchIssues(
    owner: string,
    name: string,
    state: 'open' | 'closed' | 'all',
    since: Date | null
  ): Promise<ReadonlyArray<IAPIIssue>> {
    return []
  }

  /** Fetch all open pull requests in the given repository. */
  public async fetchAllOpenPullRequests(owner: string, name: string) {
    return []
  }

  public async fetchUpdatedPullRequests(
    owner: string,
    name: string,
    since: Date,
    maxResults = 320
  ) {
    return []
  }

  public async fetchPullRequest(
    owner: string,
    name: string,
    prNumber: string
  ): Promise<IAPIPullRequest | null> {
    return null
  }

  public async fetchPullRequestReview(
    owner: string,
    name: string,
    prNumber: string,
    reviewId: string
  ): Promise<IAPIPullRequestReview | null> {
    return null
  }

  public async fetchPullRequestReviews(
    owner: string,
    name: string,
    prNumber: string
  ) {
    return []
  }

  public async fetchPullRequestReviewComments(
    owner: string,
    name: string,
    prNumber: string,
    reviewId: string
  ) {
    return []
  }

  public async fetchPullRequestComments(
    owner: string,
    name: string,
    prNumber: string
  ) {
    return []
  }

  public async fetchIssueComments(
    owner: string,
    name: string,
    issueNumber: string
  ) {
    return []
  }

  public async fetchCombinedRefStatus(
    owner: string,
    name: string,
    ref: string,
    reloadCache: boolean = false
  ): Promise<IAPIRefStatus | null> {
    return null
  }

  public async fetchRefCheckRuns(
    owner: string,
    name: string,
    ref: string,
    reloadCache: boolean = false
  ): Promise<IAPIRefCheckRuns | null> {
    return null
  }

  public async fetchPRWorkflowRunsByBranchName(
    owner: string,
    name: string,
    branchName: string
  ): Promise<IAPIWorkflowRuns | null> {
    return null
  }

  public async fetchPRActionWorkflowRunByCheckSuiteId(
    owner: string,
    name: string,
    checkSuiteId: number
  ): Promise<IAPIWorkflowRun | null> {
    return null
  }

  public async fetchWorkflowRunJobs(
    owner: string,
    name: string,
    workflowRunId: number
  ): Promise<IAPIWorkflowJobs | null> {
    return null
  }

  public async rerequestCheckSuite(
    owner: string,
    name: string,
    checkSuiteId: number
  ): Promise<boolean> {
    return false
  }

  public async rerunFailedJobs(
    owner: string,
    name: string,
    workflowRunId: number
  ): Promise<boolean> {
    return false
  }

  public async rerunJob(
    owner: string,
    name: string,
    jobId: number
  ): Promise<boolean> {
    return false
  }

  public async getAvatarToken(): Promise<string | null> {
    return null
  }

  public async fetchCheckSuite(
    owner: string,
    name: string,
    checkSuiteId: number
  ): Promise<IAPICheckSuite | null> {
    return null
  }

  public async fetchPushControl(
    owner: string,
    name: string,
    branch: string
  ): Promise<IAPIPushControl> {
    return {
      pattern: null,
      required_signatures: false,
      required_status_checks: [],
      required_approving_review_count: 0,
      required_linear_history: false,
      allow_actor: true,
      allow_deletions: true,
      allow_force_pushes: true,
    }
  }

  public async fetchProtectedBranches(
    owner: string,
    name: string
  ): Promise<ReadonlyArray<IAPIBranch>> {
    return []
  }

  public async fetchRepoRulesForBranch(
    owner: string,
    name: string,
    branch: string
  ): Promise<ReadonlyArray<IAPIRepoRule>> {
    return []
  }

  public async fetchAllRepoRulesets(
    owner: string,
    name: string
  ): Promise<ReadonlyArray<IAPISlimRepoRuleset> | null> {
    return null
  }

  public async fetchRepoRuleset(
    owner: string,
    name: string,
    id: number
  ): Promise<IAPIRepoRuleset | null> {
    return null
  }

  public async getFetchPollInterval(
    owner: string,
    name: string
  ): Promise<number | null> {
    return null
  }

  public async fetchMentionables(
    owner: string,
    name: string,
    etag: string | undefined
  ): Promise<IAPIMentionablesResponse | null> {
    return null
  }

  public async fetchUser(login: string): Promise<IAPIFullIdentity | null> {
    return null
  }

  public async fetchFeatureFlags(): Promise<ReadonlyArray<string> | undefined> {
    return undefined
  }

  public async fetchUserCopilotInfo(): Promise<UserCopilotInfo | undefined> {
    return undefined
  }

  public async getDiffChangesCommitMessage(
    diff: string
  ): Promise<ICopilotCommitMessage> {
    throw new Error('Copilot commit messages are disabled in OpenGit')
  }

  public async createPushProtectionBypass(
    owner: string,
    name: string,
    reason: BypassReasonType,
    placeholderId: string,
    bypassURL: string
  ): Promise<IAPICreatePushProtectionBypassResponse> {
    throw new Error('Push protection bypass is disabled in OpenGit')
  }
}

export async function deleteToken(account: Account) {
  return false
}

/** Fetch the user authenticated by the token. */
export async function fetchUser(
  endpoint: string,
  token: string
): Promise<Account> {
  throw new Error('fetchUser is disabled in OpenGit')
}

/**
 * Map a repository's URL to the endpoint associated with it. For example:
 *
 * https://github.com/desktop/desktop -> https://api.github.com
 * http://github.mycompany.com/my-team/my-project -> http://github.mycompany.com/api
 */
export function getEndpointForRepository(url: string): string {
  const parsed = URL.parse(url)
  if (parsed.hostname === 'github.com') {
    return getDotComAPIEndpoint()
  } else {
    return `${parsed.protocol}//${parsed.hostname}/api`
  }
}

/**
 * Get the URL for the HTML site. For example:
 *
 * https://api.github.com -> https://github.com
 * http://github.mycompany.com/api -> http://github.mycompany.com/
 */
export function getHTMLURL(endpoint: string): string {
  if (envHTMLURL !== undefined) {
    return envHTMLURL
  }

  // In the case of GitHub.com, the HTML site lives on the parent domain.
  //  E.g., https://api.github.com -> https://github.com
  //
  // Whereas with Enterprise, it lives on the same domain but without the
  // API path:
  //  E.g., https://github.mycompany.com/api/v3 -> https://github.mycompany.com
  //
  // We need to normalize them.
  if (endpoint === getDotComAPIEndpoint() && !envEndpoint) {
    return 'https://github.com'
  } else {
    if (isGHE(endpoint)) {
      const url = new window.URL(endpoint)

      url.pathname = '/'

      if (url.hostname.startsWith('api.')) {
        url.hostname = url.hostname.replace(/^api\./, '')
      }

      return url.toString()
    }

    const parsed = URL.parse(endpoint)
    return `${parsed.protocol}//${parsed.hostname}`
  }
}

/**
 * Get the API URL for an HTML URL. For example:
 *
 * http://github.mycompany.com -> https://github.mycompany.com/api/v3
 */
export function getEnterpriseAPIURL(endpoint: string): string {
  const { host } = new window.URL(endpoint)

  return isGHE(endpoint) ? `https://api.${host}/` : `https://${host}/api/v3`
}

export const getAPIEndpoint = (endpoint: string) =>
  isDotCom(endpoint) ? getDotComAPIEndpoint() : getEnterpriseAPIURL(endpoint)

/** Get github.com's API endpoint. */
export function getDotComAPIEndpoint(): string {
  // NOTE:
  // `DESKTOP_GITHUB_DOTCOM_API_ENDPOINT` only needs to be set if you are
  // developing against a local version of GitHub the Website, and need to debug
  // the server-side interaction. For all other cases you should leave this
  // unset.
  if (envEndpoint && envEndpoint.length > 0) {
    return envEndpoint
  }

  return 'https://api.github.com'
}

/** Get the account for the endpoint. */
export function getAccountForEndpoint(
  accounts: ReadonlyArray<Account>,
  endpoint: string
): Account | null {
  return accounts.find(a => a.endpoint === endpoint) || null
}

export function getOAuthAuthorizationURL(
  endpoint: string,
  state: string
): string {
  // OpenGit: OAuth is disabled, return empty string
  return ''
}

export async function requestOAuthToken(
  endpoint: string,
  code: string
): Promise<string | null> {
  // OpenGit: OAuth is disabled
  return null
}

/**
 * Attempts to determine whether or not the url belongs to a GitHub host.
 *
 * OpenGit: Always returns false — all remotes are treated as generic Git.
 */
export async function isGitHubHost(url: string) {
  return false
}

