export interface CliArgs {
    command: string;
    configPath?: string;
    provider: string;
    fixture?: string;
    port?: number;
    openBrowser: boolean;
    targetDir?: string;
    yes?: boolean;
    projectName?: string;
    baseBranch?: string;
    runtime?: string;
    agent?: string;
    validationCommands?: string[];
}
export declare function parseArgs(argv: readonly string[]): CliArgs;
