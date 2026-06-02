import type { Pipeline } from "./types.js";

export function definePipeline(pipeline: Pipeline): Pipeline {
  assertUniqueRuleIds(pipeline);
  return pipeline;
}

function assertUniqueRuleIds(pipeline: Pipeline): void {
  const seen = new Set<string>();

  for (const rule of pipeline.rules) {
    if (seen.has(rule.id)) {
      throw new Error(`Duplicate rule id: ${rule.id}`);
    }
    seen.add(rule.id);
  }
}
