import { Command, CommanderError } from "commander";
export function parseArgs(argv) {
    if (argv.length === 0 ||
        argv[0] === "help" ||
        argv[0] === "--help" ||
        argv[0] === "-h") {
        return { command: "help", provider: "mock", openBrowser: true };
    }
    let parsed;
    const program = createProgram((args) => {
        parsed = args;
    });
    try {
        program.parse(["node", "sindica", ...argv], { from: "node" });
    }
    catch (error) {
        if (error instanceof CommanderError && error.exitCode === 0) {
            return { command: "help", provider: "mock", openBrowser: true };
        }
        throw error;
    }
    if (!parsed) {
        throw new Error(`Unknown command: ${argv[0] ?? ""}`);
    }
    return parsed;
}
function createProgram(onParsed) {
    const program = new Command();
    program
        .name("sindica")
        .exitOverride()
        .configureOutput({
        writeOut: () => undefined,
        writeErr: () => undefined,
    });
    program
        .command("config")
        .argument("[targetDir]", "project directory", ".")
        .option("-y, --yes", "overwrite generated Sindica files when they already exist")
        .option("--project-name <name>", "project name used in generated files")
        .option("--base-branch <branch>", "base branch agents should branch from")
        .option("--config-path <path>", "generated workflow file path")
        .option("--runtime <runtime>", "runtime template", "docker-multica")
        .option("--agent <agent>", "agent CLI", "codex")
        .option("--validation <command>", "validation command; can be repeated", collectValues, [])
        .action((targetDir, options) => {
        onParsed({
            command: "config",
            provider: "mock",
            openBrowser: true,
            targetDir,
            yes: options.yes,
            ...(options.projectName ? { projectName: options.projectName } : {}),
            ...(options.baseBranch ? { baseBranch: options.baseBranch } : {}),
            ...(options.configPath ? { configPath: options.configPath } : {}),
            runtime: options.runtime,
            agent: options.agent,
            validationCommands: options.validation,
        });
    });
    program
        .command("plan")
        .argument("<configPath>")
        .option("--provider <provider>", "provider adapter", "mock")
        .option("--fixture <fixture>", "mock provider fixture")
        .action((configPath, options) => {
        onParsed(providerCommand("plan", configPath, options));
    });
    program
        .command("run")
        .argument("<configPath>")
        .option("--provider <provider>", "provider adapter", "mock")
        .option("--fixture <fixture>", "mock provider fixture")
        .action((configPath, options) => {
        onParsed(providerCommand("run", configPath, options));
    });
    program
        .command("deploy")
        .argument("<configPath>")
        .option("--provider <provider>", "provider adapter", "mock")
        .action((configPath, options) => {
        onParsed(providerCommand("deploy", configPath, options));
    });
    program
        .command("doctor")
        .argument("<configPath>")
        .option("--provider <provider>", "provider adapter", "mock")
        .action((configPath, options) => {
        onParsed(providerCommand("doctor", configPath, options));
    });
    program
        .command("edit")
        .argument("[configPath]")
        .option("--port <port>", "local editor port", parsePort)
        .option("--no-open", "do not open the browser automatically")
        .action((configPath, options) => {
        onParsed({
            command: "edit",
            provider: "mock",
            openBrowser: options.open,
            ...(configPath ? { configPath } : {}),
            ...(options.port ? { port: options.port } : {}),
        });
    });
    return program;
}
function collectValues(value, previous) {
    return [...previous, value];
}
function providerCommand(command, configPath, options) {
    return {
        command,
        configPath,
        provider: options.provider,
        openBrowser: true,
        ...(options.fixture ? { fixture: options.fixture } : {}),
    };
}
function parsePort(value) {
    const port = Number.parseInt(value, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid port: ${value}`);
    }
    return port;
}
//# sourceMappingURL=args.js.map