---
name: condominio-homolog
description: Prepares homologation and requests human validation.
---

# Condo Homolog

Use this skill to prepare human validation.

Deliver:

1. Add the `deploy-homolog` label to the pull request, not to the issue, so
   GitHub Actions can deploy homologation.
2. Link or access instructions for the homologation environment.
3. Required test data.
4. A short list of criteria the human should validate.
5. Guidance to add `homolog:approved` or `homolog:rejected` to the issue after
   human validation.

Do not approve homologation yourself. That decision is human-owned.
