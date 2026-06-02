export function definePipeline(pipeline) {
    assertUniqueRuleIds(pipeline);
    return pipeline;
}
function assertUniqueRuleIds(pipeline) {
    const seen = new Set();
    for (const rule of pipeline.rules) {
        if (seen.has(rule.id)) {
            throw new Error(`Duplicate rule id: ${rule.id}`);
        }
        seen.add(rule.id);
    }
}
//# sourceMappingURL=define-pipeline.js.map