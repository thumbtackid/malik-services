let currentUser;
(async () => {
  const session = await requireAuth(); if(!session) return;
  currentUser = session.user;
  document.getElementById("userName").textContent = currentUser.email;
  document.getElementById("orderNama").value = currentUser.user_metadata?.nama || "";

  const { data: services } = await supabaseClient.from('services').select('*');
  document.getElementById('orderLayanan').innerHTML = services.map(s => `<option>${s.nama}</option>`).join('');

  document.getElementById("formOrder").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.textContent = "Mengirim...";
    await supabaseClient.from("orders").insert({
      user_id: currentUser.id, nama: document.getElementById("orderNama").value,
      telepon: document.getElementById("orderTelepon").value, alamat: document.getElementById("orderAlamat").value,
      layanan: document.getElementById("orderLayanan").value, catatan: document.getElementById("orderCatatan").value
    });
    alert("Pesanan Terkirim!"); e.target.reset(); btn.textContent = "Kirim Pesanan"; showTab('riwayat');
  });

  supabaseClient.channel('public:chats').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' }, payload => {
    if(payload.new.sender_id === currentUser.id || payload.new.receiver_id === currentUser.id) loadChat();
  }).subscribe();

  loadRiwayat();
})();

function showTab(tab) {
  document.querySelectorAll('.main > div').forEach(d => d.classList.add('hidden'));
  document.getElementById('tab-' + tab).classList.remove('hidden');
  if(tab === 'riwayat') loadRiwayat();
  if(tab === 'chat') loadChat();
}

async function loadRiwayat() {
  const { data } = await supabaseClient.from("orders").select("*").eq("user_id", currentUser.id).order("created_at", { ascending: false });
  const badge = { pending: "badge-pending", progress: "badge-progress", done: "badge-done" };
  const label = { pending: "Menunggu", progress: "Diproses", done: "Selesai" };
  
  document.getElementById("riwayatList").innerHTML = data.map(o => `
    <div style="border:1px solid var(--border); padding:20px; border-radius:12px; display:flex; justify-content:space-between; align-items:center; background:var(--bg-main);">
      <div><strong style="font-size:1.1rem;">${o.layanan}</strong><br><small style="color:var(--text-muted);">${new Date(o.created_at).toLocaleString('id-ID')}</small></div>
      <div style="display:flex; align-items:center; gap:12px;">
        <span class="badge ${badge[o.status]}">${label[o.status]}</span>
        ${o.status === 'done' ? `<button class="btn btn-outline" style="padding:6px 12px; font-size:0.85rem;" onclick="cetakNota('${o.id}')"><i class="fa-solid fa-print"></i> Nota</button>` : ''}
      </div>
    </div>
  `).join("");
}

async function loadChat() {
  const { data } = await supabaseClient.from('chats').select('*')
    .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`).order('created_at');
  document.getElementById('chatBox').innerHTML = data.map(c => `
    <div class="chat-msg ${c.sender_id === currentUser.id ? 'chat-me' : 'chat-them'}">${c.pesan}</div>
  `).join('');
  document.getElementById('chatBox').scrollTop = document.getElementById('chatBox').scrollHeight;
}

document.getElementById('btnSendChat')?.addEventListener('click', async () => {
  const input = document.getElementById('chatInput'); if(!input.value) return;
  const { data: admins } = await supabaseClient.from('profiles').select('id').eq('role', 'admin').limit(1);
  const adminId = admins[0]?.id;
  if(!adminId) return alert("Admin belum ada di sistem.");
  
  await supabaseClient.from('chats').insert({ sender_id: currentUser.id, receiver_id: adminId, pesan: input.value });
  input.value = ''; loadChat();
});

async function cetakNota(orderId) {
  const { data } = await supabaseClient.from('orders').select('*').eq('id', orderId).single();
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html><head><title>Nota - ${data.nama}</title><link rel="stylesheet" href="./css/style.css"></head>
    <body style="background:#fff; padding:40px;">
      <div class="nota">
        <h2 style="text-align:center;">MALIK SERVICE</h2>
        <p style="text-align:center; font-size:12px;">Semarang, Jawa Tengah</p><hr>
        <p>Tgl: ${new Date(data.created_at).toLocaleDateString('id-ID')}</p>
        <p>Nama: ${data.nama}</p>
        <p>Layanan: ${data.layanan}</p>
        <p>Keluhan: ${data.catatan || '-'}</p><hr>
        <h3 style="text-align:center;">LUNAS</h3>
      </div>
      <div style="text-align:center; margin-top:20px;" class="no-print">
        <button onclick="window.print()" style="padding:10px 20px; cursor:pointer;">Print / Save as PDF</button>
      </div>
    </body></html>
  `);
  printWindow.document.close();
}
