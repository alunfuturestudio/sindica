---
name: condominio-implementar
description: Implements an issue from the PRD and accepted criteria.
---

# Condo Implement

Use this skill to implement the issue from the approved PRD.

Procedure:

1. Read the issue, comments, PRD, and acceptance criteria.
2. Create a branch from the base branch indicated by the agent.
3. Implement the smallest change consistent with the scope.
4. Add or adjust tests when there is regression risk.
5. Run the relevant checks.
6. Open or update the PR.
7. Comment on the issue with the summary, checks run, and PR.

If the PRD is insufficient, comment the blocker and add `blocked:human-help`.
