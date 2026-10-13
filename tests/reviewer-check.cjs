// Independent release review using the actual UI and IndexedDB, with only native API doubles.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fixture = require('./browser-fixture.cjs');
const configureHarness = require('./harness-ui.cjs');
const URL = process.env.APP_URL || 'http://127.0.0.1:8765';
let browser;
async function items(page) { return page.evaluate(async () => { const { openDatabase, read } = await import('./storage.js'); const db = await openDatabase(() => {}); const result = await read(db, 'items'); db.close(); return result; }); }
async function external(page, name, args) { await page.evaluate(({name,args}) => { window.reviewResult = document.modelContext.getTools().then(tools => document.modelContext.executeTool(tools.find(tool => tool.name === name), args)).then(JSON.parse); }, {name,args}); }
async function result(page) { return page.evaluate(() => window.reviewResult); }
async function mutate(page, action) { return page.evaluate(async action => { const {openDatabase,mutate}=await import('./storage.js'); const db=await openDatabase(()=>{}); try {return await mutate(db,action);} finally {db.close();} },action); }
async function ready(page) { await require('./startup-ui.cjs')(page); await page.locator('#workspace').waitFor({state:'visible'}); await configureHarness(page); }
(async () => {
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome',headless:true});
  const nativeCtx=await browser.newContext({serviceWorkers:'block'});const nativePage=await nativeCtx.newPage();await nativePage.goto(URL);
  await nativePage.getByRole('button',{name:'Retry',exact:true}).waitFor();
  console.log('Unmodified installed Chrome:',browser.version(),JSON.stringify(await nativePage.evaluate(()=>({secure:isSecureContext,languageModel:typeof LanguageModel,documentModelContext:typeof document.modelContext,navigatorModelContext:typeof navigator.modelContext}))));
  assert.equal(await nativePage.locator('#workspace').isVisible(),false);await nativePage.getByRole('button',{name:'Retry',exact:true}).click();assert.equal(await nativePage.locator('#workspace').isVisible(),false);
  await nativePage.screenshot({path:path.join(__dirname,'..','docs','review-assets','reviewer-native-gate.png'),fullPage:true});await nativeCtx.close();
  // A blocked v1 upgrade reports an actionable failure and recovers after the old tab closes.
  const blockedCtx=await browser.newContext({serviceWorkers:'block'});await blockedCtx.addInitScript(fixture);const blocked=await blockedCtx.newPage();await blocked.goto(URL);
  await blocked.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('chrome-ai-webmcp-prototype',1);r.onupgradeneeded=()=>{r.result.createObjectStore('preferences',{keyPath:'id'});r.result.createObjectStore('history',{keyPath:'id',autoIncrement:true});};r.onsuccess=()=>{window.heldDatabase=r.result;resolve();};}));
  await blocked.getByRole('button', { name: 'Continue', exact: true }).click();await blocked.getByText('Persistent storage failed',{exact:true}).waitFor();assert.match(await blocked.locator('#startup-body').innerText(),/Close other tabs/);
  await blocked.evaluate(()=>heldDatabase.close());await blocked.getByRole('button',{name:'Retry',exact:true}).click();await ready(blocked);assert.equal(await blocked.evaluate(()=>fixture.tools.size),17);await blockedCtx.close();
  const ctx=await browser.newContext({viewport:{width:1440,height:960},serviceWorkers:'block'});
  await ctx.addInitScript(fixture);
  const page=await ctx.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(URL); await ready(page);
  // Keyboard composer behavior and persisted hostile text must stay text.
  const hostile='<img src=x onerror="window.reviewXss=true">';
  await page.locator('#message').fill(hostile);await page.locator('#message').press('Shift+Enter');
  assert.match(await page.locator('#message').inputValue(),/\n$/);
  await page.locator('#message').press('Enter');await page.waitForFunction(()=>!document.querySelector('#send').disabled);
  assert.equal(await page.locator('#chat img').count(),0);assert.equal(await page.evaluate(()=>window.reviewXss),undefined);
  assert.match(await page.locator('#chat').innerText(),/What needs your attention next/);
  // Reproduce switching a populated desktop transcript through a hidden mobile panel.
  await page.locator('#navigation').getByRole('button',{name:'All items',exact:true}).click();
  await page.setViewportSize({width:320,height:780});await page.getByRole('button',{name:'Assistant',exact:true}).click();
  const measure=()=>page.locator('#chat').evaluate(node=>({height:node.clientHeight,scrollHeight:node.scrollHeight,top:node.scrollTop,last:{height:node.lastElementChild?.getBoundingClientRect().height}}));
  const geometry=await measure();console.log('Mobile transcript geometry:',JSON.stringify(geometry));
  assert.ok(geometry.last.height<180,'A short assistant reply must not inherit the mobile sidebar height');
  await page.locator('#chat').evaluate(node=>{node.scrollTop=node.scrollHeight;});
  await page.screenshot({path:path.join(__dirname,'..','docs','review-assets','reviewer-mobile-chat.png'),fullPage:true});
  await page.locator('#message').fill('Mobile message');await page.locator('#message').press('Enter');await page.waitForFunction(()=>!document.querySelector('#send').disabled);
  assert.match(await page.locator('#chat').innerText(),/Mobile message/);
  await page.locator('#message').scrollIntoViewIfNeeded();const composer=await page.locator('#message').boundingBox();assert.ok(composer.y>=0 && composer.y+composer.height<=780);
  // A native callback's signal aborts the pending permission without effects.
  await page.evaluate(()=>{window.nativeAbort=new AbortController();window.reviewResult=document.modelContext.getTools().then(tools=>document.modelContext.executeTool(tools.find(t=>t.name==='create_item'),{title:'Abort this create'},{signal:nativeAbort.signal})).then(JSON.parse);});
  await page.getByRole('button',{name:'Allow once',exact:true}).waitFor();await page.evaluate(()=>nativeAbort.abort());assert.equal((await result(page)).error.code,'cancelled');assert.equal((await items(page)).length,0);
  // Granted arguments cannot target a later version or a changed destination parent.
  const parent=await mutate(page,{kind:'create',patch:{title:'Project',type:'Project'}});
  const target=await mutate(page,{kind:'create',patch:{title:'Existing task'}});
  await external(page,'update_attribute',{id:target.id,attribute:'title',value:'Approved stale overwrite'});
  await page.getByRole('button',{name:'Allow once',exact:true}).waitFor();
  await mutate(page,{kind:'update',id:target.id,patch:{title:'Concurrent title'}});
  await page.getByRole('button',{name:'Allow once',exact:true}).click();assert.equal((await result(page)).error.code,'stale');assert.equal((await items(page)).find(item=>item.id===target.id).title,'Concurrent title');
  await external(page,'create_item',{title:'Destination changed',parentId:parent.id});await page.getByRole('button',{name:'Allow once',exact:true}).waitFor();
  await mutate(page,{kind:'update',id:parent.id,patch:{title:'Changed project'}});await page.getByRole('button',{name:'Allow once',exact:true}).click();assert.equal((await result(page)).error.code,'stale');assert.equal((await items(page)).length,2);
  await external(page,'list_items',{parentId:null});await page.getByRole('button',{name:'Allow for this chat'}).click();assert.equal((await result(page)).data.total,2);
  await external(page,'read_attribute',{id:target.id,attribute:'title'});await page.getByRole('button',{name:'Allow once',exact:true}).click();assert.equal((await result(page)).data.value,'Concurrent title');
  await external(page,'update_attribute',{id:target.id,attribute:'createdAt',value:'Forged'});assert.equal((await result(page)).error.code,'invalid');
  // Leaf editing/navigation uses Save/Discard/Cancel, and stale form edits survive.
  await page.reload();await ready(page);await page.getByRole('button',{name:'Lists',exact:true}).click();await page.locator('#navigation').getByRole('button',{name:'All items',exact:true}).click();
  await page.getByRole('button',{name:'Complete Concurrent title',exact:true}).press('Enter');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Saved'));
  assert.equal((await items(page)).find(item=>item.id===target.id).status,'Completed');await page.getByRole('button',{name:'Reopen Concurrent title',exact:true}).click();
  await page.getByRole('button',{name:'Complete Concurrent title',exact:true}).waitFor();
  await page.locator('.item-title').filter({hasText:'Concurrent title'}).click();await page.locator('#item-description').fill('Reviewer unsaved description');
  await page.getByRole('button',{name:'Tools',exact:true}).click();await page.locator('#dialog').getByRole('button',{name:'Cancel',exact:true}).press('Enter');assert.equal(await page.locator('#item-description').inputValue(),'Reviewer unsaved description');
  await mutate(page,{kind:'update',id:target.id,patch:{status:'Blocked'}});await page.getByRole('button',{name:'Save item'}).click();await page.getByText('Not saved: Item changed. Reload and review before saving.',{exact:true}).waitFor();assert.equal(await page.locator('#item-description').inputValue(),'Reviewer unsaved description');
  await page.getByRole('button',{name:'Tools',exact:true}).click();await page.locator('#dialog').getByRole('button',{name:'Discard',exact:true}).click();
  await page.getByText('17 native own-page tools discovered.').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByRole('button',{name:'Lists',exact:true}).click();await page.locator('#navigation').getByRole('button',{name:'＋ New item'}).click();await page.locator('#item-title').fill('W'.repeat(200));await page.getByRole('button',{name:'Save item'}).click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Saved'));
  await page.getByRole('heading',{name:'W'.repeat(200),exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Valid maximum-length item titles must wrap on mobile');
  assert.deepEqual(errors,[]);await ctx.close();
  console.log('Independent reviewer checks passed: mobile composer/chat, keyboard, text safety, external abort, stale write/parent approvals, attribute boundary, and stale dirty forms.');
  await browser.close();
})().catch(async error=>{console.error(error);await browser?.close();process.exitCode=1;});
