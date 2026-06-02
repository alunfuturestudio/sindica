import type { Pipeline } from "../core/types.js";
export interface EditorOptions {
    configPath?: string;
    port?: number;
    openBrowser: boolean;
}
interface PipelineView {
    name: string;
    routerName: string;
    phases: PhaseView[];
    agents: AgentView[];
    rules: RuleView[];
}
interface PhaseView {
    id: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
}
interface AgentView {
    name: string;
    description?: string;
    phase?: string;
    skills: string[];
    state: string;
    instructions: string;
    rules: RuleView[];
    model?: string;
    thinkingLevel?: string;
    runtimeProvider?: string;
    customArgs?: string[];
    maxConcurrentTasks?: number;
    visibility?: string;
}
interface RuleView {
    id: string;
    priority: number;
    state: string;
    phase: string;
    assignedAgent?: string;
    targetPhase?: string;
    actions: string[];
}
interface AgentUpdateRequest {
    path: string;
    content: string;
    originalName: string;
    name: string;
    description: string;
    runtimeProvider: string;
    model: string;
    thinkingLevel: string;
    skills: string[];
    instructions: string;
}
interface RuleUpdateRequest {
    path: string;
    content: string;
    originalId: string;
    id: string;
    priority: number;
    targetPhase: string;
    assignedAgent: string;
}
interface NewAgentRequest {
    path: string;
    content: string;
    phase: string;
    name: string;
}
interface NewPhaseRequest {
    path: string;
    content: string;
    phase: string;
}
interface DeleteAgentRequest {
    path: string;
    content: string;
    name: string;
}
export declare function startEditor(options: EditorOptions): Promise<void>;
export declare function updateAgentConfig(request: AgentUpdateRequest): string;
export declare function updateRuleConfig(request: RuleUpdateRequest): string;
export declare function addAgentConfig(request: NewAgentRequest): string;
export declare function addPhaseConfig(request: NewPhaseRequest): string;
export declare function deleteAgentConfig(request: DeleteAgentRequest): string;
export declare function toPipelineView(pipeline: Pipeline): PipelineView;
export {};
