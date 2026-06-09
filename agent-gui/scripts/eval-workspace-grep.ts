/**
 * Workspace grep golden-case eval CLI.
 */
import {
  DEFAULT_GREP_EVAL_DATASET,
  formatWorkspaceGrepEvalReport,
  runWorkspaceGrepEval,
} from "@/lib/workspace-grep-eval";

async function main(): Promise<void> {
  const summary = await runWorkspaceGrepEval(DEFAULT_GREP_EVAL_DATASET);
  console.log(formatWorkspaceGrepEvalReport(summary));
  if (summary.blockingFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
