---
name: condominio-validar-seguranca
description: Runs security validation before homologation.
---

# Condo Security Validation

Use this skill to review security risks before homologation.

Check:

1. Authorization and data isolation.
2. Input validation.
3. Exposure of secrets or sensitive data.
4. Changes in dependencies, queries, uploads, and external calls.
5. Logs and error messages.
6. All OWASP risks and best practices applicable to the changes.

Fix small problems when it is safe. For high risk or ambiguity, comment the
blocker and add `blocked:human-help`.
