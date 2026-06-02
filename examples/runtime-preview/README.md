# Generic Runtime Preview Example

This folder is a template for project-owned preview runtimes. It is not a
universal Sindica runtime. Copy the pattern into an application repository, then
adapt the Dockerfile, Compose services, commands, health checks, secrets, and
preview URL strategy to that project.

Start from the application runtime that already exists:

- If the project has a Dockerfile, compose around it first.
- If the project has Docker Compose, devcontainer, CI, or platform deployment
  config, infer the service topology from those files.
- Add Sindica and agent CLI dependencies only where the runtime actually needs
  to run agents.
- Keep stack-specific behavior behind commands such as `make preview-start`,
  `scripts/preview-start`, or environment variables.

## Files

- `Dockerfile`: example agent/runtime image. Replace the base image and package
  installation with the project stack.
- `docker-compose.yml`: example topology with one runtime service and one
  optional database service.
- `preview`: command dispatcher.
- `preview-start`: starts or refreshes a short-lived issue preview.
- `preview-status`: prints saved preview metadata.
- `preview-stop`: stops a preview and releases its port.
- `preview-gc`: stops expired previews.
- `preview-common.sh`: shared helper functions.
- `skills/condominio-alexo-preview/SKILL.md`: example skill instructions for a
  fast-path agent that publishes a preview URL.

## Required Adaptation

Set these environment variables or replace them with project scripts:

- `PREVIEW_INSTALL_COMMAND`: dependency installation command.
- `PREVIEW_BUILD_COMMAND`: optional build command.
- `PREVIEW_MIGRATE_COMMAND`: optional migration/setup command.
- `PREVIEW_START_COMMAND`: command that starts the app and listens on `$PORT`.
- `PREVIEW_HEALTH_COMMAND`: optional custom health check command.
- `PREVIEW_HEALTH_PATH`: HTTP path used when no custom health command exists.
- `PREVIEW_HOST`: host name used in the URL printed for humans.
- `PREVIEW_TTL_HOURS`: preview lifetime.

The preview scripts do not assume Node, Rails, Python, Go, or any other stack.
They only allocate a port, run the configured commands, save metadata, and clean
up expired previews.

## Example

```bash
docker compose -f examples/runtime-preview/docker-compose.yml up --build

docker compose -f examples/runtime-preview/docker-compose.yml exec runtime \
  preview start --issue 123 --branch codex/issue-123 --restart

docker compose -f examples/runtime-preview/docker-compose.yml exec runtime \
  preview status --issue 123

docker compose -f examples/runtime-preview/docker-compose.yml exec runtime \
  preview stop --issue 123
```

For Alexo, the agent should run the project-owned preview command, then comment
the returned URL on the issue or pull request.
