export interface ConfigOptions {
    targetDir: string;
    yes: boolean;
    projectName?: string;
    baseBranch?: string;
    configPath?: string;
    runtime?: string;
    agent?: string;
    validationCommands: readonly string[];
}
export declare function configureProject(options: ConfigOptions): Promise<void>;
