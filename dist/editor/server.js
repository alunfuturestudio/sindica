import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { loadConfig } from "../cli/load-config.js";
import { createLabels } from "../core/labels.js";
const execFileAsync = promisify(execFile);
const DEFAULT_PORT = 4317;
const STANDARD_TEMPLATE_PATH = "examples/condominio-padrao.sindica.ts";
const STATUS_CANDIDATES = [
    "todo",
    "TODO",
    "in_review",
    "In Review",
    "a_validar_homolog",
    "Validating Homolog",
    "done",
    "Done",
];
export async function startEditor(options) {
    const port = options.port ?? DEFAULT_PORT;
    const server = createServer((request, response) => {
        void handleRequest(request, response, options);
    });
    await new Promise((resolveServer, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => resolveServer());
    });
    const url = `http://127.0.0.1:${port}`;
    console.log(`Sindica editor running at ${url}`);
    if (options.openBrowser) {
        await openBrowser(url);
    }
}
async function handleRequest(request, response, options) {
    try {
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        if (request.method === "GET" && url.pathname === "/") {
            sendHtml(response, editorHtml());
            return;
        }
        if (request.method === "GET" && url.pathname === "/api/document") {
            const newTemplate = url.searchParams.get("new") ?? undefined;
            const pathParam = url.searchParams.get("path") ?? undefined;
            const filePath = newTemplate ? pathParam : pathParam ?? options.configPath;
            sendJson(response, await loadEditorDocument(filePath, newTemplate));
            return;
        }
        if (request.method === "POST" && url.pathname === "/api/save") {
            const body = await readJsonBody(request);
            if (!body.path) {
                sendJson(response, { ok: false, error: "Missing path." }, 400);
                return;
            }
            await writeFile(resolve(body.path), body.content ?? "", "utf8");
            sendJson(response, { ok: true, path: resolve(body.path) });
            return;
        }
        if (request.method === "POST" && url.pathname === "/api/agent") {
            const body = await readJsonBody(request);
            const content = updateAgentConfig(body);
            await writeFile(resolve(body.path), content, "utf8");
            sendJson(response, { ok: true, path: resolve(body.path), content });
            return;
        }
        if (request.method === "POST" && url.pathname === "/api/rule") {
            const body = await readJsonBody(request);
            const content = updateRuleConfig(body);
            await writeFile(resolve(body.path), content, "utf8");
            sendJson(response, { ok: true, path: resolve(body.path), content });
            return;
        }
        if (request.method === "POST" && url.pathname === "/api/agent/new") {
            const body = await readJsonBody(request);
            const content = addAgentConfig(body);
            await writeFile(resolve(body.path), content, "utf8");
            sendJson(response, { ok: true, path: resolve(body.path), content });
            return;
        }
        if (request.method === "POST" && url.pathname === "/api/agent/delete") {
            const body = await readJsonBody(request);
            const content = deleteAgentConfig(body);
            await writeFile(resolve(body.path), content, "utf8");
            sendJson(response, { ok: true, path: resolve(body.path), content });
            return;
        }
        if (request.method === "POST" && url.pathname === "/api/phase/new") {
            const body = await readJsonBody(request);
            const content = addPhaseConfig(body);
            await writeFile(resolve(body.path), content, "utf8");
            sendJson(response, { ok: true, path: resolve(body.path), content });
            return;
        }
        sendText(response, "Not found", 404);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(response, { ok: false, error: message }, 500);
    }
}
async function loadEditorDocument(configPath, newTemplate) {
    const templatePath = newTemplate ? templatePathFor(newTemplate) : undefined;
    const selectedPath = configPath ?? templatePath;
    if (!selectedPath) {
        return {
            content: emptyConfig(),
        };
    }
    const absolutePath = resolve(selectedPath);
    let content;
    try {
        content = await readFile(absolutePath, "utf8");
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return {
                path: absolutePath,
                content: "",
                missing: true,
            };
        }
        throw error;
    }
    const normalizedContent = portableTemplateContent(content);
    if (normalizedContent !== content) {
        content = normalizedContent;
        await writeFile(absolutePath, content, "utf8");
    }
    try {
        const pipeline = await loadConfig(absolutePath);
        return {
            path: absolutePath,
            content,
            pipeline: toPipelineView(pipeline),
        };
    }
    catch (error) {
        return {
            path: absolutePath,
            content,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
function portableTemplateContent(content) {
    return content
        .replaceAll('from "../src/index"', 'from "sindica"')
        .replaceAll("from '../src/index'", 'from "sindica"');
}
function templatePathFor(template) {
    if (template === "condominio-padrao") {
        return STANDARD_TEMPLATE_PATH;
    }
    throw new Error(`Unknown editor template: ${template}`);
}
export function updateAgentConfig(request) {
    let content = request.content;
    const location = locateAgentObject(content, request.originalName);
    if (!location) {
        throw new Error(`Could not find agent: ${request.originalName}`);
    }
    let block = content.slice(location.start, location.end);
    block = upsertStringProperty(block, "name", request.name);
    block = upsertStringProperty(block, "description", request.description);
    block = upsertStringProperty(block, "runtimeProvider", request.runtimeProvider);
    block = upsertStringProperty(block, "model", request.model);
    block = upsertStringProperty(block, "thinkingLevel", request.thinkingLevel);
    block = upsertStringArrayProperty(block, "skills", request.skills);
    block = upsertExpressionProperty(block, "instructions", JSON.stringify(request.instructions));
    content = `${content.slice(0, location.start)}${block}${content.slice(location.end)}`;
    if (request.originalName !== request.name) {
        content = replaceStringLiteralCalls(content, "assignAgent", request.originalName, request.name);
    }
    return content;
}
export function updateRuleConfig(request) {
    let content = request.content;
    const location = locateRuleObject(content, request.originalId);
    if (!location) {
        throw new Error(`Could not find rule: ${request.originalId}`);
    }
    let block = content.slice(location.start, location.end);
    block = upsertStringProperty(block, "id", request.id);
    block = upsertNumberProperty(block, "priority", request.priority);
    if (request.targetPhase) {
        block = replaceFirstCall(block, "addLabel", request.targetPhase, (value) => value.startsWith("phase:"));
    }
    if (request.assignedAgent) {
        block = replaceFirstCall(block, "assignAgent", request.assignedAgent);
    }
    content = `${content.slice(0, location.start)}${block}${content.slice(location.end)}`;
    return content;
}
export function addAgentConfig(request) {
    const phase = normalizePhaseId(request.phase);
    const name = request.name.trim();
    if (!name) {
        throw new Error("Missing agent name.");
    }
    let content = ensureSindicaImports(request.content, ["addLabel", "assignAgent", "comment"]);
    const agentBlock = `    {
      name: ${JSON.stringify(name)},
      description: "",
      instructions: "",
      runtimeProvider: "codex",
      skills: [],
    }`;
    const ruleId = uniqueRuleId(content, `agent-${slugify(phase)}-${slugify(name)}`);
    const priority = nextRulePriority(content);
    const ruleBlock = `    {
      id: ${JSON.stringify(ruleId)},
      priority: ${priority},
      match: (issue) => issue.open && issue.labels.has(${JSON.stringify(phase)}),
      actions: [
        addLabel(${JSON.stringify(phase)}),
        assignAgent(${JSON.stringify(name)}),
        comment(${JSON.stringify(`sindica/${ruleId}: assigned to ${name}.`)}),
      ],
    }`;
    content = insertIntoArrayProperty(content, "agents", agentBlock);
    content = insertIntoArrayProperty(content, "rules", ruleBlock);
    return content;
}
export function addPhaseConfig(request) {
    const phase = normalizePhaseId(request.phase);
    if (!phase.startsWith("phase:")) {
        throw new Error("Phase must start with phase:.");
    }
    const labelBlock = `    { name: ${JSON.stringify(phase)}, color: "#94a3b8" }`;
    return insertIntoArrayProperty(request.content, "labels", labelBlock);
}
export function deleteAgentConfig(request) {
    const name = request.name.trim();
    if (!name) {
        throw new Error("Missing agent name.");
    }
    let content = request.content;
    const agentLocation = locateAgentObject(content, name);
    if (!agentLocation) {
        throw new Error(`Could not find agent: ${name}`);
    }
    content = removeObjectBlock(content, agentLocation.start, agentLocation.end);
    for (const location of locateRuleObjectsAssigningAgent(content, name).sort((left, right) => right.start - left.start)) {
        content = removeObjectBlock(content, location.start, location.end);
    }
    return content;
}
function locateAgentObject(content, agentName) {
    const nameMatch = findStringProperty(content, "name", agentName);
    if (!nameMatch) {
        return undefined;
    }
    const start = content.lastIndexOf("{", nameMatch.index);
    if (start < 0) {
        return undefined;
    }
    const end = findMatchingBrace(content, start);
    if (end < 0) {
        return undefined;
    }
    return { start, end: end + 1 };
}
function locateRuleObject(content, ruleId) {
    const idMatch = findStringProperty(content, "id", ruleId);
    if (!idMatch) {
        return undefined;
    }
    const start = content.lastIndexOf("{", idMatch.index);
    if (start < 0) {
        return undefined;
    }
    const end = findMatchingBrace(content, start);
    if (end < 0) {
        return undefined;
    }
    return { start, end: end + 1 };
}
function locateRuleObjectsAssigningAgent(content, agentName) {
    const rulesArray = locateArrayProperty(content, "rules");
    if (!rulesArray) {
        return [];
    }
    return locateTopLevelObjects(content, rulesArray.start, rulesArray.end).filter((location) => {
        const block = content.slice(location.start, location.end);
        return new RegExp(`assignAgent\\(\\s*(['"\`])${escapeRegExp(agentName)}\\1\\s*\\)`).test(block);
    });
}
function locateTopLevelObjects(content, arrayStart, arrayEnd) {
    const objects = [];
    let index = arrayStart + 1;
    while (index < arrayEnd) {
        const start = content.indexOf("{", index);
        if (start < 0 || start >= arrayEnd) {
            break;
        }
        const end = findMatchingBrace(content, start);
        if (end < 0 || end > arrayEnd) {
            break;
        }
        objects.push({ start, end: end + 1 });
        index = end + 1;
    }
    return objects;
}
function findStringProperty(content, property, value) {
    const pattern = new RegExp(`${property}:\\s*(['"\`])${escapeRegExp(value)}\\1`, "g");
    return pattern.exec(content) ?? undefined;
}
function upsertStringProperty(block, property, value) {
    const serialized = JSON.stringify(value);
    const propertyPattern = new RegExp(`(${property}:\\s*)(['"\`])(?:\\\\.|(?!\\2)[\\s\\S])*\\2`);
    if (propertyPattern.test(block)) {
        return block.replace(propertyPattern, `$1${serialized}`);
    }
    return insertPropertyAfterName(block, `      ${property}: ${serialized},`);
}
function upsertStringArrayProperty(block, property, values) {
    const serialized = `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
    const propertyPattern = new RegExp(`(${property}:\\s*)\\[[^\\]]*\\]`);
    if (propertyPattern.test(block)) {
        return block.replace(propertyPattern, `$1${serialized}`);
    }
    return insertPropertyAfterName(block, `      ${property}: ${serialized},`);
}
function upsertNumberProperty(block, property, value) {
    const propertyPattern = new RegExp(`(${property}:\\s*)\\d+`);
    if (propertyPattern.test(block)) {
        return block.replace(propertyPattern, `$1${value}`);
    }
    return insertPropertyAfterName(block, `      ${property}: ${value},`);
}
function upsertExpressionProperty(block, property, expression) {
    const propertyMatch = new RegExp(`${property}:\\s*`).exec(block);
    if (!propertyMatch || propertyMatch.index === undefined) {
        return insertPropertyAfterName(block, `      ${property}: ${expression},`);
    }
    const valueStart = propertyMatch.index + propertyMatch[0].length;
    const valueEnd = findPropertyValueEnd(block, valueStart);
    if (valueEnd < 0) {
        return block;
    }
    return `${block.slice(0, valueStart)}${expression}${block.slice(valueEnd)}`;
}
function replaceFirstCall(block, functionName, nextValue, filterPreviousValue = () => true) {
    const pattern = new RegExp(`${functionName}\\(\\s*(['"\`])((?:\\\\.|(?!\\1)[\\s\\S])*)\\1\\s*\\)`);
    const match = pattern.exec(block);
    if (!match || !filterPreviousValue(match[2] ?? "")) {
        return block;
    }
    return `${block.slice(0, match.index)}${functionName}(${JSON.stringify(nextValue)})${block.slice(match.index + match[0].length)}`;
}
function insertPropertyAfterName(block, line) {
    const nameLine = /name:\s*(['"`])(?:\\.|(?!\1)[\s\S])*\1,\n/.exec(block);
    if (!nameLine || nameLine.index === undefined) {
        return block;
    }
    const insertAt = nameLine.index + nameLine[0].length;
    return `${block.slice(0, insertAt)}${line}\n${block.slice(insertAt)}`;
}
function replaceStringLiteralCalls(content, functionName, previousValue, nextValue) {
    const pattern = new RegExp(`${functionName}\\(\\s*(['"\`])${escapeRegExp(previousValue)}\\1\\s*\\)`, "g");
    return content.replace(pattern, `${functionName}(${JSON.stringify(nextValue)})`);
}
function ensureSindicaImports(content, names) {
    const importMatch = /import\s+\{([\s\S]*?)\}\s+from\s+["']sindica["'];/.exec(content);
    if (!importMatch || importMatch.index === undefined) {
        return content;
    }
    const existing = new Set(importMatch[1]?.split(",").map((name) => name.trim()).filter(Boolean));
    let changed = false;
    for (const name of names) {
        if (!existing.has(name)) {
            existing.add(name);
            changed = true;
        }
    }
    if (!changed) {
        return content;
    }
    const sortedNames = [...existing].sort();
    const nextImport = `import {\n${sortedNames.map((name) => `  ${name},`).join("\n")}\n} from "sindica";`;
    return `${content.slice(0, importMatch.index)}${nextImport}${content.slice(importMatch.index + importMatch[0].length)}`;
}
function insertIntoArrayProperty(content, property, block) {
    const arrayLocation = locateArrayProperty(content, property);
    if (!arrayLocation) {
        throw new Error(`Could not find array property: ${property}`);
    }
    const body = content.slice(arrayLocation.start + 1, arrayLocation.end).trim();
    const normalizedBody = body.replace(/,\s*$/, "");
    const nextBody = normalizedBody ? `${normalizedBody},\n${block}` : `\n${block}\n  `;
    return `${content.slice(0, arrayLocation.start + 1)}${nextBody}${content.slice(arrayLocation.end)}`;
}
function removeObjectBlock(content, start, end) {
    let removeStart = start;
    let removeEnd = end;
    let after = end;
    while (/\s/.test(content[after] ?? "")) {
        after += 1;
    }
    if (content[after] === ",") {
        removeEnd = after + 1;
    }
    else {
        let before = start - 1;
        while (before >= 0 && /\s/.test(content[before] ?? "")) {
            before -= 1;
        }
        if (content[before] === ",") {
            removeStart = before;
        }
    }
    return `${content.slice(0, removeStart)}${content.slice(removeEnd)}`;
}
function locateArrayProperty(content, property) {
    const propertyMatch = new RegExp(`${property}:\\s*\\[`).exec(content);
    if (!propertyMatch || propertyMatch.index === undefined) {
        return undefined;
    }
    const start = content.indexOf("[", propertyMatch.index);
    if (start < 0) {
        return undefined;
    }
    const end = findMatchingBracket(content, start);
    if (end < 0) {
        return undefined;
    }
    return { start, end };
}
function findMatchingBracket(content, start) {
    let depth = 0;
    let quote;
    let escaped = false;
    for (let index = start; index < content.length; index += 1) {
        const char = content[index];
        if (quote) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === "\\") {
                escaped = true;
                continue;
            }
            if (char === quote) {
                quote = undefined;
            }
            continue;
        }
        if (char === "'" || char === "\"" || char === "`") {
            quote = char;
            continue;
        }
        if (char === "[")
            depth += 1;
        if (char === "]") {
            depth -= 1;
            if (depth === 0) {
                return index;
            }
        }
    }
    return -1;
}
function normalizePhaseId(value) {
    const trimmed = value.trim();
    if (!trimmed) {
        throw new Error("Missing phase.");
    }
    return trimmed.startsWith("phase:") ? trimmed : `phase:${slugify(trimmed)}`;
}
function uniqueRuleId(content, baseId) {
    const existingIds = new Set([...content.matchAll(/id:\s*(['"`])([^'"`]+)\1/g)].map((match) => match[2] ?? ""));
    let candidate = baseId;
    let index = 2;
    while (existingIds.has(candidate)) {
        candidate = `${baseId}-${index}`;
        index += 1;
    }
    return candidate;
}
function nextRulePriority(content) {
    const priorities = [...content.matchAll(/priority:\s*(\d+)/g)].map((match) => Number(match[1]));
    return Math.max(0, ...priorities) + 10;
}
function slugify(value) {
    return value
        .toLowerCase()
        .replace(/^phase:/, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "item";
}
function findMatchingBrace(content, start) {
    let depth = 0;
    let quote;
    let escaped = false;
    for (let index = start; index < content.length; index += 1) {
        const char = content[index];
        if (quote) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === "\\") {
                escaped = true;
                continue;
            }
            if (char === quote) {
                quote = undefined;
            }
            continue;
        }
        if (char === "'" || char === "\"" || char === "`") {
            quote = char;
            continue;
        }
        if (char === "{") {
            depth += 1;
        }
        else if (char === "}") {
            depth -= 1;
            if (depth === 0) {
                return index;
            }
        }
    }
    return -1;
}
function findPropertyValueEnd(content, start) {
    let parenDepth = 0;
    let braceDepth = 0;
    let bracketDepth = 0;
    let quote;
    let escaped = false;
    for (let index = start; index < content.length; index += 1) {
        const char = content[index];
        if (quote) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === "\\") {
                escaped = true;
                continue;
            }
            if (char === quote) {
                quote = undefined;
            }
            continue;
        }
        if (char === "'" || char === "\"" || char === "`") {
            quote = char;
            continue;
        }
        if (char === "(")
            parenDepth += 1;
        if (char === ")")
            parenDepth -= 1;
        if (char === "{")
            braceDepth += 1;
        if (char === "}")
            braceDepth -= 1;
        if (char === "[")
            bracketDepth += 1;
        if (char === "]")
            bracketDepth -= 1;
        if (char === "," &&
            parenDepth === 0 &&
            braceDepth === 0 &&
            bracketDepth === 0) {
            return index;
        }
    }
    return -1;
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function toPipelineView(pipeline) {
    const phaseIds = new Set();
    const candidateLabels = labelNames(pipeline);
    const candidateIssues = buildCandidateIssues(candidateLabels);
    const agents = [];
    const rules = pipeline.rules.map((rule) => {
        const inference = inferRuleCondition(rule, candidateIssues);
        const targetPhase = phaseFromActions(rule.actions);
        if (targetPhase) {
            phaseIds.add(targetPhase);
        }
        phaseIds.add(inference.sourceBox);
        const ruleView = {
            id: rule.id,
            priority: rule.priority,
            state: inference.state,
            phase: inference.sourceBox,
            actions: rule.actions.map(formatAction),
        };
        const assignedAgent = assignedAgentFromActions(rule.actions);
        if (assignedAgent) {
            ruleView.assignedAgent = assignedAgent;
        }
        if (targetPhase) {
            ruleView.targetPhase = targetPhase;
        }
        return ruleView;
    });
    for (const name of candidateLabels) {
        if (name.startsWith("phase:")) {
            phaseIds.add(name);
        }
    }
    for (const agent of pipeline.agents ?? []) {
        const phase = phaseForAgent(agent, rules);
        const agentRules = rules.filter((rule) => rule.assignedAgent === agent.name);
        const agentView = {
            name: agent.name,
            skills: [...(agent.skills ?? [])],
            state: agentRules[0]?.state ?? "any",
            instructions: agent.instructions,
            rules: agentRules,
        };
        if (agent.description) {
            agentView.description = agent.description;
        }
        if (phase) {
            agentView.phase = phase;
        }
        if (agent.model) {
            agentView.model = agent.model;
        }
        if (agent.thinkingLevel) {
            agentView.thinkingLevel = agent.thinkingLevel;
        }
        if (agent.runtimeProvider) {
            agentView.runtimeProvider = agent.runtimeProvider;
        }
        if (agent.customArgs) {
            agentView.customArgs = [...agent.customArgs];
        }
        if (agent.maxConcurrentTasks !== undefined) {
            agentView.maxConcurrentTasks = agent.maxConcurrentTasks;
        }
        if (agent.visibility) {
            agentView.visibility = agent.visibility;
        }
        agents.push(agentView);
    }
    const phases = layoutBoxes([...phaseIds], rules, agents);
    return {
        name: pipeline.name,
        routerName: pipeline.router.name,
        phases,
        agents,
        rules,
    };
}
function layoutBoxes(boxIds, rules, agents) {
    const uniqueIds = unique(boxIds);
    return topologicalBoxOrder(uniqueIds, rules).map((id, index) => {
        const ruleCount = rules.filter((rule) => rule.phase === id).length;
        const agentCount = agents.filter((agent) => agent.phase === id).length;
        return {
            id,
            label: boxLabel(id),
            x: 40 + index * 340,
            y: 40,
            width: 280,
            height: boxHeight(ruleCount, agentCount),
        };
    });
}
function topologicalBoxOrder(boxIds, rules) {
    const idSet = new Set(boxIds);
    const outgoing = new Map();
    const indegree = new Map();
    for (const id of boxIds) {
        outgoing.set(id, new Set());
        indegree.set(id, 0);
    }
    const edges = rules
        .filter((rule) => rule.targetPhase &&
        rule.targetPhase !== rule.phase &&
        idSet.has(rule.phase) &&
        idSet.has(rule.targetPhase))
        .map((rule) => ({
        source: rule.phase,
        target: rule.targetPhase,
        priority: rule.priority,
    }))
        .sort((left, right) => left.priority - right.priority ||
        compareBoxIds(left.source, right.source) ||
        compareBoxIds(left.target, right.target));
    for (const edge of edges) {
        if (createsPath(outgoing, edge.target, edge.source)) {
            continue;
        }
        const targets = outgoing.get(edge.source);
        if (!targets || targets.has(edge.target)) {
            continue;
        }
        targets.add(edge.target);
        indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    }
    const available = boxIds
        .filter((id) => (indegree.get(id) ?? 0) === 0)
        .sort(compareBoxIds);
    const ordered = [];
    while (available.length > 0) {
        const id = available.shift();
        if (!id) {
            break;
        }
        ordered.push(id);
        for (const target of [...(outgoing.get(id) ?? [])].sort(compareBoxIds)) {
            const nextIndegree = (indegree.get(target) ?? 0) - 1;
            indegree.set(target, nextIndegree);
            if (nextIndegree === 0) {
                available.push(target);
                available.sort(compareBoxIds);
            }
        }
    }
    const remaining = boxIds
        .filter((id) => !ordered.includes(id))
        .sort(compareBoxIds);
    return [...ordered, ...remaining];
}
function createsPath(outgoing, source, target) {
    const visited = new Set();
    const queue = [source];
    while (queue.length > 0) {
        const current = queue.shift();
        if (!current || visited.has(current)) {
            continue;
        }
        if (current === target) {
            return true;
        }
        visited.add(current);
        queue.push(...(outgoing.get(current) ?? []));
    }
    return false;
}
function boxHeight(ruleCount, agentCount) {
    const ruleRows = Math.max(1, Math.ceil(ruleCount / 2));
    const agentRows = Math.max(1, Math.ceil(agentCount / 3));
    return Math.max(170, 58 + ruleRows * 52 + agentRows * 92);
}
function compareBoxIds(left, right) {
    const leftRank = boxRank(left);
    const rightRank = boxRank(right);
    if (leftRank !== rightRank) {
        return leftRank - rightRank;
    }
    return left.localeCompare(right);
}
function boxRank(id) {
    if (id === "status:todo")
        return 0;
    if (id.startsWith("status:"))
        return 1;
    if (id === "phase:alexo")
        return 2;
    if (id.startsWith("phase:"))
        return 3;
    return 4;
}
function labelNames(pipeline) {
    return [...new Set((pipeline.labels ?? []).map((label) => typeof label === "string" ? label : label.name))];
}
function inferRuleCondition(rule, candidates) {
    const matched = candidates.filter((issue) => safeMatch(rule, issue));
    if (matched.length === 0) {
        return inferRuleConditionFromSource(rule);
    }
    const sourcePhases = unique(matched.flatMap((issue) => issue.labels.values.filter((label) => label.startsWith("phase:"))));
    const statuses = unique(matched.map((issue) => issue.status));
    const state = collapseStatuses(statuses);
    if (sourcePhases.length === 1) {
        return { sourceBox: sourcePhases[0] ?? "any", state };
    }
    if (sourcePhases.length > 1) {
        return { sourceBox: "phase:any", state };
    }
    if (state !== "any") {
        return { sourceBox: `status:${normalizeStatusId(state)}`, state };
    }
    return { sourceBox: "any", state };
}
function inferRuleConditionFromSource(rule) {
    const source = rule.match.toString();
    const sourcePhases = extractPhaseLabels(source);
    const state = extractStatus(source);
    return {
        sourceBox: sourcePhases[0] ?? (state === "any" ? "any" : `status:${normalizeStatusId(state)}`),
        state,
    };
}
function safeMatch(rule, issue) {
    try {
        return rule.match(issue);
    }
    catch {
        return false;
    }
}
function buildCandidateIssues(labels) {
    const phaseLabels = labels.filter((label) => label.startsWith("phase:"));
    const nonPhaseLabels = labels.filter((label) => !label.startsWith("phase:"));
    const labelSets = [
        [],
        ...nonPhaseLabels.map((label) => [label]),
        ...phaseLabels.map((label) => [label]),
    ];
    for (const phase of phaseLabels) {
        for (const label of nonPhaseLabels) {
            labelSets.push([phase, label]);
        }
    }
    const uniqueLabelSets = uniqueBy(labelSets, (set) => set.slice().sort().join("\0"));
    const issues = [];
    for (const status of STATUS_CANDIDATES) {
        for (const labelSet of uniqueLabelSets) {
            issues.push(fakeIssue(status, labelSet));
        }
    }
    return issues;
}
function fakeIssue(status, labels) {
    return {
        id: `candidate-${status}-${labels.join("-") || "none"}`,
        title: "Candidate issue",
        open: true,
        status,
        labels: createLabels(labels),
    };
}
function collapseStatuses(statuses) {
    const normalized = unique(statuses.map(normalizeStatusId));
    if (normalized.length === 1) {
        return normalized[0] ?? "any";
    }
    return "any";
}
function normalizeStatusId(status) {
    return status.toLowerCase().replace(/\s+/g, "_");
}
function boxLabel(id) {
    if (id.startsWith("status:")) {
        return titleize(id.slice("status:".length));
    }
    if (id === "phase:any") {
        return "Any phase";
    }
    if (id === "any") {
        return "Any";
    }
    return id;
}
function titleize(value) {
    return value
        .split(/[-_:]/g)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}
function unique(values) {
    return [...new Set(values)];
}
function uniqueBy(values, keyFor) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
        const key = keyFor(value);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(value);
    }
    return result;
}
function phaseForAgent(agent, rules) {
    return rules.find((rule) => rule.assignedAgent === agent.name)?.targetPhase;
}
function phaseFromActions(actions) {
    return actions.find(isPhaseAddLabel)?.label;
}
function isPhaseAddLabel(action) {
    return action.type === "addLabel" && action.label.startsWith("phase:");
}
function assignedAgentFromActions(actions) {
    return actions.find((action) => action.type === "assignAgent")?.agent;
}
function extractPhaseLabels(source) {
    return extractStrings(source).filter((value) => value.startsWith("phase:"));
}
function extractStatus(source) {
    const values = extractStrings(source);
    return values.find((value) => ["todo", "TODO", "in_review", "In Review", "a_validar_homolog", "Validating Homolog"].includes(value)) ?? "any";
}
function extractStrings(source) {
    const matches = source.matchAll(/["'`]([^"'`]+)["'`]/g);
    return [...matches].map((match) => match[1] ?? "");
}
function formatAction(action) {
    if (action.type === "addLabel") {
        return `add label ${action.label}`;
    }
    if (action.type === "removeLabel") {
        return `remove label ${action.label}`;
    }
    if (action.type === "moveStatus") {
        return `move status ${action.status}`;
    }
    if (action.type === "assignAgent") {
        return `assign ${action.agent}`;
    }
    return "comment";
}
async function openBrowser(url) {
    const command = process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
            ? "cmd"
            : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    try {
        await execFileAsync(command, args);
    }
    catch {
        console.log(`Open ${url} in your browser.`);
    }
}
function emptyConfig() {
    return `import {
  addLabel,
  assignAgent,
  comment,
  definePipeline,
} from "sindica";

export default definePipeline({
  name: "new-workflow",
  router: {
    name: "New Workflow Router",
    schedule: "*/10 * * * *",
    timezone: "UTC",
  },
  labels: [],
  skills: [],
  agents: [],
  conflictPolicy: "fail",
  rules: [],
});
`;
}
async function readJsonBody(request) {
    const chunks = [];
    for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function sendHtml(response, html) {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
}
function sendJson(response, value, status = 200) {
    response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(value));
}
function sendText(response, text, status = 200) {
    response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
    response.end(text);
}
function editorHtml() {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sindica Editor</title>
  <style>
    :root { color-scheme: light; --border: #d4d4d8; --text: #18181b; --muted: #71717a; --panel: #fafafa; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--text); background: #f4f4f5; }
    header { height: 48px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border-bottom: 1px solid var(--border); background: white; }
    main { height: calc(100vh - 48px); display: grid; grid-template-columns: minmax(420px, 1fr) 520px; }
    button, input { font: inherit; }
    button { border: 1px solid var(--border); background: white; border-radius: 6px; padding: 6px 10px; cursor: pointer; }
    button:hover { background: #f4f4f5; }
    input { border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; min-width: 280px; }
    #canvasWrap { position: relative; overflow: auto; background: #f8fafc; }
    #canvas { position: relative; width: 1400px; min-height: 1000px; }
    .phase { position: absolute; min-width: 280px; min-height: 140px; border: 2px solid #94a3b8; background: rgba(255,255,255,.84); border-radius: 8px; overflow: auto; box-shadow: 0 6px 20px rgba(15,23,42,.08); }
    .phaseHeader { height: 32px; display: flex; align-items: center; padding: 0 10px; border-bottom: 1px solid var(--border); font-weight: 650; font-size: 13px; cursor: move; background: #f8fafc; border-radius: 6px 6px 0 0; }
    .phaseSection { padding: 10px 12px 0; font-size: 11px; font-weight: 650; color: #52525b; text-transform: uppercase; letter-spacing: .04em; }
    .rulesInBox, .agents { display: flex; flex-wrap: wrap; gap: 10px; padding: 8px 12px 12px; }
    .ruleNode { border: 1px solid #a16207; background: #fef3c7; border-radius: 6px; padding: 6px 8px; font-size: 11px; line-height: 1.15; text-align: left; max-width: 150px; cursor: pointer; }
    .ruleNode:hover { outline: 3px solid rgba(245,158,11,.24); }
    .agent { width: 74px; height: 74px; border-radius: 50%; border: 2px solid #0f766e; background: #ccfbf1; display: flex; align-items: center; justify-content: center; text-align: center; padding: 6px; font-size: 11px; line-height: 1.1; cursor: pointer; }
    .agent:hover { outline: 3px solid rgba(20,184,166,.24); }
    #side { border-left: 1px solid var(--border); background: white; min-width: 0; min-height: 0; }
    #details { height: 100%; padding: 12px; background: var(--panel); overflow: auto; }
    #details h2 { margin: 0 0 8px; font-size: 16px; }
    #details p { margin: 4px 0; color: var(--muted); font-size: 13px; }
    #details h3 { margin: 14px 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #52525b; }
    .kv { display: grid; grid-template-columns: 132px minmax(0, 1fr); gap: 6px 10px; margin-top: 8px; font-size: 13px; }
    .kv .key { color: var(--muted); }
    .kv .value { color: var(--text); overflow-wrap: anywhere; }
    .pillRow { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .pill { border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px; background: white; font-size: 12px; }
    .configBlock { white-space: pre-wrap; border: 1px solid var(--border); background: white; border-radius: 6px; padding: 8px; margin: 6px 0 0; font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; max-height: 220px; overflow: auto; }
    #editor { display: none; }
    .fieldGrid { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 8px 10px; align-items: center; margin-top: 10px; }
    .fieldGrid label { color: var(--muted); font-size: 13px; }
    .fieldGrid input, .fieldGrid textarea { min-width: 0; width: 100%; background: white; border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; }
    .fieldGrid textarea { min-height: 180px; resize: vertical; font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .detailActions { display: flex; gap: 8px; margin-top: 14px; justify-content: flex-end; }
    .dangerButton { border-color: #dc2626; color: #b91c1c; }
    .dangerButton:hover { background: #fef2f2; }
    .notice { border: 1px solid #f59e0b; background: #fffbeb; border-radius: 6px; padding: 10px; margin: 12px; color: #713f12; }
    .status { margin-left: auto; color: var(--muted); font-size: 13px; }
    .rule { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; padding: 3px 0; }
    .linkButton { border: 0; background: transparent; color: #0369a1; padding: 0; border-radius: 0; font: inherit; text-decoration: underline; text-underline-offset: 2px; }
    .linkButton:hover { background: transparent; color: #075985; }
    .empty { color: var(--muted); padding: 32px; }
  </style>
</head>
<body>
  <header>
    <strong>Sindica Editor</strong>
    <input id="path" placeholder="examples/condominio-padrao.sindica.ts">
    <button id="open">Open</button>
    <button id="newPhase">New phase</button>
    <button id="save">Save</button>
    <span id="status" class="status"></span>
  </header>
  <main>
    <section id="canvasWrap"><div id="canvas"></div></section>
    <section id="side">
      <div id="details"><h2>No selection</h2><p>Open a workflow or click a phase/agent.</p></div>
      <textarea id="editor" spellcheck="false"></textarea>
    </section>
  </main>
  <script>
    const state = { doc: null, selected: null };
    const pathInput = document.getElementById("path");
    const statusEl = document.getElementById("status");
    const editor = document.getElementById("editor");
    const canvas = document.getElementById("canvas");
    const details = document.getElementById("details");

    document.getElementById("open").onclick = () => loadDocument(pathInput.value);
    document.getElementById("newPhase").onclick = newPhase;
    document.getElementById("save").onclick = saveDocument;
    details.addEventListener("input", markDirty);
    window.addEventListener("beforeunload", (event) => {
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });

    loadDocument(new URLSearchParams(location.search).get("path") || "");

    async function loadDocument(path, template) {
      setStatus("Loading...");
      const url = new URL("/api/document", location.origin);
      if (path) url.searchParams.set("path", path);
      if (template) url.searchParams.set("new", template);
      const response = await fetch(url);
      state.doc = await response.json();
      pathInput.value = state.doc.path || path || "";
      editor.value = state.doc.content || "";
      state.dirty = false;
      render();
      setStatus(state.doc.error ? state.doc.error : state.doc.missing ? "File does not exist" : "Loaded");
    }

    async function saveDocument() {
      const path = pathInput.value.trim();
      if (!path) {
        setStatus("Choose a file path before saving.");
        return;
      }
      const response = await fetch("/api/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path, content: editor.value }),
      });
      const result = await response.json();
      setStatus(result.ok ? "Saved" : result.error);
      if (result.ok) {
        state.doc.path = result.path;
        pathInput.value = result.path;
        state.dirty = false;
      }
    }

    function render() {
      canvas.innerHTML = "";
      const pipeline = state.doc && state.doc.pipeline;
      if (state.doc && state.doc.missing) {
        details.innerHTML = '<h2>Create workflow file?</h2>' +
          '<p>The selected file does not exist:</p>' +
          '<pre class="configBlock">' + escapeHtml(state.doc.path || '') + '</pre>' +
          '<div class="notice">Create a clean workflow or create it from the standard condo workflow, then save to this path.</div>' +
          '<div class="detailActions"><button id="createClean">Create clean</button><button id="createStandard">Use standard condo workflow</button></div>';
        document.getElementById('createClean').onclick = () => createClean();
        document.getElementById('createStandard').onclick = () => createFromStandard();
        canvas.innerHTML = '<div class="empty">Choose whether to create this new workflow file from the standard template.</div>';
        return;
      }
      if (!pipeline) {
        canvas.innerHTML = '<div class="empty">No visual model available. Edit the TypeScript file directly.</div>';
        return;
      }

      resizeCanvas(pipeline);

      for (const phase of pipeline.phases) {
        const el = document.createElement("div");
        el.className = "phase";
        el.style.left = phase.x + "px";
        el.style.top = phase.y + "px";
        el.style.width = phase.width + "px";
        el.style.minHeight = phase.height + "px";
        el.dataset.phase = phase.id;
        el.innerHTML = '<div class="phaseHeader">' + escapeHtml(phase.label) + '</div><div class="phaseSection">Rules</div><div class="rulesInBox"></div><div class="phaseSection">Agents</div><div class="agents"></div>';
        el.onclick = (event) => {
          if (event.target.closest('.agent, .ruleNode')) return;
          selectPhase(phase);
        };
        makeDraggable(el, el.querySelector(".phaseHeader"));
        canvas.appendChild(el);
      }

      for (const rule of pipeline.rules) {
        const host = canvas.querySelector('[data-phase="' + cssEscape(rule.phase || "") + '"] .rulesInBox');
        if (!host) continue;
        const el = document.createElement("button");
        el.className = "ruleNode";
        el.textContent = shortRule(rule);
        el.title = rule.id;
        el.onclick = (event) => { event.stopPropagation(); selectRule(rule); };
        host.appendChild(el);
      }

      for (const agent of pipeline.agents) {
        const host = canvas.querySelector('[data-phase="' + cssEscape(agent.phase || "") + '"] .agents');
        if (!host) continue;
        const el = document.createElement("button");
        el.className = "agent";
        el.textContent = shortName(agent.name);
        el.title = agent.name;
        el.onclick = (event) => { event.stopPropagation(); selectAgent(agent); };
        host.appendChild(el);
      }

      fitPhaseHeights();
      selectPipeline(pipeline);
    }

    function resizeCanvas(pipeline) {
      const maxRight = Math.max(1400, ...pipeline.phases.map(phase => phase.x + phase.width + 80));
      const maxBottom = Math.max(1000, ...pipeline.phases.map(phase => phase.y + phase.height + 80));
      canvas.style.width = maxRight + 'px';
      canvas.style.minHeight = maxBottom + 'px';
    }

    function fitPhaseHeights() {
      let maxBottom = 1000;
      for (const phaseEl of canvas.querySelectorAll('.phase')) {
        const height = Math.max(phaseEl.offsetHeight, phaseEl.scrollHeight);
        phaseEl.style.height = height + 'px';
        maxBottom = Math.max(maxBottom, phaseEl.offsetTop + height + 80);
      }
      canvas.style.minHeight = maxBottom + 'px';
    }

    function selectPipeline(pipeline) {
      details.innerHTML = '<h2>' + escapeHtml(pipeline.name) + '</h2>' +
        '<p>Router: ' + escapeHtml(pipeline.routerName) + '</p>' +
        '<p>Phases: ' + pipeline.phases.length + ' · Agents: ' + pipeline.agents.length + ' · Rules: ' + pipeline.rules.length + '</p>' +
        pipeline.rules.map(rule => '<div class="rule">' + escapeHtml(rule.id + ': ' + rule.phase + ' + ' + rule.state + ' -> ' + (rule.targetPhase || 'no phase') + ' / ' + (rule.assignedAgent || 'no agent')) + '</div>').join("");
    }

    function selectPhase(phase) {
      const rules = state.doc.pipeline.rules.filter(rule => rule.phase === phase.id || rule.targetPhase === phase.id);
      details.innerHTML = '<h2>' + escapeHtml(phase.label) + '</h2>' +
        '<p>Phase box. Resize it from the bottom-right corner or drag the header.</p>' +
        '<div class="detailActions"><button id="newAgent">New agent</button></div>' +
        rules.map(rule => '<div class="rule">' + linkedRuleSummary(rule) + '</div>').join("");
      document.getElementById('newAgent').onclick = () => newAgent(phase);
    }

    function selectRule(rule) {
      details.innerHTML = '<h2>' + escapeHtml(rule.id) + '</h2>' +
        '<div class="fieldGrid">' +
          field('ID', 'ruleId', rule.id) +
          field('Priority', 'rulePriority', rule.priority) +
          field('Target phase', 'ruleTargetPhase', rule.targetPhase || '') +
          field('Agent', 'ruleAgent', rule.assignedAgent || '') +
        '</div>' +
        '<div class="kv">' +
          kv('Source', rule.phase || 'any') +
          kv('State', rule.state || 'any') +
        '</div>' +
        '<h3>Actions</h3>' +
        rule.actions.map(action => '<div class="rule">' + linkedAction(action) + '</div>').join('') +
        '<div class="detailActions"><button id="saveRule">Save rule</button></div>';
      document.getElementById('saveRule').onclick = () => saveRule(rule);
    }

    function selectAgent(agent) {
      details.innerHTML = '<h2>' + escapeHtml(agent.name) + '</h2>' +
        '<p>' + escapeHtml(agent.description || "") + '</p>' +
        '<div class="fieldGrid">' +
          field('Name', 'agentName', agent.name) +
          field('Description', 'agentDescription', agent.description || '') +
          field('Runtime', 'agentRuntime', agent.runtimeProvider || '') +
          field('Model', 'agentModel', agent.model || '') +
          field('Thinking', 'agentThinking', agent.thinkingLevel || '') +
          field('Skills', 'agentSkills', agent.skills.join(', ')) +
          textareaField('Instructions', 'agentInstructions', agent.instructions || '') +
        '</div>' +
        '<div class="kv">' +
          kv('Phase', agent.phase || 'any') +
          kv('State', agent.state || 'any') +
          kv('Visibility', agent.visibility || 'default') +
          kv('Max concurrent', agent.maxConcurrentTasks ?? 'default') +
        '</div>' +
        '<h3>Routing rules</h3>' +
        (agent.rules.length ? agent.rules.map(rule => '<div class="rule">' + linkedRuleSummary(rule) + '</div>').join('') : '<p>No routing rule assigns this agent.</p>') +
        '<h3>Custom args</h3>' +
        (agent.customArgs && agent.customArgs.length ? '<pre class="configBlock">' + escapeHtml(agent.customArgs.join('\\n')) + '</pre>' : '<p>None</p>') +
        '<div class="detailActions"><button id="deleteAgent" class="dangerButton">Exclude agent</button><button id="saveAgent">Save agent</button></div>';
      document.getElementById('saveAgent').onclick = () => saveAgent(agent);
      document.getElementById('deleteAgent').onclick = () => deleteAgent(agent);
    }

    function createClean() {
      const targetPath = state.doc && state.doc.path;
      const content = ${JSON.stringify(emptyConfig())};
      state.doc = { path: targetPath, content };
      pathInput.value = targetPath || '';
      editor.value = content;
      state.dirty = true;
      render();
      setStatus('Clean workflow loaded. Click Save to create the file.');
    }

    async function createFromStandard() {
      const targetPath = state.doc && state.doc.path;
      const response = await fetch('/api/document?new=condominio-padrao');
      const templateDoc = await response.json();
      state.doc = { path: targetPath, content: templateDoc.content, pipeline: templateDoc.pipeline };
      pathInput.value = targetPath || '';
      editor.value = templateDoc.content || '';
      state.dirty = true;
      render();
      setStatus('Standard workflow loaded. Click Save to create the file.');
    }

    async function saveAgent(agent) {
      const path = pathInput.value.trim();
      if (!path) {
        setStatus('Choose a file path before saving.');
        return;
      }
      const payload = {
        path,
        content: editor.value,
        originalName: agent.name,
        name: document.getElementById('agentName').value.trim(),
        description: document.getElementById('agentDescription').value.trim(),
        runtimeProvider: document.getElementById('agentRuntime').value.trim(),
        model: document.getElementById('agentModel').value.trim(),
        thinkingLevel: document.getElementById('agentThinking').value.trim(),
        skills: document.getElementById('agentSkills').value.split(',').map(value => value.trim()).filter(Boolean),
        instructions: document.getElementById('agentInstructions').value,
      };
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!result.ok) {
        setStatus(result.error || 'Could not save agent.');
        return;
      }
      editor.value = result.content;
      await refreshDocument({ type: 'agent', name: payload.name });
      state.dirty = false;
      setStatus('Agent saved.');
    }

    async function saveRule(rule) {
      const path = pathInput.value.trim();
      if (!path) {
        setStatus('Choose a file path before saving.');
        return;
      }
      const payload = {
        path,
        content: editor.value,
        originalId: rule.id,
        id: document.getElementById('ruleId').value.trim(),
        priority: Number.parseInt(document.getElementById('rulePriority').value, 10),
        targetPhase: document.getElementById('ruleTargetPhase').value.trim(),
        assignedAgent: document.getElementById('ruleAgent').value.trim(),
      };
      const response = await fetch('/api/rule', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!result.ok) {
        setStatus(result.error || 'Could not save rule.');
        return;
      }
      editor.value = result.content;
      await refreshDocument({ type: 'rule', id: payload.id });
      state.dirty = false;
      setStatus('Rule saved.');
    }

    async function deleteAgent(agent) {
      if (!window.confirm('Exclude agent "' + agent.name + '" and its assigning rules?')) {
        return;
      }
      const path = pathInput.value.trim();
      if (!path) {
        setStatus('Choose a file path before deleting an agent.');
        return;
      }
      const response = await fetch('/api/agent/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path, content: editor.value, name: agent.name }),
      });
      const result = await response.json();
      if (!result.ok) {
        setStatus(result.error || 'Could not delete agent.');
        return;
      }
      editor.value = result.content;
      await refreshDocument({ type: 'pipeline' });
      state.dirty = false;
      setStatus('Agent deleted.');
    }

    async function newAgent(phase) {
      const name = window.prompt('Agent name');
      if (!name) return;
      const path = pathInput.value.trim();
      if (!path) {
        setStatus('Choose a file path before creating an agent.');
        return;
      }
      const response = await fetch('/api/agent/new', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path, content: editor.value, phase: phase.id, name }),
      });
      const result = await response.json();
      if (!result.ok) {
        setStatus(result.error || 'Could not create agent.');
        return;
      }
      editor.value = result.content;
      await refreshDocument({ type: 'agent', name });
      state.dirty = false;
      setStatus('Agent created.');
    }

    async function newPhase() {
      const name = window.prompt('Phase name');
      if (!name) return;
      const path = pathInput.value.trim();
      if (!path) {
        setStatus('Choose a file path before creating a phase.');
        return;
      }
      const phase = name.trim().startsWith('phase:') ? name.trim() : 'phase:' + slugify(name);
      const response = await fetch('/api/phase/new', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path, content: editor.value, phase }),
      });
      const result = await response.json();
      if (!result.ok) {
        setStatus(result.error || 'Could not create phase.');
        return;
      }
      editor.value = result.content;
      await refreshDocument({ type: 'phase', id: phase });
      state.dirty = false;
      setStatus('Phase created.');
    }

    async function refreshDocument(selection) {
      const path = pathInput.value.trim();
      const url = new URL('/api/document', location.origin);
      if (path) url.searchParams.set('path', path);
      const response = await fetch(url);
      state.doc = await response.json();
      editor.value = state.doc.content || editor.value;
      render();
      if (!state.doc.pipeline) return;
      if (selection.type === 'agent') {
        const agent = state.doc.pipeline.agents.find(agent => agent.name === selection.name);
        if (agent) selectAgent(agent);
      }
      if (selection.type === 'rule') {
        const rule = state.doc.pipeline.rules.find(rule => rule.id === selection.id);
        if (rule) selectRule(rule);
      }
      if (selection.type === 'phase') {
        const phase = state.doc.pipeline.phases.find(phase => phase.id === selection.id);
        if (phase) selectPhase(phase);
      }
      scrollToSelection(selection);
    }

    function scrollToSelection(selection) {
      let selector = '';
      if (selection.type === 'agent') selector = '.agent[title="' + cssEscape(selection.name) + '"]';
      if (selection.type === 'phase') selector = '[data-phase="' + cssEscape(selection.id) + '"]';
      if (!selector) return;
      const el = canvas.querySelector(selector);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }

    function linkedRuleSummary(rule) {
      return escapeHtml(rule.id + ': ') +
        linkPhase(rule.phase) +
        escapeHtml(' + ' + rule.state + ' -> ') +
        (rule.targetPhase ? linkPhase(rule.targetPhase) : escapeHtml('no phase')) +
        (rule.assignedAgent ? escapeHtml(' / ') + linkAgent(rule.assignedAgent) : '');
    }

    function linkedAction(action) {
      if (action.startsWith('assign ')) {
        return escapeHtml('assign ') + linkAgent(action.slice('assign '.length));
      }
      if (action.startsWith('add label phase:')) {
        return escapeHtml('add label ') + linkPhase(action.slice('add label '.length));
      }
      if (action.startsWith('remove label phase:')) {
        return escapeHtml('remove label ') + linkPhase(action.slice('remove label '.length));
      }
      return escapeHtml(action);
    }

    function linkAgent(name) {
      return '<button class="linkButton" data-agent="' + escapeAttribute(name) + '">' + escapeHtml(name) + '</button>';
    }

    function linkPhase(phase) {
      return '<button class="linkButton" data-phase-link="' + escapeAttribute(phase) + '">' + escapeHtml(phase) + '</button>';
    }

    details.addEventListener('click', (event) => {
      const agentLink = event.target.closest('[data-agent]');
      if (agentLink) {
        const agent = state.doc.pipeline.agents.find(agent => agent.name === agentLink.dataset.agent);
        if (agent) {
          selectAgent(agent);
          scrollToSelection({ type: 'agent', name: agent.name });
        }
        return;
      }
      const phaseLink = event.target.closest('[data-phase-link]');
      if (phaseLink) {
        const phase = state.doc.pipeline.phases.find(phase => phase.id === phaseLink.dataset.phaseLink);
        if (phase) {
          selectPhase(phase);
          scrollToSelection({ type: 'phase', id: phase.id });
        }
      }
    });

    function field(label, id, value) {
      return '<label for="' + id + '">' + escapeHtml(label) + '</label><input id="' + id + '" value="' + escapeAttribute(value) + '">';
    }

    function textareaField(label, id, value) {
      return '<label for="' + id + '">' + escapeHtml(label) + '</label><textarea id="' + id + '">' + escapeHtml(value) + '</textarea>';
    }

    function kv(key, value) {
      return '<div class="key">' + escapeHtml(key) + '</div><div class="value">' + escapeHtml(value) + '</div>';
    }

    function pillRow(values) {
      if (!values || !values.length) return '<p>None</p>';
      return '<div class="pillRow">' + values.map(value => '<span class="pill">' + escapeHtml(value) + '</span>').join('') + '</div>';
    }

    function shortRule(rule) {
      const target = rule.targetPhase ? rule.targetPhase.replace(/^phase:/, '') : (rule.assignedAgent || 'action');
      return rule.id.replace(/^\\d+-/, '') + '\\n-> ' + target;
    }

    function makeDraggable(el, handle) {
      let start = null;
      handle.onpointerdown = (event) => {
        start = { x: event.clientX, y: event.clientY, left: el.offsetLeft, top: el.offsetTop };
        handle.setPointerCapture(event.pointerId);
      };
      handle.onpointermove = (event) => {
        if (!start) return;
        el.style.left = Math.max(0, start.left + event.clientX - start.x) + "px";
        el.style.top = Math.max(0, start.top + event.clientY - start.y) + "px";
      };
      handle.onpointerup = () => { start = null; };
    }

    function shortName(name) {
      return name.replace(/^Condo\\s+/, "").split(/\\s+/).slice(0, 2).join("\\n");
    }

    function setStatus(message) { statusEl.textContent = message || ""; }
    function markDirty() { state.dirty = true; }
    function slugify(value) {
      return value.toLowerCase().replace(/^phase:/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'new-phase';
    }
    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    }
    function escapeAttribute(value) {
      return escapeHtml(value).replace(new RegExp(String.fromCharCode(96), 'g'), '&#96;');
    }
    function cssEscape(value) {
      return value.replace(/["\\\\]/g, "\\\\$&");
    }
  </script>
</body>
</html>`;
}
//# sourceMappingURL=server.js.map