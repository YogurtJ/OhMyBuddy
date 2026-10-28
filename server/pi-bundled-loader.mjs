import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as sdk from '@earendil-works/pi-coding-agent';
import bundled from './pi-bundled-resources.js';
import { nativeExtensionFactories, selectedNativeBuiltins } from './pi-native-mcp.mjs';
import sessionImages from './pi-session-images.js';

// Match the pinned package's declared entry before loading it. Keep the legacy
// root entry for explicit paths; both must share the wrapper's unbundled factory.
const subagentManifest = createRequire(import.meta.url)('../vendor/pi-subagents/package.json');
const subagentEntries = new Set(['./index.js', ...subagentManifest.pi.extensions].map(entry =>
    fileURLToPath(new URL('../vendor/pi-subagents/' + entry, import.meta.url))));

// Build the same native resource inventory used by Settings, then let Pi load
// only selected paths. Filtering happens before any third-party factory runs.
export async function managedLoaderOptions({ cwd, agentDir, settings, parsed }) {
    const { resolved, settingsView } = await bundled.resolveManagedResources(sdk, { cwd, agentDir, settings });
    const paths = type => resolved[type].filter(item => item.enabled).map(item => item.path);
    const explicit = values => (values || []).filter(file => {
        if (bundled.obsoleteMcpAdapter(file, cwd)) return false;
        const entry = bundled.identify(file, cwd);
        if (!entry) return true;
        return entry.mode === 'package' && bundled.packageAt(file)?.root === fileURLToPath(new URL('../vendor/' + entry.name, import.meta.url));
    });
    const extensionPath = file => subagentEntries.has(file)
        ? fileURLToPath(new URL('./pi-bundled-subagents.mjs', import.meta.url)) : file;
    return { settingsView, options: {
        noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true,
        extensionFactories: [...await nativeExtensionFactories(parsed), pi => sessionImages.registerSessionImages(pi, agentDir)],
        disabledBuiltinExtensions: parsed.noMcp ? ['mcp'] : undefined,
        noContextFiles: parsed.noContextFiles, systemPrompt: parsed.systemPrompt, appendSystemPrompt: parsed.appendSystemPrompt,
        additionalExtensionPaths: [...new Set([...selectedNativeBuiltins(settingsView, parsed), ...explicit(parsed.extensions), ...(parsed.noExtensions ? [] : paths('extensions'))])].map(extensionPath),
        additionalSkillPaths: [...explicit(parsed.skills), ...(parsed.noSkills ? [] : paths('skills'))],
        additionalPromptTemplatePaths: [...explicit(parsed.promptTemplates), ...(parsed.noPromptTemplates ? [] : paths('prompts'))],
        additionalThemePaths: [...explicit(parsed.themes), ...(parsed.noThemes ? [] : paths('themes'))],
    } };
}
export function reloadableLoader(loader, input, initialOptions) {
    return new Proxy({}, { get(_target, prop) {
        if (prop === 'reload') return async () => {
            await input.settings.reload();
            const { options } = await managedLoaderOptions(input);
            // Keep the native loader and its reload/cache lifecycle. These are the
            // resource arrays supplied by this adapter to its public constructor.
            for (const key of ['additionalExtensionPaths', 'additionalSkillPaths', 'additionalPromptTemplatePaths', 'additionalThemePaths']) {
                initialOptions[key].splice(0, initialOptions[key].length, ...options[key]);
            }
            await loader.reload();
        };
        const value = loader[prop]; return typeof value === 'function' ? value.bind(loader) : value;
    } });
}
