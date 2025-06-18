const API = 'https://script.google.com/macros/s/AKfycbwsj0yT4UvIehpK7kdXOV4g4ghQKzhD3yGrVif_S-NLKd2zfGcbG4t15-iIGd3yC1H0YA/exec';
const SALT = 'evn2025';

document.getElementById('btnTra').onclick = async () => {
  const ma = document.getElementById('inpMa').value.trim().toUpperCase();
  if(!ma) return alert('Nhập mã KH trước!');
  const pwRaw = prompt('Nhập mật khẩu:');
  if(pwRaw===null) return;
  const pwHash = await sha256(ma + SALT);

  const res = await fetch(`${API}?ma=${ma}&pw=${pwHash}`)
               .then(r=>r.json());
  if(res.status!=='OK') return alert(res.msg);

  renderTable(res.data);
  renderChart(res.data);
  setupCSV(res.data);
  document.getElementById('secData').hidden = false;
};

async function sha256(msg){
  const buf = new TextEncoder().encode(msg);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)]
    .map(b=>b.toString(16).padStart(2,'0')).join('');
}

function renderTable(arr){
  const hdr = '<tr><th>Ngày</th><th>kWh</th><th>kVArh</th><th>Tiền (đ)</th></tr>';
  const rows = arr.map(r=>`<tr><td>${r.date}</td><td>${r.kwh}</td><td>${r.kvarh}</td><td>${r.q_charge}</td></tr>`).join('');
  document.getElementById('tbl').innerHTML = hdr + rows;
}

function renderChart(arr){
  new Chart(document.getElementById('chart'),{
    type:'bar',
    data:{
      labels: arr.map(r=>r.date),
      datasets:[{label:'Q-Charge (đ)',data:arr.map(r=>r.q_charge)}]
    },
    options:{responsive:true}
  });
}

function setupCSV(arr){
  document.getElementById('btnCSV').onclick = () => {
    const csv = ['Ngày,kWh,kVArh,Tiền']
      .concat(arr.map(r=>`${r.date},${r.kwh},${r.kvarh},${r.q_charge}`))
      .join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
    a.download = `QCharge_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };
}
