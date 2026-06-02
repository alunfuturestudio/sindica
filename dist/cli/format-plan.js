export function formatPlan(plan) {
    const lines = [];
    lines.push(`Pipeline: ${plan.pipeline.name}`);
    lines.push(`Router: ${plan.pipeline.router.name}`);
    lines.push("");
    if (plan.conflicts.length > 0) {
        lines.push("Conflicts:");
        for (const conflict of plan.conflicts) {
            const rules = conflict.rules.map((rule) => rule.id).join(", ");
            lines.push(`  ${conflict.issue.id}: ${rules}`);
        }
        lines.push("");
    }
    if (plan.planned.length === 0) {
        lines.push("No matching issues.");
        return lines.join("\n");
    }
    for (const item of plan.planned) {
        lines.push(`${item.rule.id}`);
        lines.push(`  ${item.issue.id}: ${item.issue.title}`);
        for (const action of item.actions) {
            lines.push(`    - ${formatAction(action)}`);
        }
        lines.push("");
    }
    return lines.join("\n").trimEnd();
}
function formatAction(action) {
    switch (action.type) {
        case "addLabel":
            return `add label ${action.label}`;
        case "removeLabel":
            return `remove label ${action.label}`;
        case "moveStatus":
            return `move to ${action.status}`;
        case "assignAgent":
            return `assign agent ${action.agent}`;
        case "comment":
            return `comment ${JSON.stringify(action.body)}`;
    }
}
//# sourceMappingURL=format-plan.js.map