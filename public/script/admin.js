const socket = io();
const numEl = document.getElementById("number");
document.getElementById("next").onclick = ()=>socket.emit("next");
document.getElementById("prev").onclick = ()=>socket.emit("prev");
socket.on("updateNumber", n=>numEl.textContent=n);
