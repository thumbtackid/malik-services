let currentUser;
(async () => {
  const session = await requireAuth(); if(!session) return;
  currentUser = session.user;
  
  const userNameEl = document.getElementById("userName");
  if(userNameEl) userNameEl.textContent = currentUser.email;
  
  const orderNamaEl = document.getElementById("orderNama");
  if(orderNamaEl) orderNamaEl.value = currentUser.user_metadata?.nama || "";

  const { data: services } = await supabaseClient.from('services').select('*');
  const orderLayananEl = document.getElementById('orderLayanan');
  if(orderLayananEl && services) {
    orderLayananEl.innerHTML = services.map(s => `<option>${s.nama}</option>`).join('');
  }

  const formOrder = document.getElementById("formOrder");
  if(formOrder) {
    formOrder.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button'); btn.textContent = "Mengirim...";
      await supabaseClient.from("orders").insert({
        user_id: currentUser.id, nama: document.getElementById("orderNama").value,
        telepon: document.getElementById("orderTelepon").value, alamat: document.getElementById("orderAlamat").value,
        layanan: document.getElementById("orderLayanan").value, catatan: document.getElementById("orderCatatan").value
      });
      alert("Pesanan Terkirim!"); e.target.reset(); btn.textContent = "Kirim Pesanan"; showTab('riwayat');
    });
  }

  supabaseClient.channel('public:chats').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' }, payload => {
    if(payload.new.sender_id === currentUser.id || payload.new.receiver_id === currentUser.id) loadChat();
  }).subscribe();

  loadRiwayat();
})();

function showTab(tab) {
  document.querySelectorAll('.main > div').forEach(d => d.classList.add('hidden'));
  const target = document.getElementById('tab-' + tab);
  if(target) target.classList.remove('hidden');
  if(tab === 'riwayat') loadRiwayat();
  if(tab === 'chat') loadChat();
}

async function loadRiwayat() {
  const { data } = await supabaseClient.from("orders").select("*").eq("user_id", currentUser.id).order("created_at", { ascending: false });
  const badge = { pending: "badge-pending", progress: "badge-progress", done: "badge-done", cancel: "badge-danger" };
  const label = { pending: "Menunggu", progress: "Diproses", done: "Selesai", cancel: "Dibatalkan" };
  
  const riwayatList = document.getElementById("riwayatList");
  if(!riwayatList) return;

  riwayatList.innerHTML = data.map(o => `
    <div style="border:1px solid var(--border); padding:20px; border-radius:12px; display:flex; justify-content:space-between; align-items:center; background:var(--bg-main); flex-wrap:wrap; gap:10px;">
      <div>
        <strong style="font-size:1.1rem;">${o.layanan}</strong><br>
        <small style="color:var(--text-muted);">${new Date(o.created_at).toLocaleString('id-ID')}</small><br>
        <small style="color:var(--text-main); font-weight:600;">Biaya: ${o.biaya ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(o.biaya) : '-'}</small>
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <span class="badge ${badge[o.status] || 'badge-pending'}">${label[o.status] || o.status}</span>
        ${o.status === 'done' ? `<button class="btn btn-outline" style="padding:6px 12px; font-size:0.85rem;" onclick="cetakNota('${o.id}')"><i class="fa-solid fa-print"></i> Nota</button>` : ''}
      </div>
    </div>
  `).join("");
}

async function loadChat() {
  const { data } = await supabaseClient.from('chats').select('*')
    .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`).order('created_at');
  
  const chatBox = document.getElementById('chatBox');
  if(!chatBox) return;

  chatBox.innerHTML = data.map(c => `
    <div class="chat-msg ${c.sender_id === currentUser.id ? 'chat-me' : 'chat-them'}">${c.pesan}</div>
  `).join('');
  chatBox.scrollTop = chatBox.scrollHeight;
}

document.getElementById('btnSendChat')?.addEventListener('click', async () => {
  const input = document.getElementById('chatInput'); if(!input.value) return;
  const { data: admins } = await supabaseClient.from('profiles').select('id').eq('role', 'admin').limit(1);
  const adminId = admins && admins[0]?.id;
  if(!adminId) return alert("Admin belum ada di sistem.");
  
  await supabaseClient.from('chats').insert({ sender_id: currentUser.id, receiver_id: adminId, pesan: input.value });
  input.value = ''; loadChat();
});

async function cetakNota(orderId) {
  const { data, error } = await supabaseClient.from('orders').select('*').eq('id', orderId).single();
  if (error || !data) return alert("Gagal mengambil data nota.");

  const tgl = new Date(data.created_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
  const biaya = data.biaya ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(data.biaya) : 'Rp 0';

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html><head><title>Nota - ${data.nama}</title>
    <style>
      body { font-family: 'Courier New', monospace; padding: 20px; color: #000; background: #fff; }
      .nota { max-width: 400px; margin: 0 auto; border: 2px dashed #000; padding: 20px; }
      .header { text-align: center; margin-bottom: 20px; }
      .line { border-top: 1px dashed #000; margin: 10px 0; }
      .row { display: flex; justify-content: space-between; margin: 5px 0; font-size: 14px; }
      .total { font-size: 18px; font-weight: bold; margin-top: 15px; }
      .footer { text-align: center; font-size: 12px; margin-top: 20px; }
      @media print { body { padding: 0; } .no-print { display: none; } }
    </style>
    </head>
    <body>
      <div class="nota">
        <div class="header">
          <h2 style="margin:0;">MALIK SERVICE</h2>
          <p style="margin:5px 0; font-size:12px;">Semarang, Jawa Tengah<br>Telp: 0857-1308-7659</p>
        </div>
        <div class="line"></div>
        <div class="row"><span>No. Nota</span><span>#${data.id.split('-')[0].toUpperCase()}</span></div>
        <div class="row"><span>Tanggal</span><span>${tgl}</span></div>
        <div class="row"><span>Pelanggan</span><span>${data.nama}</span></div>
        <div class="row"><span>Layanan</span><span>${data.layanan}</span></div>
        <div class="row"><span>Catatan</span><span>${data.catatan || '-'}</span></div>
        <div class="line"></div>
        <div class="row total"><span>TOTAL</span><span>${biaya}</span></div>
        <div class="line"></div>
        <div class="footer">
          <p>Status: <strong>${data.status.toUpperCase()}</strong></p>
          <p>Terima kasih telah menggunakan layanan kami.</p>
        </div>
      </div>
      <div style="text-align:center; margin-top:20px;" class="no-print">
        <button onclick="window.print()" style="padding:10px 20px; cursor:pointer; background:#4f46e5; color:#fff; border:none; border-radius:8px;">Print / Save as PDF</button>
      </div>
    </body></html>
  `);
  printWindow.document.close();
}