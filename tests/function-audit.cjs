const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.SHUATITONG_EDITOR_TEST_URL || 'http://127.0.0.1:5173/';
let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { await browser.close(); });
async function pageFor(t) {
  const context = await browser.newContext({viewport:{width:390,height:900},reducedMotion:'reduce'});
  t.after(()=>context.close()); const page=await context.newPage();
  await page.route('**/publisher/api/**',route=>route.fulfill({status:503,json:{error:'isolated audit environment'}}));
  await page.goto(base,{waitUntil:'networkidle'}); return page;
}
const q = (id, extra={}) => ({id,type:'single',question:`Question ${id}`,options:{A:'Alpha',B:'Beta',C:'Gamma'},answer:'A',difficulty:'中',explanation:'',...extra});
async function upload(page, bank, filename='audit.json') {
  await page.locator('#fileInput').setInputFiles({name:filename,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bank))});
  await page.waitForFunction(id=>document.querySelector('#qNumber').textContent.includes('#'+id),bank[0].id);
}
async function settings(page) {
  await page.locator('#settingsBtn').click();await page.locator('#apiBaseUrl').fill('https://audit-model.test/v1');
  await page.locator('#modelCustomToggle').check();await page.locator('#apiModelCustom').fill('audit');await page.locator('#settingsSaveBtn').click();
}
test('untrusted file name, thumbnail text, answer and error-book text never execute HTML',async t=>{
  const page=await pageFor(t); const attack='<img src=x onerror="window.__auditXss=1">';
  await upload(page,[q(1,{type:'fill',question:'"'+attack,options:{'空1':attack},answer:attack})],attack+'.json');
  await page.locator('#thumbToggleBtn').click();await page.locator('#showAnswerBtn').click();
  await page.locator('[data-tab="errorbook"]').click();
  assert.equal(await page.evaluate(()=>window.__auditXss),undefined);
  assert.equal(await page.locator('#errorBookView img,#thumbGrid img,#recentList img,#feedbackResult img').count(),0);
  assert.match(await page.locator('#errorBookView').innerText(), /img src=x/);
});
test('late AI explanation is cancelled when switching question',async t=>{
  const page=await pageFor(t);await upload(page,[q(1),q(2)]);await settings(page);
  let release;const delay=new Promise(r=>release=r);await page.route('https://audit-model.test/v1/chat/completions',async route=>{await delay;await route.fulfill({json:{choices:[{message:{content:'FIRST QUESTION RESULT'}}]}}).catch(()=>{});});
  await page.locator('#aiSimplifyBtn').click();await page.locator('#nextBtn').click();release();await page.waitForTimeout(120);
  assert.doesNotMatch(await page.locator('#explanationText').innerText(),/FIRST QUESTION RESULT/);
  assert.equal(await page.locator('#aiSimplifyBtn').isDisabled(),false);
});
test('late AI fill grading never records the next question',async t=>{
  const page=await pageFor(t);await upload(page,[q(1,{type:'fill',options:{'空1':'Answer'},answer:''}),q(2)]);await settings(page);
  let release;const delay=new Promise(r=>release=r);await page.route('https://audit-model.test/v1/chat/completions',async route=>{await delay;await route.fulfill({json:{choices:[{message:{content:JSON.stringify({results:[{blank:'空1',correct:true,feedback:'OK'}],overall:'correct'})}}]}});});
  await page.locator('#fillContainer input').fill('Answer');await page.locator('[data-mode="ai"]').click();await page.locator('#fillSubmitBtn').click();await page.locator('#nextBtn').click();release();await page.waitForTimeout(120);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('shuatitong_state')).answeredMap),{});
});
test('exam multiple selections are graded without per-question submit and deselection clears answer',async t=>{
  const page=await pageFor(t);await upload(page,[q(1,{type:'multi',answer:'AB'})]);await page.locator('#examBtn').click();await page.locator('#examStartBtn').click();
  for(const text of ['Alpha','Beta'])await page.locator('.option').filter({hasText:text}).click();
  await page.locator('#submitExamBtn').click();assert.equal(await page.locator('.score-num').innerText(),'1/1');
  await page.locator('#examResultExitBtn').click();await page.locator('#examBtn').click();await page.locator('#examStartBtn').click();
  const option=page.locator('.option').filter({hasText:'Alpha'});await option.click();await option.click();await page.locator('#submitExamBtn').click();assert.equal(await page.locator('.score-num').innerText(),'0/1');
});
test('exam return deliberately reshuffles while grading still uses original content',async t=>{
  const page=await pageFor(t);await upload(page,[q(1),q(2)]);await page.locator('#examBtn').click();await page.locator('#examStartBtn').click();
  await page.evaluate(()=>{let n=0;Math.random=()=> (++n%2?0.02:0.94)});
  const first=await page.locator('.option .text').allTextContents();let changed=false;
  for(let i=0;i<6;i++){await page.locator('#nextBtn').click();await page.locator('#prevBtn').click();if((await page.locator('.option .text').allTextContents()).join('|')!==first.join('|'))changed=true;}
  assert.equal(changed,true,'user-requested reshuffle must remain');
  await page.locator('.option').filter({hasText:'Alpha'}).click();await page.locator('#nextBtn').click();await page.locator('.option').filter({hasText:'Alpha'}).click();await page.locator('#submitExamBtn').click();assert.equal(await page.locator('.score-num').innerText(),'2/2');
});
test('exam history rejects a different bank with the same question IDs',async t=>{
  const page=await pageFor(t);await upload(page,[q(1)]);await page.locator('#examBtn').click();await page.locator('#examStartBtn').click();await page.locator('.option').filter({hasText:'Beta'}).click();await page.locator('#submitExamBtn').click();await page.locator('#examResultExitBtn').click();
  await upload(page,[q(1,{question:'Unrelated replacement bank'})]);await page.locator('#examHistory summary').click();let message='';page.once('dialog',async d=>{message=d.message();await d.dismiss()});await page.locator('.exam-history-redo').first().click();assert.match(message,/其他版本或其他题库/);assert.match(await page.locator('#qText').innerText(),/Unrelated/);
});
test('wrong-question filtering also applies search query',async t=>{
  const page=await pageFor(t);const result=await page.evaluate(async()=>{const {getFiltered}=await import('/src/filter.ts');return getFiltered([{id:1,type:'single',question:'Alpha',options:{}},{id:2,type:'single',question:'Beta',options:{}}],'wrong',{1:true,2:true},[],'Beta').map(q=>q.id)});assert.deepEqual(result,[2]);
});
test('legacy saved progress fills missing maps and malformed cached bank is ignored',async t=>{
  const page=await pageFor(t);await page.evaluate(bank=>localStorage.setItem('shuatitong_state',JSON.stringify({questions:bank})),[q(1)]);await page.reload({waitUntil:'networkidle'});assert.match(await page.locator('#qText').innerText(),/Question 1/);assert.doesNotMatch(await page.locator('body').innerText(),/Init Error/);
  await page.evaluate(()=>localStorage.setItem('shuatitong_state',JSON.stringify({questions:[null]})));await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('h1').count(),1);
});
test('saving failure gives visible warning rather than pretending progress was saved',async t=>{
  const page=await pageFor(t);await page.evaluate(async()=>{const {saveAppState}=await import('/src/storage.ts');const original=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new DOMException('quota','QuotaExceededError')};try{saveAppState({questions:[]})}finally{Storage.prototype.setItem=original}});assert.match(await page.locator('#storageSaveNotice').innerText(),/未保存/);
});
test('cancelled developer login cannot clear a newer successful session',async t=>{
  const page=await pageFor(t);const password=String.fromCharCode(49,50,51,52,53,54);let release;const delay=new Promise(r=>release=r);let calls=0;
  await page.route('http://127.0.0.1:3001/api/auth/root/login',async route=>{if(++calls===1){await delay;await route.abort().catch(()=>{})}else await route.fulfill({json:{tier:'root',token:'new-session',username:'yuhao'}})});
  const fill=async()=>{await page.locator('#devLoginUser').fill('yuhao');await page.locator('#devLoginPwd').fill(password);};
  await page.locator('#devModeBtn').click();await page.locator('.developer-service summary').click();await page.locator('#devLoginServer').fill('http://127.0.0.1:3001');await fill();await page.locator('#devLoginConfirm').click();await page.locator('#devLoginCancel').click();
  await page.locator('#devModeBtn').click();await page.locator('.developer-service summary').click();await page.locator('#devLoginServer').fill('http://127.0.0.1:3001');await fill();await page.locator('#devLoginConfirm').click();await page.waitForSelector('#devModeBtn.active');release();await page.waitForTimeout(120);
  assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('shuatitong_developer_session')).token),'new-session');
});

