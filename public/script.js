// 共通JS

async function setCapacity() {
  const max = document.getElementById("maxInput").value;
  const res = await fetch("/api/capacity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ max: parseInt(max) }),
  });
  const data = await res.json();
  alert("最大人数を更新: " + data.maxCapacity);
}

async function enter() {
  const res = await fetch("/api/enter", { method: "POST" });
  const data = await res.json();
  alert("入場者数: " + data.inside);
}

async function exit() {
  const res = await fetch("/api/exit", { method: "POST" });
  const data = await res.json();
  alert("入場者数: " + data.inside);
}

async function getTicket() {
  const res = await fetch("/api/ticket", { method: "POST" });
  const data = await res.json();
  document.getElementById("ticketInfo").innerText =
    "整理券番号: " + data.number + (data.canEnter ? " → 入場可能" : " → 順番待ち");
}

async function generatePDF() {
  const start = document.getElementById("start").value;
  const end = document.getElementById("end").value;
  const url = document.getElementById("url").value;
  const res = await fetch("/admin/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start: parseInt(start), end: parseInt(end), url }),
  });

  if (res.ok) {
    const blob = await res.blob();
    const link = document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.download = "tickets.pdf";
    link.click();
  } else {
    alert("PDF生成に失敗しました");
  }
}
