---
name: condominio-alexo-preview
description: Implements a small issue through the fast path and publishes a project-owned preview.
---

# Condo Alexo Preview

Use this skill when a small issue is routed to the fast path and the project
supports short-lived previews.

## Flow

1. Read the current issue and confirm it is small enough for the fast path.
2. Create a branch from the configured base branch.
3. Implement the change using the project's normal commands and conventions.
4. Run validations proportional to the change. At minimum, run the configured
   lint and the most relevant tests.
5. Open or update a pull request against the configured base branch.
6. Start or refresh the preview with the project-owned command, for example:

   ```bash
   preview start --issue <issue-number> --branch <branch-name> --restart
   ```

7. Comment on the issue or pull request with:
   - implementation summary;
   - pull request URL;
   - preview URL returned by the command;
   - preview expiration time;
   - validation commands that passed.
8. Move the issue to the configured review status.

## Preview Contract

The preview command is owned by the project. It may use Docker Compose, a local
container, a platform deployment, a tunnel, or any other runtime. The only stable
contract for this skill is:

- it receives an issue number and branch name;
- it returns a URL that a human can open;
- it records enough metadata for status, stop, and garbage collection;
- it does not print secrets;
- it fails loudly when the preview is not healthy.

## Blockers

If the issue is not small, context is missing, validations cannot be fixed
safely, or preview creation fails:

1. Comment the blocker objectively.
2. Add the configured human-help/blocked label.
3. Do not trigger homologation.
