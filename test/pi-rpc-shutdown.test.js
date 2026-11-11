const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');

test('global RPC shutdown gives every worker its full EOF cleanup grace period', { timeout: 20000 }, async t => {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pi-global-rpc-stop-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const fixture = path.join(root, 'worker.cjs'), driver = path.join(root, 'driver.cjs');
    fs.writeFileSync(fixture, `const fs=require('node:fs'),readline=require('node:readline');
        readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);process.stdout.write(JSON.stringify({type:'response',id:m.id,success:true,data:{}})+'\\n');});
        process.stdin.once('end',()=>setTimeout(()=>{fs.writeFileSync(require('node:path').join(${JSON.stringify(root)},process.pid+'.saved'),'saved');process.exit(0)},120));
        setInterval(()=>{},1000);`);
    fs.writeFileSync(driver, `const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
        const {PiRpcClient,shutdownRpcProcesses}=require(${JSON.stringify(require.resolve('../server/pi-rpc-client'))});
        (async()=>{
            const clients=[new PiRpcClient({cwd:${JSON.stringify(root)},noSession:true}),new PiRpcClient({cwd:${JSON.stringify(root)},noSession:true})];
            await Promise.all(clients.map(client=>client.start()));
            const workers=clients.map(client=>client.child),pids=workers.map(child=>child.pid);
            await shutdownRpcProcesses();
            for(const child of workers){assert.equal(child.exitCode,0);assert.equal(child.signalCode,null);assert.equal(fs.readFileSync(path.join(${JSON.stringify(root)},child.pid+'.saved'),'utf8'),'saved');}
            console.log(JSON.stringify({workers:pids.length,saved:pids.length,normalExit:true}));
        })().catch(error=>{console.error(error);process.exitCode=1});`);
    const { stdout } = await promisify(execFile)(process.execPath, [driver], { env: { ...process.env, PI_WEB_CLI: fixture }, timeout: 15000 });
    assert.deepEqual(JSON.parse(stdout), { workers: 2, saved: 2, normalExit: true });
});
