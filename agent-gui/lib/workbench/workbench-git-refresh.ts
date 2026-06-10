type GitRefreshListener = () => void;

const listeners = new Set<GitRefreshListener>();

/** Request git status refresh in the workbench changed-files view. */
export function notifyWorkbenchGitRefresh(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeWorkbenchGitRefresh(listener: GitRefreshListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
