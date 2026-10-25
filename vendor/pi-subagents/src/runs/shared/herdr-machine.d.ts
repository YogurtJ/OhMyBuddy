import type { ExternalProcessStatus, HerdrMachineReference, PlacementMachineReference } from "../../shared/types.ts";
import type { runExternalCli } from "./external-cli-runner.ts";
export { shellQuoteRemote as shellQuote } from "./herdr-connection.ts";
/** The local ssh process gets only what ssh itself needs; remote runs use the machine's own credentials. */
export declare const HERDR_SSH_ENV_ALLOWLIST: readonly ["PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "SSH_AUTH_SOCK"];
type RunExternalCliInput = Parameters<typeof runExternalCli>[0];
interface MachineSettingsEntry {
    cwd?: string;
    env?: Record<string, string>;
    /** User settings only: run this machine's children in Rex panes reached over SSH at `ssh`. */
    rex?: {
        ssh: string;
    };
}
export interface ResolveHerdrMachinePlacementInput {
    /** Profile id or label as typed by the operator. */
    machine: string;
    /** Local directory whose project settings hold `subagents.machines`. */
    cwd: string;
    /** Launch cwd: absolute or `~` paths are remote paths as given; relative paths join the configured machine root. */
    stepCwd?: string;
    env?: NodeJS.ProcessEnv;
    /** Test seam: catalog JSON instead of spawning `herdr machine list --json`. */
    catalogJson?: string;
    /** Test seam: settings entry instead of reading settings files. */
    settings?: MachineSettingsEntry;
    herdrBin?: string;
}
export interface HerdrMachinePlacement extends MachinePlacement {
    machine: HerdrMachineReference;
}
/** A resolved `machine` value: a Herdr saved machine, or the reserved `local` (a Rex pane on this machine). */
export interface MachinePlacement {
    machine: PlacementMachineReference;
    /** Opt-in `subagents.machines.<name>.env`, exported in front of the remote command. */
    env?: Record<string, string>;
}
export interface PreparedHerdrMachineExternalCliRun {
    input: RunExternalCliInput;
    decorateProcess(process: ExternalProcessStatus): ExternalProcessStatus;
}
export declare function resolveHerdrMachinePlacement(input: ResolveHerdrMachinePlacementInput): HerdrMachinePlacement;
/** `local` resolves to a Rex pane on this machine; a name with a `rex` entry in user settings to a Rex pane on that SSH host; any other value to a Herdr saved machine. */
export declare function resolveMachinePlacement(input: ResolveHerdrMachinePlacementInput): MachinePlacement;
export declare function formatHerdrMachineRunnerUnsupported(input: {
    machine?: string;
    agentName: string;
    runnerType?: string;
    adapter?: string;
    worktree?: boolean;
}): string | undefined;
/** Legacy local-child SSH wrapping is intentionally unavailable after the pane-native cut-over. */
export declare function prepareHerdrMachineExternalCliRun(input: RunExternalCliInput, placement: HerdrMachinePlacement | undefined, _options: {
    localCwd: string;
}): PreparedHerdrMachineExternalCliRun;
/** One-line operator hint for a predictable remote failure, matched against error text and the stderr tail. */
export declare function formatHerdrMachineHint(machine: HerdrMachineReference, text: string): string | undefined;
