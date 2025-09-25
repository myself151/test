// 共通関数
async function postJSON(url, data) {
  const res = await fetch(url, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(data)
  });
  return res.json();
}

// ===== 管理者(admin.html) =====
const setPasswordBtn = document.getElementById("set-password");
if (setPasswordBtn) {
  setPasswordBtn.onclick = async () => {
    const pw = document.getElementById("admin-password").value;
    const r = await postJSON("/admin/setpassword", { password: pw });
    alert(r.status);
  };
}

const setMaxBtn = document.getElementById("set-max");
if (setMaxBtn) {
  setMaxBtn.onclick = async () => {
    const max = document.getElementById("max-inside").value;
    const r = await postJSON("/admin/setmax", { max });
    alert(r.status);
  };
}

const issueBtn = document.getElementById("issue-tickets");
if (issueBtn) {
  issueBtn.onclick = async () => {
    const start = Number(document.getElementById("start").value);
    const end = Number(document.getElementById("end").value);
    const r = await postJSON("/admin/issue", { start, end });
    alert("整理券発行: " + r.issuedTickets.join(","));
  };
}

const pdfBtn = document.getElementById("pdf-btn");
if (pdfBtn) pdfBtn.onclick = () => window.open("/admin/pdf", "_blank");

const summaryBtn = document.getElementById("summary-btn");
if (summaryBtn) summaryBtn.onclick = async () => {
  const r = await fetch("/admin/summary").then(res => res.json());
  alert(`発行:${r.issued}, チェックイン:${r.checkedIn}, スキップ:${r.skipped}, 最大人数:${r.maxInside}`);
};

const resetBtn = document.getElementById("reset-btn");
if (resetBtn) resetBtn.onclick = async () => {
  const r = await postJSON("/admin/reset", {});
  alert(r.status);
};

// ===== QR読み取り (enter.html / exit.html) =====
if (document.getElementById("qr-reader")) {
  const html5QrCode = new Html5Qrcode("qr-reader");
  html5QrCode.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    async qrMessage => {
      const ticketNumber = Number(qrMessage);
      await postJSON("/user/checkin", { ticketNumber });
      const msgDiv = document.getElementById("checkin-msg");
      msgDiv.innerText = "お進みください";
      setTimeout(()=>{ msgDiv.innerText = ""; }, 1000);
      // 呼び出し番号更新
      const cur = await fetch("/admin/summary").then(r => r.json());
      document.getElementById("current-ticket").innerText = cur.checkedIn.length > 0 ? cur.checkedIn[cur.checkedIn.length-1] : 0;
    }
  ).catch(err => console.log(err));
}

// ===== 利用者(user.html) =====
const checkinBtn = document.getElementById("checkin-btn");
if (checkinBtn) {
  checkinBtn.onclick = async () => {
    const num = Number(document.getElementById("ticket-number").value);
    await postJSON("/user/checkin", { ticketNumber: num });
    alert("チェックイン完了");
  };
}

const cancelBtn = document.getElementById("cancel-btn");
if (cancelBtn) {
  cancelBtn.onclick = async () => {
    const num = Number(document.getElementById("ticket-number").value);
    await postJSON("/user/cancel", { ticketNumber: num });
    alert("キャンセル完了");
  };
}
