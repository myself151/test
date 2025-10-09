// admin.js
async function api(path, opts){ 
  const r = await fetch(path, opts);
  return r.json ? r.json() : null;
}

async function loadRange(){
  const res = await fetch('/api/getRange');
  const data = await res.json();
  if (data.distributedRange){
    document.getElementById('currentRange').innerText = `${data.distributedRange.start}-${data.distributedRange.end}`;
    document.getElementById('distributedCount').innerText = (data.distributedRange.end - data.distributedRange.start + 1);
  } else {
    document.getElementById('currentRange').innerText = '未設定';
    document.getElementById('distributedCount').innerText = '0';
  }
}

document.getElementById('setRangeBtn').addEventListener('click', async ()=>{
  const range = document.getElementById('rangeInput').value;
  const res = await fetch('/api/setRange', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ range }) });
  if (res.ok) { alert('範囲を設定しました'); loadRange(); refreshStats(); }
  else alert('範囲エラー');
});

document.getElementById('setMaxBtn').addEventListener('click', async ()=>{
  const max = parseInt(document.getElementById('maxInside').value) || 0;
  await fetch('/api/setMaxInside', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ maxInside: max }) });
  alert('最大人数を更新しました');
  refreshStats();
});

document.getElementById('refreshStats').addEventListener('click', refreshStats);
async function refreshStats(){
  const s = await (await fetch('/api/summary')).json();
  document.getElementById('checkedIn').innerText = s.checkedInCount;
  document.getElementById('checkedOut').innerText = s.checkedOutCount;
  document.getElementById('distributedCount').innerText = s.distributedCount;
  document.getElementById('currentCall').innerText = s.currentCallNumber || '-';
}

document.getElementById('resetBtn').addEventListener('click', async ()=>{
  if (!confirm('本当にリセットしますか？ 配布範囲・履歴が消えます')) return;
  await fetch('/api/reset', { method:'POST' });
  alert('リセットしました');
  loadRange(); refreshStats();
});

document.getElementById('generatePdfBtn').addEventListener('click', async ()=>{
  const start = parseInt(document.getElementById('pdfStart').value);
  const end = parseInt(document.getElementById('pdfEnd').value);
  const siteURL = document.getElementById('siteUrl').value;
  if (!start || !end || end < start) { alert('start/end を正しく入力してください'); return; }
  const res = await fetch('/api/generate-pdf', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ start, end, siteURL })
  });
  if (res.ok){
    // ブラウザが自動ダウンロード対応しているはず
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tickets.pdf';
    a.click();
  } else {
    alert('PDF生成に失敗しました');
  }
});

window.addEventListener('DOMContentLoaded', ()=>{ loadRange(); refreshStats(); });