test('invalid AI grade boolean falls back to exact local answer comparison',async t=>{
  const page=await pageFor(t);await upload(page,[q(1,{type:'fill',options:{'空1':'Answer'},answer:''})]);await settings(page);
  await page.route('https://audit-model.test/v1/chat/completions',route=>route.fulfill({json:{choices:[{message:{content:JSON.stringify({results:[{blank:'空1',correct:'false',feedback:'wrong'}],overall:'correct'})}}]}}));
  await page.locator('#fillContainer input').fill('Wrong');await page.locator('[data-mode="ai"]').click();await page.locator('#fillSubmitBtn').click();await page.waitForFunction(()=>document.querySelector('#feedback').classList.contains('show'));
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shuatitong_state')).answeredMap['1']),'wrong');
});

test('adapt completion opens adapted questions once, with navigation and answer display',async t=>{
  const page=await pageFor(t);await settings(page);await page.route('http://127.0.0.1:3001/api/auth/root/login',route=>route.fulfill({status:503,json:{error:'offline'}}));
  await page.locator('#devModeBtn').click();await page.locator('#devLoginUser').fill('yuhao');await page.locator('#devLoginPwd').fill(String.fromCharCode(49,50,51,52,53,54));await page.locator('#devLoginConfirm').click();await page.waitForSelector('#devModeBtn.active');
  await upload(page,[q(1),q(2)]);let calls=0;await page.route('https://audit-model.test/v1/chat/completions',route=>{calls++;return route.fulfill({json:{choices:[{message:{content:JSON.stringify({question:'Adapted '+calls,answer:'AB'})}}]}})});
  await page.locator('#adaptBtn').click();await page.locator('[data-mode="single-to-multi"]').click();await page.locator('#adaptStartBtn').click();await page.waitForFunction(()=>document.querySelector('#adaptStartBtn').dataset.done==='true');await page.locator('#adaptStartBtn').click();
  assert.equal(calls,2);assert.match(await page.locator('#qText').innerText(),/Adapted 1/);await page.locator('#nextBtn').click();assert.match(await page.locator('#qText').innerText(),/Adapted 2/);await page.locator('#showAnswerBtn').click();assert.match(await page.locator('#feedback').innerText(),/已显示答案/);
});
