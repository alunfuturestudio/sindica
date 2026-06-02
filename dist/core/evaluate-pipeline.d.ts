import type { ActionPlan, Issue, Pipeline } from "./types.js";
export declare function evaluatePipeline(pipeline: Pipeline, issues: readonly Issue[]): ActionPlan;
