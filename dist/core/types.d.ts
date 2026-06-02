export type ProviderName = "mock" | "multica" | (string & {});
export type ConflictPolicy = "fail" | "first-match-by-priority";
export interface IssueLabels {
    values: readonly string[];
    has(label: string): boolean;
    absent(label: string): boolean;
    nonePrefix(prefix: string): boolean;
}
export interface Issue {
    id: string;
    title: string;
    open: boolean;
    status: string;
    labels: IssueLabels;
    assignee?: string;
    url?: string;
    raw?: unknown;
}
export type Action = {
    type: "addLabel";
    label: string;
} | {
    type: "removeLabel";
    label: string;
} | {
    type: "moveStatus";
    status: string;
} | {
    type: "assignAgent";
    agent: string;
} | {
    type: "comment";
    body: string;
};
export interface Rule {
    id: string;
    priority: number;
    match(issue: Issue): boolean;
    actions: readonly Action[];
}
export interface AgentConfig {
    name: string;
    description?: string;
    instructions: string;
    skills?: readonly string[];
    model?: string;
    thinkingLevel?: string;
    runtimeProvider?: string;
    customArgs?: readonly string[];
    maxConcurrentTasks?: number;
    visibility?: "private" | "workspace";
}
export interface LabelConfig {
    name: string;
    color?: string;
}
export interface SkillConfig {
    name: string;
    description?: string;
    contentPath: string;
    files?: readonly string[];
    config?: string;
}
export interface Pipeline {
    name: string;
    router: {
        name: string;
        schedule: string;
        timezone: string;
        agentName?: string;
        command?: string;
        customArgs?: readonly string[];
        description?: string;
        instructions?: string;
        model?: string;
        thinkingLevel?: string;
        runtimeProvider?: string;
        triggerLabel?: string;
    };
    skills?: readonly SkillConfig[];
    agents?: readonly AgentConfig[];
    labels?: readonly (string | LabelConfig)[];
    conflictPolicy: ConflictPolicy;
    rules: readonly Rule[];
}
export interface PlannedIssue {
    issue: Issue;
    rule: Rule;
    actions: readonly Action[];
}
export interface RuleConflict {
    issue: Issue;
    rules: readonly Rule[];
}
export interface ActionPlan {
    pipeline: Pipeline;
    planned: readonly PlannedIssue[];
    conflicts: readonly RuleConflict[];
}
export interface Provider {
    name: ProviderName;
    listIssues(): Promise<readonly Issue[]>;
    apply(plan: ActionPlan): Promise<void>;
    deploy(pipeline: Pipeline): Promise<void>;
    doctor(): Promise<void>;
}
