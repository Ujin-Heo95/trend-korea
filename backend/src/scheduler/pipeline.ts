import { logger } from '../utils/logger.js';
import { notifyPipelineWarning } from '../services/discord.js';

export interface PipelineStep {
  readonly name: string;
  readonly run: () => Promise<unknown>;
  /** If true, skip subsequent steps on failure */
  readonly critical?: boolean;
}

export interface PipelineResult {
  readonly steps: readonly StepResult[];
  readonly totalMs: number;
  readonly success: boolean;
}

interface StepResult {
  readonly name: string;
  readonly durationMs: number;
  readonly status: 'ok' | 'failed' | 'skipped';
  readonly error?: string;
}

/**
 * Run pipeline steps sequentially with error propagation.
 * If a critical step fails, subsequent steps are skipped.
 * Returns per-step timing and overall result.
 */
export async function runPipeline(
  pipelineName: string,
  steps: readonly PipelineStep[],
): Promise<PipelineResult> {
  const startAll = Date.now();
  const results: StepResult[] = [];
  let skipRemaining = false;

  for (const step of steps) {
    if (skipRemaining) {
      results.push({ name: step.name, durationMs: 0, status: 'skipped' });
      continue;
    }

    const stepStart = Date.now();
    try {
      await step.run();
      results.push({
        name: step.name,
        durationMs: Date.now() - stepStart,
        status: 'ok',
      });
    } catch (err) {
      const durationMs = Date.now() - stepStart;
      const errorMsg = err instanceof Error ? err.message : String(err);
      results.push({ name: step.name, durationMs, status: 'failed', error: errorMsg });

      logger.error({ step: step.name, err, durationMs }, `[${pipelineName}] step failed`);

      if (step.critical) {
        skipRemaining = true;
        logger.warn(`[${pipelineName}] critical step "${step.name}" failed — skipping remaining steps`);
      }
    }
  }

  const totalMs = Date.now() - startAll;
  const failedSteps = results.filter(r => r.status === 'failed');
  const skippedSteps = results.filter(r => r.status === 'skipped');
  const success = failedSteps.length === 0;

  // Log summary
  const summary = results.map(r =>
    `${r.status === 'ok' ? '✓' : r.status === 'failed' ? '✗' : '⊘'} ${r.name} (${r.durationMs}ms)`
  ).join(', ');
  logger.info(`[${pipelineName}] ${success ? 'completed' : 'completed with errors'} in ${totalMs}ms: ${summary}`);

  // Discord alert on failure
  if (failedSteps.length > 0) {
    const msg = [
      `총 ${totalMs}ms, ${failedSteps.length}건 실패, ${skippedSteps.length}건 스킵`,
      ...failedSteps.map(f => `• ${f.name}: ${f.error?.slice(0, 200)}`),
    ].join('\n');
    notifyPipelineWarning(pipelineName, msg).catch(() => {});
  }

  return { steps: results, totalMs, success };
}
