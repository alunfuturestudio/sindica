import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { createLabels } from "../core/labels.js";
const execFileAsync = promisify(execFile);
export function createMulticaProvider(options = {}) {
    const workspaceId = options.workspaceId;
    return {
        name: "multica",
        async listIssues() {
            const issues = [];
            const limit = 100;
            let offset = 0;
            while (true) {
                const response = await multicaJson(workspaceId, "issue", "list", "--limit", String(limit), "--offset", String(offset), "--output", "json");
                issues.push(...response.issues.map(toIssue));
                if (!response.has_more) {
                    break;
                }
                offset += response.limit ?? limit;
            }
            return issues;
        },
        async apply(plan) {
            const labels = await listLabels(workspaceId);
            for (const item of plan.planned) {
                for (const action of item.actions) {
                    await applyAction(workspaceId, labels, item.issue, action);
                }
            }
        },
        async deploy(pipeline) {
            await deployLabels(workspaceId, pipeline);
            await deploySkills(workspaceId, pipeline);
            await deployAgents(workspaceId, pipeline);
            await deployRouter(workspaceId, pipeline);
        },
        async doctor() {
            const { stdout } = await execFileAsync("multica", ["--version"]);
            console.log(stdout.trim());
        },
    };
}
async function deployLabels(workspaceId, pipeline) {
    const labelConfigs = normalizeLabelConfigs(pipeline.labels ?? []);
    if (labelConfigs.length === 0) {
        return;
    }
    const existing = new Map(await listLabels(workspaceId));
    for (const labelConfig of labelConfigs) {
        if (existing.has(labelConfig.name)) {
            console.log(`label already exists: ${labelConfig.name}`);
            continue;
        }
        await multica(workspaceId, "label", "create", "--name", labelConfig.name, "--color", labelConfig.color ?? "#64748b", "--output", "json");
        existing.set(labelConfig.name, labelConfig.name);
        console.log(`created label: ${labelConfig.name}`);
    }
}
function normalizeLabelConfigs(labels) {
    return labels.map((label) => {
        if (typeof label === "string") {
            return { name: label };
        }
        return label;
    });
}
async function deploySkills(workspaceId, pipeline) {
    for (const skillConfig of pipeline.skills ?? []) {
        const skill = await upsertSkill(workspaceId, skillConfig);
        await upsertSkillFiles(workspaceId, skill.id, skillConfig.files ?? []);
        console.log(`deployed skill: ${skill.name} (${skill.id})`);
    }
}
async function upsertSkill(workspaceId, skillConfig) {
    const skills = await multicaJson(workspaceId, "skill", "list", "--output", "json");
    const existing = skills.find((skill) => skill.name === skillConfig.name);
    const content = await readFile(skillConfig.contentPath, "utf8");
    const description = skillConfig.description ?? skillConfig.name;
    if (existing) {
        return multicaJson(workspaceId, "skill", "update", existing.id, "--name", skillConfig.name, "--description", description, "--content", content, ...skillConfigArgs(skillConfig), "--output", "json");
    }
    return multicaJson(workspaceId, "skill", "create", "--name", skillConfig.name, "--description", description, "--content", content, ...skillConfigArgs(skillConfig), "--output", "json");
}
function skillConfigArgs(skillConfig) {
    if (!skillConfig.config) {
        return [];
    }
    return ["--config", skillConfig.config];
}
async function upsertSkillFiles(workspaceId, skillId, filePaths) {
    for (const filePath of filePaths) {
        const content = await readFile(filePath, "utf8");
        await multica(workspaceId, "skill", "files", "upsert", skillId, "--path", filePath, "--content", content, "--output", "json");
    }
}
async function deployAgents(workspaceId, pipeline) {
    for (const agentConfig of pipeline.agents ?? []) {
        const agent = await deployAgent(workspaceId, agentConfig);
        await setAgentSkills(workspaceId, agent.id, agentConfig.skills ?? []);
        console.log(`deployed agent: ${agent.name} (${agent.id})`);
    }
}
async function deployRouter(workspaceId, pipeline) {
    const agentName = pipeline.router.agentName ?? pipeline.router.name;
    const command = pipeline.router.command ?? "sindica-run run";
    const description = pipeline.router.description ??
        `Runs the Sindica deterministic router for pipeline ${pipeline.name}.`;
    const instructions = pipeline.router.instructions ?? [
        "Execute the configured Sindica router command exactly once:",
        "",
        `  ${command}`,
        "",
        "Report the command result. Do not manually move issues outside Sindica.",
    ].join("\n");
    const model = pipeline.router.model ?? "gpt-5.5";
    const triggerLabel = pipeline.router.triggerLabel ?? "sindica-router";
    const routerAgentConfig = {
        name: agentName,
        description,
        instructions,
        model,
        runtimeProvider: pipeline.router.runtimeProvider ?? "codex",
        maxConcurrentTasks: 1,
        visibility: "private",
    };
    if (pipeline.router.thinkingLevel) {
        routerAgentConfig.thinkingLevel = pipeline.router.thinkingLevel;
    }
    if (pipeline.router.customArgs) {
        routerAgentConfig.customArgs = pipeline.router.customArgs;
    }
    const agent = await deployAgent(workspaceId, routerAgentConfig);
    await setAgentSkills(workspaceId, agent.id, []);
    const autopilot = await upsertAutopilot(workspaceId, {
        title: pipeline.router.name,
        description: [
            "Run the Sindica deterministic issue router.",
            "",
            `Command: ${command}`,
        ].join("\n"),
        agentName,
    });
    await upsertTrigger(workspaceId, autopilot.id, {
        label: triggerLabel,
        cron: pipeline.router.schedule,
        timezone: pipeline.router.timezone,
    });
    console.log(`deployed agent: ${agent.name} (${agent.id})`);
    console.log(`deployed autopilot: ${autopilot.title} (${autopilot.id})`);
    console.log(`deployed trigger: ${triggerLabel} ${pipeline.router.schedule} ${pipeline.router.timezone}`);
}
async function setAgentSkills(workspaceId, agentId, skillNames) {
    if (skillNames.length === 0) {
        await multica(workspaceId, "agent", "skills", "set", agentId, "--skill-ids", "", "--output", "json");
        return;
    }
    const skills = await multicaJson(workspaceId, "skill", "list", "--output", "json");
    const skillIds = skillNames.map((name) => {
        const skill = skills.find((candidate) => candidate.name === name);
        if (!skill) {
            throw new Error(`Multica skill not found for agent ${agentId}: ${name}`);
        }
        return skill.id;
    });
    await multica(workspaceId, "agent", "skills", "set", agentId, "--skill-ids", skillIds.join(","), "--output", "json");
}
async function deployAgent(workspaceId, agentConfig) {
    const runtimeProvider = agentConfig.runtimeProvider ?? "codex";
    const runtimeId = await resolveRuntimeId(workspaceId, runtimeProvider);
    const customArgs = agentConfig.customArgs ?? defaultCustomArgs(runtimeProvider);
    const input = {
        name: agentConfig.name,
        description: agentConfig.description ?? "",
        instructions: agentConfig.instructions,
        model: agentConfig.model ?? "gpt-5.5",
        runtimeId,
        customArgs,
        maxConcurrentTasks: agentConfig.maxConcurrentTasks ?? 6,
        visibility: agentConfig.visibility ?? "private",
    };
    const config = runtimeConfig(agentConfig.thinkingLevel);
    if (config) {
        input.runtimeConfig = config;
    }
    return upsertAgent(workspaceId, input);
}
function runtimeConfig(thinkingLevel) {
    if (!thinkingLevel) {
        return undefined;
    }
    return JSON.stringify({ thinking_level: thinkingLevel });
}
async function resolveRuntimeId(workspaceId, preferredProvider) {
    const runtimes = await multicaJson(workspaceId, "runtime", "list", "--output", "json");
    const preferred = runtimes.find((runtime) => runtime.status === "online" && runtime.provider === preferredProvider);
    const online = runtimes.find((runtime) => runtime.status === "online");
    const fallback = runtimes[0];
    const runtime = preferred ?? online ?? fallback;
    if (!runtime) {
        throw new Error("No Multica runtime found for router agent deployment.");
    }
    return runtime.id;
}
async function upsertAgent(workspaceId, input) {
    const agents = await multicaJson(workspaceId, "agent", "list", "--output", "json");
    const existing = agents.find((agent) => agent.name === input.name);
    if (existing) {
        const updated = await multicaJson(workspaceId, "agent", "update", existing.id, "--name", input.name, "--description", input.description, "--instructions", input.instructions, "--model", input.model, "--runtime-id", input.runtimeId, ...runtimeConfigArgs(input.runtimeConfig), "--custom-args", JSON.stringify(input.customArgs), "--visibility", input.visibility, "--max-concurrent-tasks", String(input.maxConcurrentTasks), "--output", "json");
        return updated;
    }
    return multicaJson(workspaceId, "agent", "create", "--name", input.name, "--description", input.description, "--instructions", input.instructions, "--model", input.model, "--runtime-id", input.runtimeId, ...runtimeConfigArgs(input.runtimeConfig), "--custom-args", JSON.stringify(input.customArgs), "--visibility", input.visibility, "--max-concurrent-tasks", String(input.maxConcurrentTasks), "--output", "json");
}
function runtimeConfigArgs(runtimeConfig) {
    if (!runtimeConfig) {
        return [];
    }
    return ["--runtime-config", runtimeConfig];
}
function defaultCustomArgs(runtimeProvider) {
    if (runtimeProvider !== "codex") {
        return [];
    }
    return [
        "-c",
        'sandbox_mode="danger-full-access"',
        "-c",
        'approval_policy="never"',
    ];
}
async function upsertAutopilot(workspaceId, input) {
    const autopilots = await multicaJson(workspaceId, "autopilot", "list", "--output", "json");
    const existing = autopilots.autopilots.find((autopilot) => autopilot.title === input.title);
    if (existing) {
        return multicaJson(workspaceId, "autopilot", "update", existing.id, "--title", input.title, "--description", input.description, "--agent", input.agentName, "--mode", "run_only", "--status", "active", "--output", "json");
    }
    return multicaJson(workspaceId, "autopilot", "create", "--title", input.title, "--description", input.description, "--agent", input.agentName, "--mode", "run_only", "--output", "json");
}
async function upsertTrigger(workspaceId, autopilotId, input) {
    const current = await multicaJson(workspaceId, "autopilot", "get", autopilotId, "--output", "json");
    const existing = current.triggers?.find((trigger) => trigger.label === input.label);
    if (existing) {
        await multica(workspaceId, "autopilot", "trigger-update", autopilotId, existing.id, "--label", input.label, "--cron", input.cron, "--timezone", input.timezone, "--enabled=true", "--output", "json");
        return;
    }
    await multica(workspaceId, "autopilot", "trigger-add", autopilotId, "--label", input.label, "--cron", input.cron, "--timezone", input.timezone, "--output", "json");
}
function toIssue(issue) {
    const converted = {
        id: issue.id,
        title: issue.title,
        open: issue.status !== "done",
        status: issue.status,
        labels: createLabels((issue.labels ?? []).map((label) => label.name)),
        raw: issue,
    };
    if (issue.assignee_id) {
        converted.assignee = issue.assignee_id;
    }
    return converted;
}
async function applyAction(workspaceId, labels, issue, action) {
    switch (action.type) {
        case "addLabel": {
            const labelId = requireLabel(labels, action.label);
            await multica(workspaceId, "issue", "label", "add", issue.id, labelId, "--output", "json");
            return;
        }
        case "removeLabel": {
            const labelId = requireLabel(labels, action.label);
            await multica(workspaceId, "issue", "label", "remove", issue.id, labelId, "--output", "json");
            return;
        }
        case "moveStatus":
            await multica(workspaceId, "issue", "status", issue.id, action.status, "--output", "json");
            return;
        case "assignAgent":
            await multica(workspaceId, "issue", "assign", issue.id, "--to", action.agent, "--output", "json");
            return;
        case "comment":
            await multica(workspaceId, "issue", "comment", "add", issue.id, "--content", action.body, "--output", "json");
            return;
    }
}
async function listLabels(workspaceId) {
    const labels = await multicaJson(workspaceId, "label", "list", "--output", "json");
    return new Map(labels.map((label) => [label.name, label.id]));
}
function requireLabel(labels, name) {
    const id = labels.get(name);
    if (!id) {
        throw new Error(`Multica label not found: ${name}`);
    }
    return id;
}
async function multicaJson(workspaceId, ...args) {
    const { stdout } = await multica(workspaceId, ...args);
    return JSON.parse(stdout);
}
async function multica(workspaceId, ...args) {
    const fullArgs = workspaceId ? ["--workspace-id", workspaceId, ...args] : args;
    return execFileAsync("multica", fullArgs, {
        maxBuffer: 50 * 1024 * 1024,
    });
}
//# sourceMappingURL=multica.js.map