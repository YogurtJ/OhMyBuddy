((root, factory) => {
    const policy = factory();
    if (typeof module === 'object' && module.exports) module.exports = policy;
    else root.PiFilePolicy = policy;
})(typeof window === 'object' ? window : globalThis, () => {
    const privateDirs = new Set(['.pi', '.ssh', '.aws', '.azure', '.gnupg', '.config', '.git', 'backups', '.web-backups', '.ohmybuddy-runtime', 'ohmybuddy-artifacts', 'ohmybuddy-uploads', 'ohmybuddy-queue', 'ohmybuddy-session-moves', '.pivane-runtime', 'pivane-artifacts', 'pivane-uploads', 'pivane-queue', 'pivane-session-moves']);
    function restricted(value) {
        return String(value).replace(/\\/g, '/').split('/').some(part => {
            part = part.toLowerCase();
            return privateDirs.has(part) || /^\.env(?:\.|$)/.test(part)
                || /^(?:auth|(?:ohmybuddy|pivane|pi5)-access|(?:ohmybuddy|pivane)-network|(?:ohmybuddy|pivane|pi5)-notifications|models|models-store|credentials|connections)\.json(?:$|[.~_-])/.test(part)
                || /^(?:\.npmrc|\.netrc|\.pypirc|id_rsa|id_ed25519|id_ecdsa)(?:$|[.~_-])/.test(part)
                || /\.(?:pem|key|p12|pfx|kdbx)(?:$|[.~_-])/.test(part);
        });
    }
    return { restricted, maxBytes: 2 * 1024 * 1024 };
});
