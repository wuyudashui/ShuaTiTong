const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '../www');
const fixture = path.resolve(__dirname, 'fixtures/formula-question.json');
const testPassword = process.env.SHUATITONG_TEST_PASSWORD || String.fromCharCode(49, 50, 51, 52, 53, 54);
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.woff2':'font/woff2', '.woff':'font/woff', '.ttf':'font/ttf', '.png':'image/png' };

(async () => {
  // Serve the built application under the same project prefix used by Pages.
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith('/ShuaTiTong/')) { res.writeHead(404).end(); return; }
      const file = path.resolve(root, decodeURIComponent(url.pathname.slice('/ShuaTiTong/'.length)) || 'index.html');
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/ShuaTiTong/`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 688, 1280]) {
      const context = await browser.newContext({viewport:{width,height:900}});
      const page = await context.newPage();
      const errors = [], publicationWrites = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('request', req => { if (req.method() !== 'GET' && /question-banks|publisher|api.github.com/.test(req.url())) publicationWrites.push(req.url()); });
      await page.route('http://127.0.0.1:3001/api/auth/root/login', route => route.fulfill({status:503,json:{error:'offline test'}}));
      await page.goto(url, {waitUntil:'networkidle'});
      assert.match(await page.locator('h1').innerText(), /刷题通/);
      assert.equal(await page.locator('#uploadArea').isVisible(), true);
      assert.equal(await page.locator('#formatTemplate').count(), 0);
      assert.equal(await page.locator('#syncBtn, #exportBtn').count(), 0);
      const toolbar = await page.evaluate(() => {
        const a = document.getElementById('navAiRow').getBoundingClientRect(), n = document.getElementById('navButtons').getBoundingClientRect();
        return {gap:n.top - a.bottom,height:document.getElementById('nextBtn').getBoundingClientRect().height};
      });
      assert.ok(toolbar.gap >= 12 && toolbar.height >= 44);
      if (width <= 680) {
        const buttons = await page.locator('.header-actions > button:visible,.header-actions > a:visible').evaluateAll(items => items.map(el => ({x:el.getBoundingClientRect().left,w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height})));
        assert.equal(new Set(buttons.map(b => Math.round(b.w))).size,1);
        assert.ok(buttons.every(b => b.h >= 24), 'compact web controls remain tappable');
      }
      assert.equal(await page.locator('#fileInput').getAttribute('accept'), '.json,application/json');
      assert.match(await page.locator('.upload-preprocess-note').innerText(), /shuatitong-any2json/);
      let unsupportedMessage = '';
      page.once('dialog', async dialog => { unsupportedMessage = dialog.message(); await dialog.dismiss(); });
      await page.locator('#fileInput').setInputFiles({name:'lecture.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from('unsupported')});
      assert.match(unsupportedMessage, /仅支持 JSON/);
      await page.locator('#appDownloadBtn').click();
      assert.match(await page.locator('#appDownloadModal').innerText(), /卸载重装|进度会重置/);
      assert.equal(await page.locator('#appDownloadConfirm').getAttribute('href'), 'https://github.com/wuyudashui/ShuaTiTong/releases/download/android-latest/shuatitong.apk');
      await page.locator('#appDownloadCancel').click();
      // A cancelled library request must not replace the subsequently chosen bank.
      let releaseBank;
      const delayedBank = new Promise(resolve => { releaseBank = resolve; });
      const delayPattern = '**/question-banks/merged_questions.json';
      await page.route(delayPattern, async route => {
        await delayedBank;
        await route.fulfill({json:[{id:8801,type:'single',question:'Stale bank',options:{A:'A'},answer:'A',difficulty:'易',explanation:''}]}).catch(() => {});
      });
      await page.locator('#questionPoolBtn').click(); await page.waitForSelector('.pool-card');
      const dialog = await page.locator('.pool-modal').boundingBox();
      assert.ok(dialog.x >= 10 && dialog.width <= width - 20, 'dialog preserves viewport margins');
      if (width > 1000) assert.ok(dialog.width >= 850, 'desktop library is not constrained by form-modal width');
      assert.ok((await page.locator('.pool-card-content').first().boundingBox()).width > 180, 'actions do not squeeze text');
      await page.locator('[data-load="0"]').click();
      await page.locator('[data-load="2"]').click();
      await page.waitForFunction(() => document.querySelector('#activeBankName').textContent === '示例题库');
      releaseBank();
      await page.waitForTimeout(100);
      assert.equal(await page.locator('#activeBankName').innerText(), '示例题库');
      await page.unroute(delayPattern);
      await page.locator('#questionPoolBtn').click();
      await page.waitForSelector('.pool-card');
      assert.equal(await page.locator('#publisherPanel').count(), 0);
      await page.locator('[data-load="0"]').click();
      await page.waitForFunction(() => document.querySelector('#qNumber').textContent.includes('257'));
      await page.locator('.option').nth(1).click();
      assert.match(await page.locator('#feedback').innerText(), /回答正确/);
      await page.locator('#nextBtn').click();
      await page.locator('#memorizeBtn').click();
      assert.equal(await page.locator('#memorizeBtn').getAttribute('aria-pressed'), 'true');
      assert.match(await page.locator('#memorizeBtn').innerText(), /背题中/);
      const memorizing = await page.locator('#memorizeBtn').evaluate(el => getComputedStyle(el).backgroundColor);
      await page.reload({waitUntil:'networkidle'});
      assert.equal(await page.locator('#memorizeBtn').getAttribute('aria-pressed'), 'true');
      await page.locator('#memorizeBtn').click();
      assert.notEqual(await page.locator('#memorizeBtn').evaluate(el => getComputedStyle(el).backgroundColor), memorizing);
      await page.locator('#nextBtn').click();
      assert.match(await page.locator('#qNumber').innerText(), /第 2 题/);
      assert.equal(await page.locator('#correctCount').innerText(), '1');
      await page.locator('#settingsBtn').click();
      assert.equal(await page.locator('#apiModelSelect option').count(), 1);
      await page.locator('#apiBaseUrl').fill('');
      assert.equal(await page.locator('#apiModelSelect').isDisabled(), true);
      await page.locator('#apiBaseUrl').fill('https://models.example.test/v1');
      await page.locator('#apiKeyInput').fill('test-key');
      let authorization;
      await page.route('https://models.example.test/v1/models', route => { authorization = route.request().headers().authorization; return route.fulfill({json:{data:[{id:'model-one'},{id:'model-two'}]}}); });
      await page.locator('#fetchModelsBtn').click();
      await page.waitForFunction(() => document.querySelector('#modelFetchStatus').textContent.includes('2 个模型'));
      assert.equal(authorization, 'Bearer test-key');
      await page.locator('#apiModelSelect').selectOption('model-two');
      await page.locator('#settingsSaveBtn').click();
      await page.reload({waitUntil:'networkidle'});
      await page.locator('#settingsBtn').click();
      assert.equal(await page.locator('#apiModelCustom').inputValue(), 'model-two');
      await page.locator('#settingsCancelBtn').click();

      await page.locator('#fileInput').setInputFiles(fixture);
      await page.waitForFunction(() => document.querySelector('#qNumber').textContent.includes('9001'));
      assert.equal(await page.locator('#qText .katex').count(), 2);
      assert.equal(await page.locator('.option .katex').count(), 2);
      await page.locator('#showAnswerBtn').click();
      assert.equal(await page.locator('#explanationText .katex').count(), 1);
      assert.match(await page.locator('#explanationText code').innerText(), /\$not-formula\$/);
      const aiText = '公式 \\(x<y\\)。\n\n\\[\\begin{bmatrix}1&2\\\\\\frac{1}{2}&4\\end{bmatrix}\\]\n\n错误 $\\notACommand{x}$\n\n```js\nconst x = "$ignored$";\n```\n<script>window.__unsafe = 1</script>';
      await page.route('https://models.example.test/v1/chat/completions', route => route.fulfill({json:{choices:[{message:{content:aiText}}]}}));
      await page.locator('#aiSimplifyBtn').click();
      await page.waitForSelector('#explanationText .formula-fallback');
      assert.equal(await page.locator('#explanationText .katex').count(), 2);
      assert.equal(await page.locator('#explanationText .katex-error').count(), 0);
      assert.equal(await page.locator('#explanationText mfrac').count(), 1);
      assert.equal(await page.evaluate(() => window.__unsafe), undefined);
      assert.match(await page.locator('#explanationText pre').innerText(), /\$ignored\$/);
      // Developer UI and publication controls require explicit unlock; no defaults in text.
      await page.locator('#devModeBtn').click();
      assert.equal((await page.locator('.modal-overlay:visible').innerText()).includes(testPassword), false);
      await page.locator('#devLoginUser').fill('yuhao');
      await page.locator('#devLoginPwd').fill(testPassword);
      await page.locator('#devLoginConfirm').click();
      await page.waitForSelector('#devModeBtn.active');
      await page.locator('#questionPoolBtn').click();
      assert.equal(await page.locator('#publisherPanel').count(), 1);
      assert.equal(await page.locator('#publisherUser, #publisherPassword').count(), 0);
      await page.locator('#poolClose').click();
      await page.locator('#devModeBtn').click();
      await page.locator('#themeBtn').click();
      assert.equal(await page.locator('html').evaluate(el => el.classList.contains('dark')), true);
      await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(22, 27, 43)');
      assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(22, 27, 43)', 'dark theme must cover the page background');
      const contrast = await page.locator('.upload-local-note').evaluate(el => {
        const luminance = color => {
          const channels = color.match(/\d+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
          return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
        };
        const a = luminance(getComputedStyle(el).color), b = luminance(getComputedStyle(document.querySelector('#uploadArea')).backgroundColor);
        return (Math.max(a,b) + .05) / (Math.min(a,b) + .05);
      });
      assert.ok(contrast >= 4.5, `dark helper text contrast ${contrast}`);
      await page.locator('#questionPoolBtn').click();
      assert.equal(await page.locator('.pool-modal').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(28, 34, 55)');
      await page.locator('#poolClose').click();
      await page.locator('#settingsBtn').click();
      assert.equal(await page.locator('#apiBaseUrl').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(22, 27, 43)');
      await page.locator('#settingsCancelBtn').click();

      const fill = [{id:99,type:'fill',question:'1 + 1 = ____',options:{'空1':'2'},answer:'',difficulty:'易',explanation:''}];
      await page.locator('#fileInput').setInputFiles({name:'fill.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fill))});
      await page.waitForFunction(() => document.querySelector('#qNumber').textContent.includes('#99'));
      await page.locator('#examBtn').click();
      await page.locator('#examStartBtn').click();
      await page.locator('#fillContainer input').fill('2');
      assert.equal(await page.locator('#fillSubmitBtn').count(), 0);
      assert.equal(await page.locator('#feedback').evaluate(el => el.classList.contains('show')), false);
      await page.locator('#submitExamBtn').click();
      assert.equal(await page.locator('.score-num').innerText(), '1/1');
      await page.locator('#examResultExitBtn').click();
      const hostile = [{...fill[0],options:{'空1':'<img src="x" onerror="window.__bankXss=1">'}}];
      await page.locator('#fileInput').setInputFiles({name:'text-answer.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(hostile))});
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('shuatitong_state')).questions[0].options['空1'].startsWith('<img'));
      await page.locator('#examBtn').click(); await page.locator('#examStartBtn').click();
      await page.locator('#fillContainer input').fill('<img src="x" onerror="window.__bankXss=2">');
      await page.locator('#submitExamBtn').click(); await page.locator('#examResultReviewBtn').click();
      assert.equal(await page.locator('#feedbackResult img').count(), 0);
      assert.equal(await page.evaluate(() => window.__bankXss), undefined);
      await page.evaluate(() => window.dispatchEvent(new ErrorEvent('error', {message:'image failed',error:null})));
      assert.match(await page.locator('h1').innerText(), /刷题通/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(publicationWrites, [], 'local uploads must never publish globally');
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS production Pages path, ${width}px: library/local import, formulas, model list, login, persistence, exam, theme`);
    }
    const context = await browser.newContext({viewport:{width:688,height:900}});
    const page = await context.newPage();
    await page.goto(url, {waitUntil:'networkidle'});
    await page.locator('#fileInput').setInputFiles(fixture);
    await page.waitForFunction(() => document.querySelector('#qNumber').textContent.includes('9001'));
    const localBefore = await page.evaluate(() => localStorage.getItem('shuatitong_state'));
    const sample = {filename:'sample.json',name:'Original',subject:'Example',description:'Example bank',path:'question-banks/sample.json',count:1};
    let banks = [sample], version = 'v1', logins = 0; const operations = [];
    await page.route('http://127.0.0.1:3001/api/**', route => {
      const req = route.request(); const apiPath = new URL(req.url()).pathname; const method = req.method();
      const body = method === 'GET' ? null : req.postDataJSON();
      if (apiPath.endsWith('/login')) { logins++; return route.fulfill({json:{token:'test-session',username:'yuhao',tier:'root'}}); }
      if (apiPath.endsWith('/publisher/status')) return route.fulfill({json:{configured:true}});
      assert.equal(req.headers().authorization, 'Bearer test-session');
      if (apiPath === '/api/question-banks' && method === 'GET') return route.fulfill({json:{version:1,banks}});
      if (method === 'GET') return route.fulfill({json:{bank:banks.find(b => apiPath.endsWith(b.filename)),questions:[{id:1,type:'single',question:'Example',options:{A:'Yes'},answer:'A'}],version}});
      operations.push({method,body});
      if (method === 'PATCH') { sample.name=body.name; sample.subject=body.subject; sample.description=body.description; sample.filename=body.filename || sample.filename; sample.path='question-banks/'+sample.filename; version=version==='v1'?'v2':'v3'; }
      if (method === 'POST') {
        if (body.filename==='new-bank.json') banks.push({...sample,filename:body.filename,path:'question-banks/new-bank.json',name:body.name});
        version='v3';
      }
      if (method === 'DELETE') { banks=banks.filter(b=>!apiPath.endsWith(b.filename)); version='v4'; }
      return route.fulfill({json:{...sample,commitSha:version}});
    });
    await page.locator('#devModeBtn').click();
    assert.equal(await page.locator('.developer-note a').getAttribute('href'), 'mailto:2442078047@qq.com');
    await page.locator('#devLoginUser').fill('yuhao'); await page.locator('#devLoginPwd').fill(testPassword);
    await page.locator('#devLoginConfirm').click(); await page.waitForSelector('#devModeBtn.active');
    await page.locator('#questionPoolBtn').click(); await page.waitForSelector('.pool-card');
    await page.waitForFunction(() => document.querySelector('#publisherStatus').textContent.includes('已连接'));
    assert.equal(await page.locator('#publisherUser,#publisherPassword').count(),0);
    await page.locator('[data-manage="0"]').click();
    await page.waitForFunction(() => document.querySelector('#publishName').value === 'Original');
    assert.equal(await page.locator('#publishFilename').evaluate(el=>el.readOnly),false);
    assert.ok((await page.locator('#publishDescription').boundingBox()).width > 450);
    await page.locator('#publishName').fill('Renamed'); await page.locator('#publishSubject').fill('Changed subject');
    await page.locator('#publishSubmit').click();
    await page.waitForFunction(() => document.querySelector('#publisherStatus').textContent.includes('已保存到 GitHub'));
    assert.equal(operations[0].method, 'PATCH'); assert.equal(operations[0].body.version, 'v1');
    assert.equal(operations[0].body.questions, undefined);
    await page.locator('#publishFile').setInputFiles(fixture);
    await page.locator('#publishFilename').fill('renamed.json');
    await page.locator('#publishSubmit').click();
    await page.waitForFunction(() => !document.querySelector('#publishSubmit').disabled);
    assert.equal(operations[1].method, 'PATCH'); assert.equal(operations[1].body.version, 'v2');
    assert.equal(operations[1].body.filename, 'renamed.json'); assert.equal(operations[1].body.questions[0].id, 9001);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#publishDelete').click(); await page.waitForFunction(() => document.querySelector('#publisherStatus').textContent.includes('公共题库已删除'));
    assert.equal(operations[2].method, 'DELETE'); assert.equal(operations[2].body.confirm, true);
    await page.locator('#publishNew').click();
    await page.locator('#publishFile').setInputFiles(fixture);
    await page.locator('#publishFilename').fill('new-bank.json'); await page.locator('#publishName').fill('New bank'); await page.locator('#publishSubject').fill('Math');
    await page.locator('#publishSubmit').click(); await page.waitForFunction(() => !document.querySelector('#publishSubmit').disabled);
    assert.equal(operations[3].method, 'POST'); assert.equal(operations[3].body.overwrite, false);
    await page.locator('#poolClose').click();
    await page.reload({waitUntil:'networkidle'});
    await page.locator('#questionPoolBtn').click();
    await page.waitForFunction(() => document.querySelector('#publisherStatus').textContent.includes('已连接'));
    assert.equal(logins,1,'maintenance and refresh reuse the original developer login');
    assert.equal(await page.evaluate(()=>localStorage.getItem('shuatitong_ai_settings').includes('test-session')),false);
    await page.locator('#poolClose').click(); await page.locator('#devModeBtn').click();
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('shuatitong_developer_session')),null);
    assert.equal(await page.evaluate(() => localStorage.getItem('shuatitong_state')), localBefore);
    await context.close();
    console.log('PASS developer maintenance: single login, filename rename/category, replace JSON, confirm delete, add bank, local data preserved');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
