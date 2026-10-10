import{n as e,t}from"./index-I3H-Vgo4.js";async function n(e,n){let r=t.aiSettings.syncServer||`http://localhost:3001`,i={"Content-Type":`application/json`};t.aiSettings.syncToken&&(i.Authorization=`Bearer `+t.aiSettings.syncToken);let a=await fetch(r+e,{...n,headers:i});if(!a.ok){let e=await a.json().catch(()=>({error:`请求失败`}));throw Error(e.error||`HTTP ${a.status}`)}return a.json()}function r(){let r=document.createElement(`div`);r.className=`modal-overlay`;let i=!!t.aiSettings.syncToken;r.innerHTML=`
    <div class="modal" style="max-width:440px">
      <h2><span class="svg-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></span>数据同步</h2>
      ${i?`
        <p style="color:var(--text-secondary);margin-bottom:12px">
          已登录：<strong>${e(t.aiSettings.syncUsername||`root`)}</strong>
        </p>
        <div style="background:var(--tag-bg);padding:14px;border-radius:8px;margin-bottom:16px;font-size:.85rem">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <span>服务器</span>
            <span>${e(t.aiSettings.syncServer||`http://localhost:3001`)}</span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span>状态</span>
            <span id="syncStatusText">检查中...</span>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <button id="syncDownloadBtn" class="btn-primary" style="flex:1"><span class="svg-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></span>从服务器下载</button>
          <button id="syncUploadBtn" class="btn-outline" style="flex:1"><span class="svg-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></span>上传到服务器</button>
        </div>
        <div id="syncResult" style="font-size:.85rem;margin-bottom:8px"></div>
        <div class="modal-actions">
          <button id="syncLogout" class="btn-outline" style="color:var(--wrong)">退出登录</button>
          <button id="syncClose" class="btn-primary">完成</button>
        </div>
      `:`
        <p style="color:var(--text-secondary);margin-bottom:16px">登录后可在多设备间同步题库数据。游客模式使用本地数据即可。</p>
        <label>服务器地址</label>
        <input type="text" id="syncServerInput" class="edit-input" value="${e(t.aiSettings.syncServer||`http://`)}" placeholder="http://电脑IP:3001" style="margin-bottom:12px">
        <label>用户名</label>
        <input type="text" id="syncUsername" class="edit-input" autocomplete="username" style="margin-bottom:12px">
        <label>密码</label>
        <input type="password" id="syncPassword" class="edit-input" autocomplete="current-password" style="margin-bottom:16px">
        <div class="modal-actions">
          <button id="syncLoginBtn" class="btn-primary">🔐 登录</button>
          <button id="syncClose2" class="btn-outline">取消</button>
        </div>
      `}
    </div>
  `,document.body.appendChild(r),i?(n(`/api/status`).then(()=>{document.getElementById(`syncStatusText`).textContent=`✅ 已连接`}).catch(()=>{document.getElementById(`syncStatusText`).textContent=`❌ 无法连接`}),r.querySelector(`#syncClose`)?.addEventListener(`click`,()=>r.remove()),r.querySelector(`#syncLogout`)?.addEventListener(`click`,()=>{t.updateAISettings({syncToken:void 0,syncUsername:void 0}),r.remove()}),r.querySelector(`#syncDownloadBtn`)?.addEventListener(`click`,async()=>{let e=document.getElementById(`syncResult`);e.textContent=`⏳ 下载中...`;try{let r=await n(`/api/questions`);t.state.questions.splice(0,t.state.questions.length,...r),t.update({currentIndex:0,filterType:`all`,correctCount:0,wrongCount:0,answeredMap:{},errorBook:{}}),t.save(),window.dispatchEvent(new CustomEvent(`questions-synced`)),e.innerHTML=`✅ 已下载 `+r.length+` 题`}catch(t){e.innerHTML=`❌ `+t.message}}),r.querySelector(`#syncUploadBtn`)?.addEventListener(`click`,async()=>{let e=document.getElementById(`syncResult`);e.textContent=`⏳ 上传中...`;try{let r=t.state.questions;e.innerHTML=`✅ 已上传 `+(await n(`/api/questions`,{method:`PUT`,body:JSON.stringify(r)})).count+` 题`}catch(t){e.innerHTML=`❌ `+t.message}})):(r.querySelector(`#syncClose2`)?.addEventListener(`click`,()=>r.remove()),r.querySelector(`#syncLoginBtn`)?.addEventListener(`click`,async()=>{let e=r.querySelector(`#syncServerInput`).value.trim(),n=r.querySelector(`#syncUsername`).value.trim(),i=r.querySelector(`#syncPassword`).value;if(!e||!n||!i){alert(`请填写完整信息`);return}try{let a=await fetch(e+`/api/auth/root/login`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({username:n,password:i})}),o=await a.json();if(!a.ok){alert(o.error);return}t.updateAISettings({syncToken:o.token,syncUsername:o.username,syncServer:e}),r.remove(),alert(`登录成功！请重新打开同步面板下载数据。`)}catch{alert(`无法连接服务器，请检查地址和网络。`)}})),r.addEventListener(`click`,e=>{e.target===r&&r.remove()})}export{r as showSyncModal};