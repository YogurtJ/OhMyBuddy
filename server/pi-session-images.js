// A2: ordinary Pi text blocks carry a versioned reference; only the managed
// request boundary restores images. Never interpret a marker in plain text.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { readSafe, privateDir, hash } = require('./pi-maintenance-files');
const privateFiles = require('./pi-private-files');
const MAX_IMAGE = 32 * 1024 ** 2;
const MAX_REQUEST = 128 * 1024 ** 2;
const MARKER = '[图片已单独保存；Pivane 会在看图时自动读取]';
function agentDirectory() { return path.resolve(process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent')); }
function isReference(block) { return Boolean(block && (block.type === 'text' || block.type === 'image' && block.data === '' && block.text === MARKER) && Object.hasOwn(block, 'pivaneImage')); }
function reference(block) {
    const ref = block?.pivaneImage;
    if (!isReference(block) || block.text !== MARKER || ref?.version !== 1 || !/^[a-f0-9]{64}$/.test(ref.sha256)
        || !Number.isSafeInteger(ref.bytes) || ref.bytes < 1 || ref.bytes > MAX_IMAGE
        || !ref.image || ref.image.type !== 'image' || typeof ref.image.mimeType !== 'string' || Object.hasOwn(ref.image, 'data'))
        throw new Error('图片引用无效，原始会话未改动');
    return ref;
}
function syncDirectory(directory) {
    if (process.platform === 'win32') return;
    const fd = fs.openSync(directory, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
class SessionImages {
    constructor(agentDir = agentDirectory()) { this.root = path.join(path.resolve(agentDir), 'pivane-session-images'); }
    directory(create = false) {
        if (fs.realpathSync.native(path.dirname(this.root)) !== path.dirname(this.root)) throw new Error('图片身份目录无效');
        if (create) privateDir(this.root);
        if (fs.realpathSync.native(this.root) !== this.root || !fs.lstatSync(this.root).isDirectory()) throw new Error('图片存储路径无效');
        return this.root;
    }
    bytes(ref) {
        const bytes = readSafe(path.join(this.directory(), ref.sha256), MAX_IMAGE);
        if (bytes.length !== ref.bytes || hash(bytes) !== ref.sha256) throw new Error('图片文件缺失或校验失败，已阻止发送不完整的上下文');
        return bytes;
    }
    save(block) {
        if (isReference(block)) return block.type === 'text' ? block : { type: 'text', text: MARKER, pivaneImage: reference(block) };
        if (block?.type !== 'image') return block;
        // Noncanonical/invalid images remain inline, retaining the existing image
        // validation error and exact source bytes rather than changing their meaning.
        if (typeof block.data !== 'string' || !block.data.length || block.data.length > Math.ceil(MAX_IMAGE / 3) * 4) return block;
        const bytes = Buffer.from(block.data, 'base64');
        if (!bytes.length || bytes.toString('base64') !== block.data) return block;
        const { data, ...image } = block;
        const ref = { version: 1, sha256: hash(bytes), bytes: bytes.length, image };
        const directory = this.directory(true), file = path.join(directory, ref.sha256);
        if (fs.existsSync(file)) this.bytes(ref);
        else {
            const temp = path.join(directory, '.' + randomUUID());
            privateFiles.writePrivateFileSync(temp, bytes, true);
            try {
                // Exclusive publication; concurrent workers may save the same image.
                try { fs.linkSync(temp, file); }
                catch (error) { if (error.code !== 'EEXIST') throw error; this.bytes(ref); }
                syncDirectory(directory);
            } finally { fs.unlinkSync(temp); }
        }
        return { type: 'text', text: MARKER, pivaneImage: ref };
    }
    restore(block, budget) {
        if (!isReference(block)) return block;
        const ref = reference(block);
        if (budget) { budget.bytes += ref.bytes; if (budget.bytes > budget.max) throw new Error('图片上下文超过读取预算'); }
        return { ...ref.image, data: this.bytes(ref).toString('base64') };
    }
    content(content, operation = 'restore', budget) {
        if (!Array.isArray(content)) return content;
        let changed = false;
        const blocks = content.map(block => { const next = this[operation](block, budget); changed ||= next !== block; return next; });
        return changed ? blocks : content;
    }
    message(message, operation = 'restore', budget) {
        const content = this.content(message?.content, operation, budget);
        return content === message?.content ? message : { ...message, content };
    }
    messages(messages, operation = 'restore', max = MAX_REQUEST) {
        const budget = { bytes: 0, max };
        return messages.map(message => this.message(message, operation, budget));
    }
    // Only native content fields; never traverse arbitrary tool arguments or
    // user JSON objects that happen to contain keys named type/data.
    entry(entry, operation = 'restore', budget) {
        if (entry.type === 'message') {
            const message = this.message(entry.message, operation, budget);
            return message === entry.message ? entry : { ...entry, message };
        }
        if (entry.type === 'custom_message') {
            const content = this.content(entry.content, operation, budget);
            return content === entry.content ? entry : { ...entry, content };
        }
        if (entry.type === 'context_edit' && entry.replacement) {
            const replacement = this.message(entry.replacement, operation, budget);
            return replacement === entry.replacement ? entry : { ...entry, replacement };
        }
        return entry;
    }
}
function registerSessionImages(pi, agentDir) {
    const images = new SessionImages(agentDir);
    pi.on('message_end', (event, ctx) => {
        if (!ctx.sessionManager.getSessionFile()) return;
        // Pi keeps the original message if a handler fails. A failed write must
        // never publish a dangling reference or discard the model's image.
        const message = require('./pi-session-image-context').runtimeMessage(images.message(event.message, 'save'));
        if (message !== event.message) return { message };
    });
}
module.exports = { SessionImages, registerSessionImages, reference, isReference, MARKER, MAX_IMAGE, MAX_REQUEST, agentDirectory, syncDirectory };
