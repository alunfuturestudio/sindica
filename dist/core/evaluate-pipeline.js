export function evaluatePipeline(pipeline, issues) {
    const planned = [];
    const conflicts = [];
    const sortedRules = [...pipeline.rules].sort((a, b) => a.priority - b.priority);
    for (const issue of issues) {
        const matchingRules = sortedRules.filter((rule) => rule.match(issue));
        if (matchingRules.length === 0) {
            continue;
        }
        if (matchingRules.length > 1 &&
            pipeline.conflictPolicy === "fail") {
            conflicts.push({ issue, rules: matchingRules });
            continue;
        }
        const rule = firstRule(matchingRules, issue);
        planned.push({
            issue,
            rule,
            actions: rule.actions,
        });
    }
    return { pipeline, planned, conflicts };
}
function firstRule(rules, issue) {
    const [rule] = rules;
    if (!rule) {
        throw new Error(`No matching rule for issue ${issue.id}`);
    }
    return rule;
}
//# sourceMappingURL=evaluate-pipeline.js.map