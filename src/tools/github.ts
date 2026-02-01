/**
 * GitHub Tools - Native GitHub API Integration
 *
 * Full GitHub automation without shelling out to gh CLI
 */

import { Octokit } from '@octokit/rest';

// GitHub clients per token
const octokitClients: Map<string, Octokit> = new Map();

function getClient(alias: string = 'default'): Octokit {
  const client = octokitClients.get(alias);
  if (!client) {
    throw new Error(`No GitHub connection "${alias}". Call gh_connect first.`);
  }
  return client;
}

// =============================================================================
// CONNECTION
// =============================================================================

export async function handleGhConnect(args: {
  token: string;
  alias?: string;
}): Promise<object> {
  const alias = args.alias || 'default';

  try {
    const octokit = new Octokit({ auth: args.token });
    const { data: user } = await octokit.rest.users.getAuthenticated();

    octokitClients.set(alias, octokit);

    return {
      success: true,
      alias,
      user: user.login,
      name: user.name,
      scopes: 'authenticated',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// REPOSITORY
// =============================================================================

export async function handleGhRepoInfo(args: {
  owner: string;
  repo: string;
  alias?: string;
}): Promise<object> {
  try {
    const octokit = getClient(args.alias);
    const { data } = await octokit.rest.repos.get({
      owner: args.owner,
      repo: args.repo,
    });

    return {
      success: true,
      name: data.name,
      fullName: data.full_name,
      description: data.description,
      private: data.private,
      defaultBranch: data.default_branch,
      language: data.language,
      stars: data.stargazers_count,
      forks: data.forks_count,
      openIssues: data.open_issues_count,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      cloneUrl: data.clone_url,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleGhFileRead(args: {
  owner: string;
  repo: string;
  path: string;
  ref?: string;
  alias?: string;
}): Promise<object> {
  try {
    const octokit = getClient(args.alias);
    const { data } = await octokit.rest.repos.getContent({
      owner: args.owner,
      repo: args.repo,
      path: args.path,
      ref: args.ref,
    });

    if (Array.isArray(data)) {
      return {
        success: true,
        type: 'directory',
        files: data.map(f => ({ name: f.name, type: f.type, size: f.size })),
      };
    }

    if (data.type === 'file' && 'content' in data) {
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      return {
        success: true,
        type: 'file',
        path: data.path,
        size: data.size,
        sha: data.sha,
        content,
      };
    }

    return { success: false, error: 'Unexpected content type' };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleGhFileWrite(args: {
  owner: string;
  repo: string;
  path: string;
  content: string;
  message: string;
  branch?: string;
  sha?: string;
  alias?: string;
}): Promise<object> {
  try {
    const octokit = getClient(args.alias);

    // Get current file SHA if updating
    let sha = args.sha;
    if (!sha) {
      try {
        const { data: existing } = await octokit.rest.repos.getContent({
          owner: args.owner,
          repo: args.repo,
          path: args.path,
          ref: args.branch,
        });
        if (!Array.isArray(existing) && 'sha' in existing) {
          sha = existing.sha;
        }
      } catch {
        // File doesn't exist, creating new
      }
    }

    const { data } = await octokit.rest.repos.createOrUpdateFileContents({
      owner: args.owner,
      repo: args.repo,
      path: args.path,
      message: args.message,
      content: Buffer.from(args.content).toString('base64'),
      branch: args.branch,
      sha,
    });

    return {
      success: true,
      path: args.path,
      sha: data.content?.sha,
      commit: data.commit.sha,
      message: args.message,
      created: !sha,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// BRANCHES
// =============================================================================

export async function handleGhBranchList(args: {
  owner: string;
  repo: string;
  alias?: string;
}): Promise<object> {
  try {
    const octokit = getClient(args.alias);
    const { data } = await octokit.rest.repos.listBranches({
      owner: args.owner,
      repo: args.repo,
      per_page: 100,
    });

    return {
      success: true,
      branches: data.map(b => ({
        name: b.name,
        sha: b.commit.sha,
        protected: b.protected,
      })),
      count: data.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleGhBranchCreate(args: {
  owner: string;
  repo: string;
  branch: string;
  fromBranch?: string;
  fromSha?: string;
  alias?: string;
}): Promise<object> {
  try {
    const octokit = getClient(args.alias);

    // Get SHA to branch from
    let sha = args.fromSha;
    if (!sha) {
      const { data: ref } = await octokit.rest.git.getRef({
        owner: args.owner,
        repo: args.repo,
        ref: `heads/${args.fromBranch || 'main'}`,
      });
      sha = ref.object.sha;
    }

    const { data } = await octokit.rest.git.createRef({
      owner: args.owner,
      repo: args.repo,
      ref: `refs/heads/${args.branch}`,
      sha,
    });

    return {
      success: true,
      branch: args.branch,
      sha: data.object.sha,
      fromBranch: args.fromBranch || 'main',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// PULL REQUESTS
// =============================================================================

export async function handleGhPrList(args: {
  owner: string;
  repo: string;
  state?: 'open' | 'closed' | 'all';
  head?: string;
  base?: string;
  alias?: string;
}): Promise<object> {
  try {
    const octokit = getClient(args.alias);
    const { data } = await octokit.rest.pulls.list({
      owner: args.owner,
      repo: args.repo,
      state: args.state || 'open',
      head: args.head,
      base: args.base,
      per_page: 50,
    });

    return {
      success: true,
      pullRequests: data.map(pr => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        user: pr.user?.login,
        head: pr.head.ref,
        base: pr.base.ref,
        draft: pr.draft,
        mergeable: (pr as any).mergeable,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
      })),
      count: data.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleGhPrCreate(args: {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;
  base?: string;
  draft?: boolean;
  alias?: string;
}): Promise<object> {
  try {
    const octokit = getClient(args.alias);
    const { data } = await octokit.rest.pulls.create({
      owner: args.owner,
      repo: args.repo,
      title: args.title,
      body: args.body,
      head: args.head,
      base: args.base || 'main',
      draft: args.draft,
    });

    return {
      success: true,
      number: data.number,
      url: data.html_url,
      title: data.title,
      state: data.state,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleGhPrMerge(args: {
  owner: string;
  repo: string;
  pullNumber: number;
  mergeMethod?: 'merge' | 'squash' | 'rebase';
  commitTitle?: string;
  commitMessage?: string;
  alias?: string;
}): Promise<object> {
  try {
    const octokit = getClient(args.alias);
    const { data } = await octokit.rest.pulls.merge({
      owner: args.owner,
      repo: args.repo,
      pull_number: args.pullNumber,
      merge_method: args.mergeMethod || 'squash',
      commit_title: args.commitTitle,
      commit_message: args.commitMessage,
    });

    return {
      success: true,
      merged: data.merged,
      sha: data.sha,
      message: data.message,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleGhPrReview(args: {
  owner: string;
  repo: string;
  pullNumber: number;
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  body?: string;
  alias?: string;
}): Promise<object> {
  try {
    const octokit = getClient(args.alias);
    const { data } = await octokit.rest.pulls.createReview({
      owner: args.owner,
      repo: args.repo,
      pull_number: args.pullNumber,
      event: args.event,
      body: args.body,
    });

    return {
      success: true,
      id: data.id,
      state: data.state,
      user: data.user?.login,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// ISSUES
// =============================================================================

export async function handleGhIssueList(args: {
  owner: string;
  repo: string;
  state?: 'open' | 'closed' | 'all';
  labels?: string;
  alias?: string;
}): Promise<object> {
  try {
    const octokit = getClient(args.alias);
    const { data } = await octokit.rest.issues.listForRepo({
      owner: args.owner,
      repo: args.repo,
      state: args.state || 'open',
      labels: args.labels,
      per_page: 50,
    });

    return {
      success: true,
      issues: data.filter(i => !i.pull_request).map(issue => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        user: issue.user?.login,
        labels: issue.labels.map(l => typeof l === 'string' ? l : l.name),
        assignees: issue.assignees?.map(a => a.login),
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
      })),
      count: data.filter(i => !i.pull_request).length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleGhIssueCreate(args: {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
  alias?: string;
}): Promise<object> {
  try {
    const octokit = getClient(args.alias);
    const { data } = await octokit.rest.issues.create({
      owner: args.owner,
      repo: args.repo,
      title: args.title,
      body: args.body,
      labels: args.labels,
      assignees: args.assignees,
    });

    return {
      success: true,
      number: data.number,
      url: data.html_url,
      title: data.title,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleGhIssueComment(args: {
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
  alias?: string;
}): Promise<object> {
  try {
    const octokit = getClient(args.alias);
    const { data } = await octokit.rest.issues.createComment({
      owner: args.owner,
      repo: args.repo,
      issue_number: args.issueNumber,
      body: args.body,
    });

    return {
      success: true,
      id: data.id,
      url: data.html_url,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// ACTIONS / WORKFLOWS
// =============================================================================

export async function handleGhWorkflowList(args: {
  owner: string;
  repo: string;
  alias?: string;
}): Promise<object> {
  try {
    const octokit = getClient(args.alias);
    const { data } = await octokit.rest.actions.listRepoWorkflows({
      owner: args.owner,
      repo: args.repo,
    });

    return {
      success: true,
      workflows: data.workflows.map(w => ({
        id: w.id,
        name: w.name,
        path: w.path,
        state: w.state,
      })),
      count: data.total_count,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleGhWorkflowRun(args: {
  owner: string;
  repo: string;
  workflowId: number | string;
  ref: string;
  inputs?: Record<string, string>;
  alias?: string;
}): Promise<object> {
  try {
    const octokit = getClient(args.alias);
    await octokit.rest.actions.createWorkflowDispatch({
      owner: args.owner,
      repo: args.repo,
      workflow_id: args.workflowId,
      ref: args.ref,
      inputs: args.inputs,
    });

    return {
      success: true,
      message: `Workflow ${args.workflowId} triggered on ${args.ref}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleGhWorkflowRuns(args: {
  owner: string;
  repo: string;
  workflowId?: number | string;
  status?: 'queued' | 'in_progress' | 'completed';
  alias?: string;
}): Promise<object> {
  try {
    const octokit = getClient(args.alias);

    let data: any;
    if (args.workflowId) {
      const result = await octokit.rest.actions.listWorkflowRuns({
        owner: args.owner,
        repo: args.repo,
        workflow_id: args.workflowId,
        status: args.status as any,
        per_page: 20,
      });
      data = result.data;
    } else {
      const result = await octokit.rest.actions.listWorkflowRunsForRepo({
        owner: args.owner,
        repo: args.repo,
        status: args.status as any,
        per_page: 20,
      });
      data = result.data;
    }

    return {
      success: true,
      runs: data.workflow_runs.map((r: any) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        conclusion: r.conclusion,
        branch: r.head_branch,
        event: r.event,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      count: data.total_count,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// DIFF & COMPARE
// =============================================================================

export async function handleGhDiff(args: {
  owner: string;
  repo: string;
  base: string;
  head: string;
  alias?: string;
}): Promise<object> {
  try {
    const octokit = getClient(args.alias);
    const { data } = await octokit.rest.repos.compareCommits({
      owner: args.owner,
      repo: args.repo,
      base: args.base,
      head: args.head,
    });

    return {
      success: true,
      status: data.status,
      aheadBy: data.ahead_by,
      behindBy: data.behind_by,
      totalCommits: data.total_commits,
      files: data.files?.map(f => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
      })),
      commits: data.commits.map(c => ({
        sha: c.sha.substring(0, 7),
        message: c.commit.message.split('\n')[0],
        author: c.commit.author?.name,
        date: c.commit.author?.date,
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleGhDisconnect(args: { alias?: string }): Promise<object> {
  const alias = args.alias || 'default';
  octokitClients.delete(alias);
  return {
    success: true,
    message: `Disconnected GitHub "${alias}"`,
  };
}
