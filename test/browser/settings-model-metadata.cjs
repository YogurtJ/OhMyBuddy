const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { buildCatalog, describeModel } = require('../../server/pi-model-discovery');
const baseUrl = process.env.PI_MODEL_METADATA_TEST_URL || 'http://127.0.0.1:3001';
const referenceCatalog = buildCatalog([
    { provider:'openai', id:'gpt-6.1-sol', contextWindow:272000, maxTokens:128000, input:['text','image'], reasoning:true, cost:{input:5,output:25} },
    { provider:'openai', id:'gpt-6-astra', contextWindow:272000, maxTokens:128000, input:['text','image'], reasoning:true, cost:{input:10,output:50} }
]);
const metadata = id => describeModel(id, {}, referenceCatalog);
async function run(browser,width,locale) {
    const context=await browser.newContext({locale,viewport:{width,height:950},isMobile:width<900,hasTouch:width<900});
    const page=await context.newPage();page.setDefaultTimeout(12000);
    const errors=[],writes=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(locale=>localStorage.setItem('pi.workspace.language',locale),locale);
    const stored={id:'gpt-6.2-sol',provider:'relay',name:'GPT-6.2 Sol',contextWindow:128000,maxTokens:16384,input:['text'],reasoning:false,cost:{input:2,output:8,cacheRead:0.25,cacheWrite:0},available:true};
    const snapshot=()=>({providers:[{id:'relay',name:'Relay',configured:true,authMethods:{apiKey:true,apiKeyLogin:true}}],models:[stored],
        preferences:{defaultProvider:'relay',defaultModel:stored.id,mediaAgent:{provider:'relay',modelId:stored.id}},customProviders:[{id:'relay',name:'Relay',api:'openai-completions',models:[{...stored}]}]});
    await page.route('**/api/**',async route=>{
        const req=route.request(),path=new URL(req.url()).pathname;
        if(req.method()!=='GET') {
            const body=req.postDataJSON();
            if(path==='/api/pi/settings/models/metadata')return route.fulfill({json:{models:body.modelIds.map(metadata)}});
            if(path.endsWith('/discover-models'))return route.fulfill({json:{ok:true,endpoint:'https://relay.example/v1/models',models:[{...metadata(stored.id),added:true},metadata('gpt-6.2-astra'),metadata('custom-unknown')]}});
            writes.push({path,body});
            if(path==='/api/pi/settings/custom-providers/relay/models')Object.assign(stored,body,{input:body.imageInput?['text','image']:['text']});
            return route.fulfill({json:{ok:true,modelCount:body.models?.length||1}});
        }
        if(path==='/api/pi/status')return route.fulfill({json:{ok:true,projectRoots:['/srv']}});
        if(path==='/api/pi/projects')return route.fulfill({json:{projects:[],roots:['/srv']}});
        if(path==='/api/pi/sessions')return route.fulfill({json:{sessions:[]}});
        if(path==='/api/pi/activity')return route.fulfill({json:{runtimes:[],pinnedProjects:[],hiddenProjects:[],replyNotices:[]}});
        if(path==='/api/pi/settings/models')return route.fulfill({json:snapshot()});
        if(path.includes('history')||path==='/api/prompts')return route.fulfill({json:[]});
        return route.fulfill({json:{}});
    });
    await page.routeWebSocket('**/api/pi/ws',()=>{throw Error('Settings must not start a conversation')});
    await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
    await page.locator('#workspace-settings-toggle').click();
    await page.locator('#settings-model-list summary[data-provider="relay"]').click();
    const modelRow=page.locator('.model-row[data-model-id="gpt-6.2-sol"]');
    await modelRow.locator('[data-action="edit"]').click();
    const form=page.locator('#settings-model-form');
    const price=key=>form.locator(`[data-price="${key}"]`);
    assert.equal(await price('input').inputValue(),'2');assert.equal(await price('cacheWrite').inputValue(),'0');
    await page.locator('#settings-model-reference button').first().click();
    await page.locator('#settings-model-reference p').filter({hasText:'openai/gpt-6.1-sol'}).waitFor();
    assert.equal(await form.locator('[name=contextWindow]').inputValue(),'128000','reading a suggestion must not replace saved values');
    await page.locator('#settings-model-reference button').last().click();
    assert.deepEqual(await form.locator('[name=contextWindow], [name=maxTokens]').evaluateAll(nodes=>nodes.map(n=>n.value)),['500000','128000']);
    assert.equal(await form.locator('[name=imageInput]').isChecked(),true);assert.equal(await form.locator('[name=reasoning]').isChecked(),true);
    assert.equal(await price('input').inputValue(),'2','applying capability suggestions keeps channel prices');
    await price('input').fill('-1');await form.locator('[type=submit]').click();
    assert.equal(writes.length,0,'invalid pricing cannot be submitted');
    await price('input').fill('3.5');await price('output').fill('0');await price('cacheRead').fill('0.125');await price('cacheWrite').fill('1');
    await form.locator('[type=submit]').click();
    await page.locator('#workspace-settings-editor').waitFor({state:'hidden'});
    assert.deepEqual(writes.at(-1).body.cost,{input:3.5,output:0,cacheRead:0.125,cacheWrite:1});
    assert.deepEqual([writes.at(-1).body.contextWindow,writes.at(-1).body.maxTokens,writes.at(-1).body.imageInput,writes.at(-1).body.reasoning],['500000','128000',true,true]);
    const group=page.locator('.settings-model-group').filter({has:page.locator('summary[data-provider="relay"]')});
    if(!await group.evaluate(el=>el.open))await group.locator('summary').click();
    await group.locator('.provider-row [data-action="add-model"]').click();
    const picker=page.locator('dialog.cps-picker[open]');await picker.waitFor();
    const astra=picker.locator('.cps-row').filter({has:page.locator('code:text-is("gpt-6.2-astra")')});
    assert.match(await astra.textContent(),/128k/);assert.match(await astra.textContent(),/openai\/gpt-6-astra/);
    assert.ok((await astra.textContent()).includes(locale==='en'?'Image input':'图片输入'));
    const unknown=picker.locator('.cps-row').filter({has:page.locator('code:text-is("custom-unknown")')});
    assert.ok((await unknown.textContent()).includes(locale==='en'?'Image capability unknown':'图片能力未知'));
    await astra.locator('input').check();await picker.locator('.settings-primary-button').click();
    await picker.waitFor({state:'detached'});
    const addForm=page.locator('#settings-add-models-form');
    const selected=addForm.locator('.cps-selected-row').filter({has:page.locator('code:text-is("gpt-6.2-astra")')});
    await selected.locator('summary').click();
    assert.equal(await selected.locator('[data-price=input]').inputValue(),'','a new model does not inherit a predecessor’s price');
    await selected.locator('[data-price=input]').fill('7');await selected.locator('[data-price=output]').fill('28');
    await addForm.locator('.cps-manual input').fill('gpt-6.3-sol');await addForm.locator('.cps-manual button').click();
    await addForm.locator('code:text-is("gpt-6.3-sol")').waitFor();
    assert.match(await addForm.locator('.cps-selected-row').filter({has:page.locator('code:text-is("gpt-6.3-sol")')}).textContent(),/128k/);
    // Re-rendering after manual lookup must retain any entered prices.
    assert.equal(await selected.locator('[data-price=input]').inputValue(),'7');
    await selected.locator('summary').click();
    const selectors=['.settings-editor-dialog','#workspace-settings-editor-body','#settings-add-models-form','.cps-pricing'];
    for(const selector of selectors) {
        const metrics=await page.locator(selector).first().evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));
        assert(metrics.scroll-metrics.width<=1,`${width} ${selector} overflows: ${JSON.stringify(metrics)}`);
    }
    if(width<900){const small=await addForm.locator('input:not([type=checkbox]), select').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length&&parseFloat(getComputedStyle(n).fontSize)<16).map(n=>n.type));assert.deepEqual(small,[]);}
    await page.screenshot({path:`/tmp/omb-model-metadata-${width}-${locale}.png`});
    await addForm.locator('[type=submit]').click();await page.locator('#workspace-settings-editor').waitFor({state:'hidden'});
    const models=writes.at(-1).body.models;assert.equal(models[0].id,'gpt-6.2-astra');assert.deepEqual(models[0].cost,{input:7,output:28});
    assert.deepEqual([models[0].contextWindow,models[0].maxTokens,models[0].imageInput,models[0].reasoning],[500000,128000,true,true]);
    assert.equal(models[1].maxTokens,128000);assert.equal(models[1].cost,undefined);
    assert.deepEqual(errors,[]);console.log(JSON.stringify({width,locale,passed:true,writes:writes.length}));await context.close();
}
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true});try{await run(browser,393,'zh-CN');await run(browser,1440,'zh-CN');await run(browser,1440,'en');}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1});
