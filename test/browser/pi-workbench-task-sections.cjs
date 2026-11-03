// Isolated native sessions and RPC, no real model calls or production identity.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),{once}=require('node:events');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createPiAgentGateway}=require('../../server/pi-agent-routes'),{WorkspaceAccessService}=require('../../server/workspace-access-service');
const repository=path.resolve(__dirname,'../..');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true});
 try{for(const width of [1440,393,320]){
  const root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'omb-task-polish-'))),agent=root+'/agent',project=root+'/project';fs.mkdirSync(agent);fs.mkdirSync(project);
  Object.assign(process.env,{PI_CODING_AGENT_DIR:agent,PI_PROJECT_ROOTS:root,PI_OFFLINE:'1',PI_WEB_DEFERRED_FILE:root+'/deferred.json',OHMYBUDDY_WORKSPACES_DIR:root+'/workspaces'});
  const access=new WorkspaceAccessService({filePath:root+'/access.json',envToken:()=>''}),gateway=createPiAgentGateway({accessService:access,deferredFilePath:process.env.PI_WEB_DEFERRED_FILE});
  for(let i=1;i<=27;i++)await gateway.store.createStandaloneSession('Task '+String(i).padStart(2,'0'));
  await gateway.store.createSession(project,'Project thread');
  const app=require('express')();app.use(require('express').json());gateway.mount(app);
  for(const [route,dir]of[['marked','marked/lib'],['dompurify','dompurify/dist'],['highlight','@highlightjs/cdn-assets']])app.use('/vendor/'+route,require('express').static(path.join(repository,'node_modules',dir)));
  app.use(require('express').static(repository+'/public'));const server=http.createServer(app),wss=gateway.attachWebSocket(server);server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
  const context=await browser.newContext({locale:width===320?'en':'zh-CN',viewport:{width,height:900},isMobile:width<681,hasTouch:width<681}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://**',r=>r.abort());
  try{
   await page.goto(base,{waitUntil:'domcontentloaded'});await page.locator('.pv-boot').waitFor({state:'hidden'});await page.locator('[data-sidebar-section=tasks]').waitFor({state:'attached'});
   await page.locator('#pi-composer-project').waitFor({state:'visible'});
   if(width<681)await page.locator('#pi-toggle-sessions').click();
   const taskHeading=page.locator('.pi-standalone-heading'),actions=taskHeading.locator('.pi-work-section-actions');
   if(width===1440){await page.mouse.move(1300,80);await page.waitForFunction(()=>getComputedStyle(document.querySelector('.pi-standalone-heading .pi-work-section-actions')).opacity==='0');await taskHeading.hover();await page.waitForFunction(()=>getComputedStyle(document.querySelector('.pi-standalone-heading .pi-work-section-actions')).opacity==='1');}
   else assert.equal(await actions.evaluate(e=>getComputedStyle(e).opacity),'1','touch keeps the compact icon controls available');
   const icon=await taskHeading.locator('[data-standalone-create]').evaluate(e=>({text:e.textContent.trim(),width:e.getBoundingClientRect().width,border:getComputedStyle(e).borderTopWidth}));assert.equal(icon.text,'');assert(icon.width<=32);assert.equal(icon.border,'0px');
   assert.equal(await page.locator('.pi-standalone-group .pi-session-item').count(),10);
   await page.locator('[data-task-more=active]').click();assert.equal(await page.locator('.pi-standalone-group .pi-session-item').count(),20);
   assert.match(await page.locator('[data-task-more=active]').textContent(),/7/);await page.locator('[data-task-more=active]').click();assert.equal(await page.locator('.pi-standalone-group .pi-session-item').count(),27);assert.equal(await page.locator('[data-task-more]').count(),0);
   await taskHeading.locator('[data-work-action=toggle-tasks]').click();assert.equal(await page.locator('#pi-work-tasks-content').isVisible(),false);
   const bounds=await page.evaluate(()=>{const a=document.querySelector('.pi-standalone-heading').getBoundingClientRect(),b=document.querySelector('.pi-project-section-heading').getBoundingClientRect();return{gap:b.top-a.bottom};});assert(bounds.gap<=8,JSON.stringify(bounds));
   await page.locator('[data-work-action=toggle-projects]').click();await page.reload({waitUntil:'domcontentloaded'});await page.locator('.pv-boot').waitFor({state:'hidden'});if(width<681)await page.locator('#pi-toggle-sessions').click();
   assert.equal(await page.locator('#pi-work-tasks-content').isVisible(),false);assert.equal(await page.locator('#pi-work-projects-content').isVisible(),false);
   await page.locator('[data-work-action=toggle-tasks]').focus();await page.keyboard.press('Enter');await page.locator('[data-work-action=toggle-projects]').click();assert.equal(await page.locator('.pi-standalone-group .pi-session-item').count(),10);
   await page.locator('#pi-session-search-toggle').click();await page.locator('#pi-session-search').fill('Task');await page.waitForFunction(()=>document.querySelectorAll('.pi-standalone-group .pi-session-item').length===10);assert.equal(await page.locator('[data-task-more=active]').count(),1);await page.locator('#pi-session-search').fill('');await page.locator('#pi-session-search-toggle').click();
   await page.locator('#pi-session-list').evaluate(e=>{e.scrollTop=0;});
   if(width===1440){await taskHeading.locator('[data-standalone-create]').focus();await page.waitForFunction(()=>getComputedStyle(document.querySelector('.pi-standalone-heading .pi-work-section-actions')).opacity==='1');await page.locator('#pi-session-search-toggle').focus();await page.mouse.move(1300,80);}
   await page.screenshot({path:path.join(os.tmpdir(),'omb-task-sections-'+width+'.png')});
   const task=page.locator('.pi-standalone-group .pi-session-item').first(),id=await task.getAttribute('data-session-id'),oldCwd=await task.getAttribute('data-cwd');fs.writeFileSync(path.join(oldCwd,'retained.txt'),'personal work stays here');await task.locator('.pi-session-main').click();
   await page.waitForFunction(()=>!document.querySelector('#pi-input').disabled);await page.locator('#pi-composer-project').waitFor({state:'visible'});
   const height=await page.evaluate(()=>{const b=document.querySelector('#pi-composer-project'),w=document.querySelector('.pi-composer-wrap'),before=w.getBoundingClientRect().height;b.hidden=true;const without=w.getBoundingClientRect().height;b.hidden=false;return{before,without};});assert(Math.abs(height.before-height.without)<=1,JSON.stringify(height));
   await page.locator('#pi-input').fill('Keep the unsent draft');await page.locator('#pi-file-input').setInputFiles({name:'draft.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic unsent attachment')});await page.locator('.pi-attachment-chip').waitFor();
   await page.locator('#pi-composer-project').click();await page.locator('#pi-project-input').fill(project);await page.locator('#pi-project-form [type=submit]').click();await page.waitForFunction(p=>document.querySelector('#pi-directory-current [aria-current]')?.title===p,project);await page.locator('#pi-directory-select').click();
   await page.waitForFunction(({project,id})=>localStorage.getItem('pi.web.cwd')===project&&localStorage.getItem('pi.web.session:'+project)===id&&!document.querySelector('#pi-input').disabled,{project,id});
   assert.equal(await page.locator('#pi-input').inputValue(),'Keep the unsent draft');assert.equal(await page.locator('.pi-attachment-chip').count(),1);assert.equal(await page.locator('#pi-composer-project').isVisible(),true);assert.equal(fs.readFileSync(path.join(oldCwd,'retained.txt'),'utf8'),'personal work stays here');
   assert.equal((await gateway.store.listSessions(oldCwd)).length,0);assert.equal((await gateway.store.listSessions(project)).filter(s=>s.id===id).length,1);
   await page.screenshot({path:path.join(os.tmpdir(),'omb-composer-project-'+width+'.png')});
   const moved=await gateway.store.getSession(project,id);await gateway.supervisor.stopSession(moved.path);const {SessionManager}=await require('../../server/pi-session-store').getSdk();SessionManager.open(moved.path).appendMessage({role:'user',content:'Synthetic first message, no provider request',timestamp:Date.now()});
   await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!document.querySelector('#pi-input').disabled);assert.equal(await page.locator('#pi-composer-project').isVisible(),false);
   for(const selector of ['body','.pi-composer-meta','.pi-composer-wrap']){const m=await page.locator(selector).evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));assert(m.scroll<=m.width+1,selector+JSON.stringify(m));}
   assert.deepEqual(errors,[]);console.log(JSON.stringify({width,quietHeader:true,taskBatches:[10,20,27],collapsePersisted:true,composerHeightUnchanged:true,sessionIdPreserved:true,draftAndAttachmentPreserved:true,projectChoiceHiddenAfterFirstMessage:true,pageerrors:0}));
  }finally{await context.close();for(const socket of wss.clients)socket.terminate();await gateway.dispose();access.dispose();await new Promise(r=>wss.close(r));server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});}
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
