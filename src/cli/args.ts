import { Command, CommanderError } from "commander";

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

export function parseArgs(argv: readonly string[]): CliArgs {
  if (
    argv.length === 0 ||
    argv[0] === "help" ||
    argv[0] === "--help" ||
    argv[0] === "-h"
  ) {
    return { command: "help", provider: "mock", openBrowser: true };
  }

  let parsed: CliArgs | undefined;
  const program = createProgram((args) => {
    parsed = args;
  });

  try {
    program.parse(["node", "sindica", ...argv], { from: "node" });
  } catch (error) {
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

function createProgram(onParsed: (args: CliArgs) => void): Command {
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
    .action((targetDir: string, options: ConfigCommandOptions) => {
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
    .action((configPath: string, options: ProviderOptions) => {
      onParsed(providerCommand("plan", configPath, options));
    });

  program
    .command("run")
    .argument("<configPath>")
    .option("--provider <provider>", "provider adapter", "mock")
    .option("--fixture <fixture>", "mock provider fixture")
    .action((configPath: string, options: ProviderOptions) => {
      onParsed(providerCommand("run", configPath, options));
    });

  program
    .command("deploy")
    .argument("<configPath>")
    .option("--provider <provider>", "provider adapter", "mock")
    .action((configPath: string, options: ProviderOptions) => {
      onParsed(providerCommand("deploy", configPath, options));
    });

  program
    .command("doctor")
    .argument("<configPath>")
    .option("--provider <provider>", "provider adapter", "mock")
    .action((configPath: string, options: ProviderOptions) => {
      onParsed(providerCommand("doctor", configPath, options));
    });

  program
    .command("edit")
    .argument("[configPath]")
    .option("--port <port>", "local editor port", parsePort)
    .option("--no-open", "do not open the browser automatically")
    .action((configPath: string | undefined, options: EditOptions) => {
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

interface ProviderOptions {
  provider: string;
  fixture?: string;
}

interface EditOptions {
  port?: number;
  open: boolean;
}

interface ConfigCommandOptions {
  yes: boolean;
  projectName?: string;
  baseBranch?: string;
  configPath?: string;
  runtime: string;
  agent: string;
  validation: string[];
}

function collectValues(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function providerCommand(
  command: string,
  configPath: string,
  options: ProviderOptions
): CliArgs {
  return {
    command,
    configPath,
    provider: options.provider,
    openBrowser: true,
    ...(options.fixture ? { fixture: options.fixture } : {}),
  };
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}
