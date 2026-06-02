# Sindica Post-Config Reference

This is the operational guide generated into projects by `sindica config`.

The package README is intentionally short. Detailed setup lives in the generated
project file because the exact workflow name, base branch, validation commands,
runtime command, and repository paths are project-specific.

## Generated Files

`sindica config` creates:

```text
<project>.sindica.ts
sindica/issues.fixture.json
sindica/skills/condominio-alexo/SKILL.md
sindica/skills/condominio-refinar/SKILL.md
sindica/skills/condominio-prd/SKILL.md
sindica/skills/condominio-implementar/SKILL.md
sindica/skills/condominio-validar-codigo/SKILL.md
sindica/skills/condominio-validar-seguranca/SKILL.md
sindica/skills/condominio-homolog/SKILL.md
sindica/skills/condominio-aprovar/SKILL.md
docker/multica-runtime/Dockerfile
docker/multica-runtime/docker-compose.yml
docker/multica-runtime/start.sh
docker/multica-runtime/sindica.sh
docker/multica-runtime/sindica-run
docker/multica-runtime/README.md
README-post-config.md
```

It also adds package scripts when `package.json` exists:

```json
{
  "scripts": {
    "sindica:plan": "sindica plan <config> --provider mock --fixture sindica/issues.fixture.json",
    "sindica:run:mock": "sindica run <config> --provider mock --fixture sindica/issues.fixture.json",
    "sindica:doctor": "docker/multica-runtime/sindica.sh doctor <config> --provider multica",
    "sindica:deploy": "docker/multica-runtime/sindica.sh deploy <config> --provider multica"
  }
}
```

## MUST DO Checklist

1. MUST validate the mock workflow locally.
2. MUST ask the human to start the Docker Multica runtime with a real
   `MULTICA_TOKEN`.
3. MUST wait until the runtime is online and authenticated.
4. MUST choose the correct `MULTICA_WORKSPACE_ID`.
5. MUST run `sindica:doctor` and `sindica:deploy`.

`sindica:deploy` creates or updates labels, skills, agents, the router agent,
the router autopilot, and the schedule trigger. If deploy has not run, the
agents and autopilot are not configured in Multica yet.

## Mock Validation

Run this before touching the real provider:

```bash
npm run sindica:plan
npm run sindica:run:mock
```

The mock provider only uses `sindica/issues.fixture.json`.

## Multica Runtime

The Multica CLI is expected to run inside Docker. Do not require a host
`multica` binary.

Ask the human to start the runtime in a separate terminal:

```bash
MULTICA_TOKEN=mul_... docker/multica-runtime/start.sh \
  --device-name my-project-runtime-1 \
  --cli-codex
```

Do not continue to real-provider deploy until this command is running
successfully.

For private repositories, or agents that need to push branches/open PRs:

```bash
GITHUB_TOKEN=github_pat_... MULTICA_TOKEN=mul_... docker/multica-runtime/start.sh \
  --device-name my-project-runtime-1 \
  --cli-codex
```

The startup script:

1. Builds the Docker runtime.
2. Logs Multica in with `printf "%s\n" "$MULTICA_TOKEN" | multica login --token`.
3. Configures GitHub HTTPS credentials when `GITHUB_TOKEN` is present.
4. Runs `codex login --device-auth` inside the container when needed.
5. Starts `multica daemon start --foreground`.

Keep `MULTICA_TOKEN`, `MULTICA_WORKSPACE_ID`, and `GITHUB_TOKEN` out of tracked
files.

## Real Provider

After the runtime is online:

Choose the workspace ID for this project:

```bash
docker compose -f docker/multica-runtime/docker-compose.yml run --rm runtime \
  sh -lc 'multica workspace list --output json'
```

Then deploy:

```bash
MULTICA_WORKSPACE_ID=... npm run sindica:doctor
MULTICA_WORKSPACE_ID=... npm run sindica:deploy
```

`deploy` is an upsert:

- labels are created when missing;
- skills are created or updated from local files;
- agents are created or updated by name;
- the router agent is created or updated;
- the router autopilot and schedule trigger are created or updated.

## Agent Rule

When an agent is asked to configure Sindica, the work is not complete until:

1. The workflow, skills, fixture, and npm scripts exist.
2. `docker/multica-runtime/` exists.
3. `sindica:doctor` and `sindica:deploy` delegate to Docker.
4. `README-post-config.md` documents the exact runtime startup command.
5. `npm run sindica:plan` succeeds.
