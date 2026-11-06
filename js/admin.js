let currentUser, activeChatUser;

(async () => {
  const session = await requireAdmin(); if(!session) return;
  currentUser = session.user;

  const { data: set } = await supabaseClient.from('settings').select('*').eq('id', 1).single();
  if(set) document.getElementById('logoUrl').value = set.logo_url;

  loadOrders(); loadLayanan();

  supabaseClient.channel('admin:chats').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' }, payload => {
    if(payload.new.receiver_id === currentUser.id) { loadUserList(); if(activeChatUser === payload.new.sender_id) loadAdminChat(payload.new.sender_id); }
  }).subscribe();
})();

function showTab(tab) {
  document.querySelectorAll('.main > div').forEach(d => d.classList.add('hidden'));
  document.getElementById('tab-' + tab).classList.remove('hidden');
  if(tab === 'chat') loadUserList();
}

async function loadOrders() {
  const { data } = await supabaseClient.from("orders").select("*").order("created_at", { ascending: false });
  const badge = { pending: "badge-pending", progress: "badge-progress", done: "badge-done" };
  
  document.getElementById("ordersList").innerHTML = data.map(o => `
    <tr>
      <td><strong>${o.nama}</strong><br><small style="color:var(--text-muted);">${o.telepon}</small></td>
      <td>${o.layanan}</td>
      <td>
        <select onchange="updateStatus('${o.id}', this.value)" style="padding:8px; border-radius:8px; border:1px solid var(--border); font-weight:600;">
          <option value="pending" ${o.status==='pending'?'selected':''}>Menunggu</option>
          <option value="progress" ${o.status==='progress'?'selected':''}>Diproses</option>
          <option value="done" ${o.status==='done'?'selected':''}>Selesai</option>
        </select>
      </td>
      <td>
        <button class="btn btn-outline" style="padding:8px 12px; font-size:0.85rem;" onclick="cetakNota('${o.id}')"><i class="fa-solid fa-print"></i> Nota</button>
      </td>
    </tr>
  `).join("");
}
async function updateStatus(id, status) { await supabaseClient.from("orders").update({status}).eq("id", id); loadOrders(); }

async function loadLayanan() {
  const { data } = await supabaseClient.from("services").select("*");
  document.getElementById("layananList").innerHTML = data.map(s => `
    <div style="display:flex; justify-content:space-between; align-items:center; border:1px solid var(--border); padding:16px; border-radius:12px; background:var(--bg-main);">
      <span style="font-weight:600;">${s.nama}</span>
      <button class="btn btn-danger" style="padding:6px 12px; font-size:0.85rem;" onclick="hapusLayanan('${s.id}')">Hapus</button>
    </div>
  `).join("");
}
document.getElementById("formLayanan")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  await supabaseClient.from("services").insert({ nama: document.getElementById("newLayanan").value });
  document.getElementById("newLayanan").value = ""; loadLayanan();
});
async function hapusLayanan(id) { if(confirm("Hapus layanan ini?")) { await supabaseClient.from("services").delete().eq("id", id); loadLayanan(); } }

async function loadUserList() {
  const { data } = await supabaseClient.from('chats').select('sender_id, profiles(nama)').eq('receiver_id', currentUser.id);
  const uniqueUsers = [...new Map(data.map(item => [item.sender_id, item])).values()];
  document.getElementById('userList').innerHTML = uniqueUsers.map(u => `
    <div style="padding:16px; border-bottom:1px solid var(--border); cursor:pointer; font-weight:600; border-radius:8px;" onclick="loadAdminChat('${u.sender_id}')">
      ${u.profiles?.nama || 'User'}
    </div>
  `).join('');
}
async function loadAdminChat(userId) {
  activeChatUser = userId;
  const { data } = await supabaseClient.from('chats').select('*')
    .or(`and(sender_id.eq.${userId},receiver_id.eq.${currentUser.id}),and(sender_id.eq.${currentUser.id},receiver_id.eq.${userId})`).order('created_at');
  document.getElementById('adminChatBox').innerHTML = data.map(c => `
    <div class="chat-msg ${c.sender_id === currentUser.id ? 'chat-me' : 'chat-them'}">${c.pesan}</div>
  `).join('');
  document.getElementById('adminChatBox').scrollTop = document.getElementById('adminChatBox').scrollHeight;
}
document.getElementById('btnAdminSend')?.addEventListener('click', async () => {
  const input = document.getElementById('adminChatInput'); if(!input.value || !activeChatUser) return;
  await supabaseClient.from('chats').insert({ sender_id: currentUser.id, receiver_id: activeChatUser, pesan: input.value });
  input.value = ''; loadAdminChat(activeChatUser);
});

document.getElementById("btnSaveLogo")?.addEventListener("click", async () => {
  await supabaseClient.from("settings").update({ logo_url: document.getElementById("logoUrl").value }).eq("id", 1);
  alert("Logo Disimpan!"); loadLogo();
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
