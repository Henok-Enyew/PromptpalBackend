import { Request, Response } from 'express';
import catchAsync from '../utils/catchAsync.util.js';
import logger from '../config/logger.config.js';
import * as evaluationService from '../services/evaluation.service.js';
import type { EvaluationEvent } from '../services/evaluation.service.js';
import type { ListEvaluationsQuery, RunEvaluationInput } from '../validation/evaluation.schema.js';

export const getOptions = catchAsync(async (_req: Request, res: Response) => {
  res.status(200).json({ status: 'success', data: evaluationService.getEvaluationOptions() });
});

/**
 * POST /evaluations: Server-Sent Events stream of a multi-model run.
 * Validation happens first so bad input gets a normal JSON 4xx; once the
 * stream is open, failures are reported as `run.error` events.
 */
export const runEvaluation = catchAsync(async (req: Request, res: Response) => {
  const input = req.body as RunEvaluationInput;
  const prepared = await evaluationService.prepareEvaluation(req.user!, input);

  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable proxy buffering (nginx-style proxies)
  });
  res.flushHeaders();

  // `req` emits 'close' as soon as the body is read; the response's 'close'
  // before it has ended is the reliable "client went away" signal.
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  const send = (e: EvaluationEvent) => {
    if (!res.writableEnded && !controller.signal.aborted) {
      res.write(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`);
    }
  };
  // Comment lines keep idle connections alive through proxies while models think.
  const ping = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n');
  }, 15_000);

  try {
    await evaluationService.runEvaluation(req.user!, input, prepared, send, controller.signal);
  } catch (error) {
    logger.error(error, '[Evaluation]: run failed');
    send({ event: 'run.error', data: { message: 'The benchmark failed unexpectedly. Please try again.' } });
  } finally {
    clearInterval(ping);
    if (!res.writableEnded) res.end();
  }
});

export const listRuns = catchAsync(async (req: Request, res: Response) => {
  const data = await evaluationService.listEvaluationRuns(req.user!, req.query as unknown as ListEvaluationsQuery);
  res.status(200).json({ status: 'success', data });
});

export const getRun = catchAsync(async (req: Request, res: Response) => {
  const run = await evaluationService.getEvaluationRun(req.params.id as string, req.user!);
  res.status(200).json({ status: 'success', data: { run } });
});
