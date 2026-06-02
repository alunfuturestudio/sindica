# Sindica

Sindica is a deterministic workflow router for AI-agent issue pipelines.

It does not decide with an LLM. It reads issue state, evaluates typed rules,
produces a plan, detects conflicts, and optionally applies actions through a
provider adapter.

## Install

Sindica requires Node.js 20 or newer.

Install it from npm:

```bash
npm install --save-dev sindica
```

Then configure the current project:

```bash
npx sindica config
```

The config command generates local files only: the standard condo workflow,
project-owned skills, a mock fixture, `sindica/setup-state.json`, package
scripts, a Docker Multica runtime, and a `README-post-config.md` file inside
your project.

After config finishes, Sindica setup is not complete. You must follow the
generated `README-post-config.md` and `sindica/setup-state.json`: validate the
mock plan, validate the mock run, ask the human to start the Docker Multica
runtime with `MULTICA_TOKEN`, complete Codex device auth inside that runtime,
choose the workspace, then run `sindica:doctor` and `sindica:deploy`. Deploy is
the step that creates or updates labels, skills, agents, the router, autopilot,
and trigger in Multica.

## Quick Check

```bash
npm run sindica:plan
```

For real provider setup, follow the generated `README-post-config.md`; do not
stop at `config` if agents and autopilot must exist in Multica.

## Existing Config

If Sindica files already exist and you want to regenerate the standard files:

```bash
npx sindica config --yes
```

Useful options:

```bash
npx sindica config \
  --project-name my-project \
  --base-branch main \
  --config-path my-project.sindica.ts \
  --validation "npm test" \
  --validation "npm run lint" \
  --validation "npm run typecheck" \
  --validation "npm run build"
```

## Commands

- `config`: configure Sindica in the current project.
- `plan`: load the TypeScript config, fetch issues, evaluate rules, and print
  planned actions.
- `run`: evaluate rules and apply planned actions through the provider.
- `doctor`: check provider connectivity.
- `deploy`: upsert provider-side labels, skills, agents, router, and autopilot.
- `edit`: open the local workflow editor.
