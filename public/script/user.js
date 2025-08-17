const socket = io();
const currentEl = document.getElementById("current");
const myNumInput = document.getElementById("myNum");
const regBtn = document.getElementById("reg");

let myNumber = null;
let notified = false;

if(location.protocol==="https:"||location.hostname==="localhost"){
if(Notification.permission!=="granted") Notification.requestPermission();
}

regBtn.onclick=()=>{
const v=parseInt(myNumInput.value,10);
if(Number.isNaN(v)||v<=0)return alert("正しい番号を入力してください");
myNumber=v;notified=false;
alert(`番号 ${myNumber} を登録しました`);
};

socket.on("updateNumber", num=>{
currentEl.textContent=num;
if(myNumber!==null&&!notified&&num>=myNumber-5){
notified=true;
if(Notification.permission==="granted"){
new Notification("もうすぐ呼ばれます！",{body:`あなたの番号は ${myNumber} です`});
}else alert(`もうすぐ呼ばれます！（あなたの番号: ${myNumber}）`);
}
});
