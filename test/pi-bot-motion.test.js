const test = require('node:test');
const assert = require('node:assert/strict');
const { create, states } = require('../public/pi-bot-motion');
function fixture() {
    let output; const timers = new Map(), cancelled = new Map(); let sequence = 0;
    const motion = create({ paint: value => { output = value; }, schedule: fn => { timers.set(++sequence, fn); return sequence; },
        cancel: id => { cancelled.set(id, timers.get(id)); timers.delete(id); } });
    const update = (extra = {}) => motion.update({ key: 'A/session/1', connected: true, waiting: false, working: false, ...extra });
    const finish = reason => { motion.begin('A/session/1'); motion.result('A/session/1', reason); motion.settle('A/session/1'); };
    return { motion, update, finish, timers, cancelled, get output() { return output; } };
}
test('only an observed normal live turn can celebrate; stops, unknown outcomes and recoverable tool errors do not', () => {
    const f = fixture(); f.update();
    f.motion.settle('A/session/1'); assert.equal(f.output.state, 'idle');
    for (const reason of ['aborted', 'toolUse', undefined, 'length']) { f.finish(reason); assert.equal(f.output.state, 'idle'); }
    f.motion.begin('A/session/1'); f.motion.result('A/session/1', 'toolUse'); f.update({ working: true });
    assert.equal(f.output.state, 'working');
    f.motion.result('A/session/1', 'stop'); f.update(); f.motion.settle('A/session/1'); assert.equal(f.output.state, 'done');
    assert.deepEqual(states, ['idle', 'thinking', 'working', 'waiting', 'done', 'failed', 'sleeping', 'greeting']);
});
test('waiting, work, queue, stop and disconnect suppress completion and interrupt old transients', () => {
    for (const extra of [{ waiting: true }, { working: true }, { queued: true }, { stopping: true }, { connected: false }]) {
        const f = fixture(); f.update(); f.finish('stop'); const old = [...f.timers.values()][0];
        f.update(extra); assert.notEqual(f.output.state, 'done'); old(); assert.notEqual(f.output.state, 'done');
        f.motion.begin('A/session/1'); f.motion.result('A/session/1', 'stop'); f.motion.settle('A/session/1');
        assert.notEqual(f.output.state, 'done');
    }
    const f = fixture(); f.update({ waiting: true, working: true }); assert.equal(f.output.state, 'waiting');
    f.update({ waiting: true }); assert.equal(f.output.state, 'waiting');
});
test('timer expiry recomputes state and old keys cannot affect a rapidly switched or reconnected window', () => {
    const f = fixture(); f.update(); f.finish('stop'); const old = [...f.timers.values()][0];
    f.update({ key: 'B/session/1', waiting: true }); old();
    f.motion.result('A/session/1', 'stop'); f.motion.settle('A/session/1'); assert.equal(f.output.state, 'waiting');
    f.update({ key: 'A/session/2' }); f.motion.settle('A/session/1'); assert.equal(f.output.state, 'idle');
    f.update(); f.finish('stop'); [...f.timers.values()][0](); assert.equal(f.output.state, 'idle');
});
test('greeting plays once for the logical window, and visibility/unmount clear pending timers', () => {
    const f = fixture(); f.update({ greeting: true, greetingKey: 'A/window' }); assert.equal(f.output.state, 'greeting');
    const old = [...f.timers.values()][0]; f.motion.visibility(true); assert.deepEqual(f.output, { state: 'idle', live: false });
    old(); assert.equal(f.output.state, 'idle');
    f.motion.visibility(false); f.update({ key: 'A/session/2', greeting: true, greetingKey: 'A/window' }); assert.equal(f.output.state, 'idle');
    f.update(); f.finish('stop'); f.motion.dispose(); assert.equal(f.timers.size, 0);
    const output = f.output; f.update({ working: true }); assert.deepEqual(f.output, output);
});
test('only a final assistant error gets a failed pose and disconnect remains neutral', () => {
    const f = fixture(); f.update(); f.finish('error'); assert.equal(f.output.state, 'failed');
    f.update(); assert.equal(f.output.state, 'failed');
    f.update({ waiting: true }); assert.equal(f.output.state, 'waiting');
    f.update({ connected: false }); assert.equal(f.output.state, 'idle');
    f.update(); f.motion.begin('A/session/1'); assert.equal(f.output.state, 'idle');
});
