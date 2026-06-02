const message = `
Sindica installed.

To configure this repository, run:

  npx sindica config

The config command creates local workflow files, skills, mock fixture, Docker
Multica runtime, package scripts, and README-post-config.md.

Important: config does not deploy agents or autopilot. After config, read the
generated README-post-config.md, ask the human to start the Docker runtime with
MULTICA_TOKEN, then run sindica:doctor and sindica:deploy for the real provider.

If this is CI or a normal dependency install, no action is required.
`;
console.log(message.trim());
export {};
//# sourceMappingURL=postinstall.js.map