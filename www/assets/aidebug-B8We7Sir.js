import{t as e}from"./index-BszdGY7W.js";function t(){let t=document.createElement(`div`);t.className=`modal-overlay`,t.id=`aiDebugModal`,t.innerHTML=`
    <div class="modal" style="max-width:700px;height:80vh;display:flex;flex-direction:column;padding:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h2 style="margin:0;font-size:1.1rem">🤖 AI 调试</h2>
        <button id="aiDebugClose" class="btn-sm" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--text-secondary)">✕</button>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap">
        <div style="flex:1;min-width:100px">
          <div style="font-size:.75rem;color:var(--text-secondary);margin-bottom:2px">模型来源</div>
          <select id="aiDebugSource" class="edit-input" style="margin-bottom:0">
            <option value="remote">☁️ 远程</option>
            <option value="local">💻 本地</option>
          </select>
        </div>
        <div style="flex:2;min-width:140px">
          <div style="font-size:.75rem;color:var(--text-secondary);margin-bottom:2px">模型名称</div>
          <select id="aiDebugModel" class="edit-input" style="margin-bottom:0"><option value="">默认模型</option></select>
        </div>
        <div style="flex:1;min-width:60px">
          <div style="font-size:.75rem;color:var(--text-secondary);margin-bottom:2px">温度</div>
          <input type="number" id="aiDebugTemp" class="edit-input" value="0.7" step="0.05" min="0" max="2" style="margin-bottom:0">
        </div>
        <div style="flex:1;min-width:70px">
          <div style="font-size:.75rem;color:var(--text-secondary);margin-bottom:2px">最大 Token</div>
          <input type="number" id="aiDebugTokens" class="edit-input" value="1024" step="64" min="64" max="4096" style="margin-bottom:0">
        </div>
        <div style="display:flex;align-items:flex-end"><button id="aiDebugClear" class="btn-sm btn-outline" style="margin-bottom:0">清空</button></div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:6px">
        <div style="flex:2">
          <div style="font-size:.75rem;color:var(--text-secondary);margin-bottom:2px">System Prompt</div>
          <input type="text" id="aiDebugSystem" class="edit-input" value="你是一个有帮助的AI助手" style="margin-bottom:0">
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:10px">
        <div style="flex:2">
          <div style="font-size:.75rem;color:var(--text-secondary);margin-bottom:2px">API 地址</div>
          <input type="text" id="aiDebugApiUrl" class="edit-input" style="margin-bottom:0;background:var(--filter-bg);color:var(--text-secondary)" readonly>
        </div>
        <div style="flex:1">
          <div style="font-size:.75rem;color:var(--text-secondary);margin-bottom:2px">API Key</div>
          <input type="password" id="aiDebugApiKey" class="edit-input" style="margin-bottom:0;background:var(--filter-bg);color:var(--text-secondary)" readonly>
        </div>
      </div>

      <div id="aiDebugMessages" style="flex:1;overflow-y:auto;background:var(--bg);border-radius:8px;padding:12px;font-size:.85rem;line-height:1.6;margin-bottom:10px;display:flex;flex-direction:column;gap:8px">
        <div style="color:var(--text-secondary);text-align:center;padding:20px">输入消息开始调试 AI</div>
      </div>

      <div style="display:flex;gap:8px">
        <textarea id="aiDebugInput" class="edit-input" rows="2" placeholder="输入消息..." style="flex:1;margin-bottom:0;resize:none"></textarea>
        <button id="aiDebugSend" class="btn-primary" style="align-self:flex-end;padding:8px 20px">发送</button>
      </div>
    </div>
  `,document.body.appendChild(t);let n=t.querySelector(`#aiDebugSource`),r=t.querySelector(`#aiDebugModel`),i=t.querySelector(`#aiDebugApiUrl`),a=t.querySelector(`#aiDebugApiKey`),o=t.querySelector(`#aiDebugMessages`),s=t.querySelector(`#aiDebugInput`),c=t.querySelector(`#aiDebugSend`),l=t.querySelector(`#aiDebugClear`),u=t.querySelector(`#aiDebugClose`);function d(){let t=n.value,o=e.getApiConfig(t);i.value=o.apiBaseUrl,a.value=o.apiKey?o.apiKey.slice(0,20)+`...`:`(空)`;let s=o.apiModel,c=r.options;for(let e=0;e<c.length;e++)if(c[e].value===s){c[e].selected=!0;break}}n.addEventListener(`change`,d),[`deepseek-v4-flash`,`deepseek-chat`,`deepseek-reasoner`,`deepseek-coder`,`deepseek-v4-pro`,`gpt-4o`,`gpt-4o-mini`,`claude-3-sonnet`,`claude-3-haiku`,`qwen2.5`,`qwen2.5-coder`,`llama3.1`].forEach(e=>{let t=document.createElement(`option`);t.value=e,t.textContent=e,r.appendChild(t)}),d();function f(e,t){let n=document.createElement(`div`);n.style.cssText=`padding:8px 12px;border-radius:8px;max-width:85%;white-space:pre-wrap;word-break:break-word;font-size:.85rem;line-height:1.6`,e===`user`?n.style.cssText+=`background:var(--primary);color:#fff;align-self:flex-end`:e===`assistant`?n.style.cssText+=`background:var(--card-bg);border:1px solid var(--border);align-self:flex-start`:n.style.cssText+=`background:var(--tag-bg);color:var(--text-secondary);align-self:flex-start;font-size:.78rem`,n.textContent=t,o.appendChild(n),o.scrollTop=o.scrollHeight}async function p(){let i=s.value.trim();if(!i)return;s.value=``,f(`user`,i),c.disabled=!0,c.textContent=`⏳`;let a=n.value,o=e.getApiConfig(a),l=t.querySelector(`#aiDebugSystem`).value.trim()||`你是一个有帮助的AI助手`,u=r.value||o.apiModel,d=parseFloat(t.querySelector(`#aiDebugTemp`).value)||.7,p=parseInt(t.querySelector(`#aiDebugTokens`).value)||1024;try{let e={"Content-Type":`application/json`};o.apiKey&&(e.Authorization=`Bearer ${o.apiKey}`);let t=await fetch(`${o.apiBaseUrl.replace(/\/+$/,``)}/chat/completions`,{method:`POST`,headers:e,body:JSON.stringify({model:u,messages:[{role:`system`,content:l},{role:`user`,content:i}],max_tokens:p,temperature:d})});if(!t.ok){let e=await t.text().catch(()=>``);f(`system`,`❌ HTTP ${t.status}: ${e.slice(0,500)}`);return}let n=await t.json();f(`assistant`,(n.choices?.[0]?.message?.content||n.choices?.[0]?.message?.reasoning_content||n.response||JSON.stringify(n,null,2).slice(0,2e3)).toString().trim()||`(空响应)`)}catch(e){f(`system`,`❌ 请求失败: ${e.message}`)}finally{c.disabled=!1,c.textContent=`发送`}}c.addEventListener(`click`,p),s.addEventListener(`keydown`,e=>{e.key===`Enter`&&!e.shiftKey&&(e.preventDefault(),p())}),l.addEventListener(`click`,()=>{o.innerHTML=`<div style="color:var(--text-secondary);text-align:center;padding:20px">已清空</div>`}),u.addEventListener(`click`,()=>t.remove()),t.addEventListener(`click`,e=>{e.target===t&&t.remove()})}export{t as showAIDebug};