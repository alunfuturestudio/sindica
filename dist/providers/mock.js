import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createLabels } from "../core/labels.js";
export function createMockProvider(options) {
    return {
        name: "mock",
        async listIssues() {
            if (!options.fixturePath) {
                return [];
            }
            const raw = await readFile(resolve(options.fixturePath), "utf8");
            const parsed = JSON.parse(raw);
            return (parsed.issues ?? []).map(toIssue);
        },
        async apply(plan) {
            for (const item of plan.planned) {
                const actions = item.actions.map((action) => action.type).join(", ");
                console.log(`mock apply ${item.issue.id}: ${actions}`);
            }
        },
        async deploy(pipeline) {
            console.log(`mock deploy router ${pipeline.router.name}`);
        },
        async doctor() {
            console.log("mock provider ok");
        },
    };
}
function toIssue(issue) {
    const converted = {
        id: issue.id,
        title: issue.title,
        open: issue.open,
        status: issue.status,
        labels: createLabels(issue.labels ?? []),
        raw: issue,
    };
    if (issue.assignee) {
        converted.assignee = issue.assignee;
    }
    if (issue.url) {
        converted.url = issue.url;
    }
    return converted;
}
//# sourceMappingURL=mock.js.map