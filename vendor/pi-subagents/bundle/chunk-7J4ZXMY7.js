// src/inspectors/shell-command.ts
function shellQuote(value, platform) {
  if (platform === "win32") return `"${value.replaceAll('"', '\\"')}"`;
  return `'${value.replaceAll("'", "'\\''")}'`;
}
function isBareExecutable(value) {
  return /^[\w./@:-]+$/.test(value);
}
function formatShellCommand(exe, args, platform = process.platform) {
  const quotedArgs = args.map((arg) => shellQuote(arg, platform));
  if (platform === "win32") return `& ${[shellQuote(exe, platform), ...quotedArgs].join(" ")}`;
  const invocation = isBareExecutable(exe) ? exe : `sh -c 'exec "$0" "$@"' ${shellQuote(exe, platform)}`;
  return [invocation, ...quotedArgs].join(" ");
}

export {
  formatShellCommand
};
