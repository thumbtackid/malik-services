let currentUser, activeChatUser;

(async () => {
  // Pastikan user login dan berstatus admin
  const session = await requireAdmin(); 
  if (!session) return;
  currentUser = session.user;

  // Load pengaturan (logo)
  const { data: set } = await supabaseClient.from('settings').select('*').eq('id', 1).single();
  if (set && document.getElementById('logoUrl')) {
    document.getElementById('logoUrl').value = set.logo_url || '';
  }

  // Load data awal
  loadOrders(); 
  loadLayanan();

  // Realtime listener untuk chat baru
  supabaseClient.channel('admin:chats')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' }, payload => {
      // Jika pesan masuk ke admin ini
      if (payload.new.receiver_id === currentUser.id) { 
        loadUserList(); 
        if (activeChatUser === payload.new.sender_id) {
          loadAdminChat(payload.new.sender_id); 
        }
      }
    })
    .subscribe();
})();

// ==========================================
// NAVIGASI TAB
// ==========================================
function showTab(tab) {
  document.querySelectorAll('.main > div').forEach(d => d.classList.add('hidden'));
  document.getElementById('tab-' + tab).classList.remove('hidden');
  if (tab === 'chat') loadUserList();
}

// ==========================================
// MANAJEMEN PESANAN (ORDERS)
// ==========================================
async function loadOrders() {
  const { data, error } = await supabaseClient
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Gagal load orders:", error);
    return;
  }

  const badge = { pending: "badge-pending", progress: "badge-progress", done: "badge-done" };
  const ordersList = document.getElementById("ordersList");
  
  if (!data || data.length === 0) {
    ordersList.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Belum ada pesanan.</td></tr>`;
    return;
  }

  ordersList.innerHTML = data.map(o => `
    <tr>
      <td><strong>${o.nama || '-'}</strong><br><small style="color:var(--text-muted);">${o.telepon || '-'}</small></td>
      <td>${o.layanan || '-'}</td>
      <td>
        <select onchange="updateStatus('${o.id}', this.value)" style="padding:8px; border-radius:8px; border:1px solid var(--border); font-weight:600;">
          <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>Menunggu</option>
          <option value="progress" ${o.status === 'progress' ? 'selected' : ''}>Diproses</option>
          <option value="done" ${o.status === 'done' ? 'selected' : ''}>Selesai</option>
        </select>
      </td>
      <td>
        <input type="number" value="${o.biaya || 0}" onchange="updateBiaya('${o.id}', this.value)" style="width:100px; padding:8px; border-radius:8px; border:1px solid var(--border);" placeholder="0">
      </td>
      <td>
        <button class="btn btn-outline" style="padding:8px 12px; font-size:0.85rem;" onclick="cetakNota('${o.id}')">
          <i class="fa-solid fa-print"></i> Nota
        </button>
      </td>
    </tr>
  `).join("");
}

async function updateStatus(id, status) { 
  await supabaseClient.from("orders").update({ status }).eq("id", id); 
  loadOrders(); 
}

async function updateBiaya(id, biaya) {
  await supabaseClient.from("orders").update({ biaya: Number(biaya) }).eq("id", id);
  // Tidak perlu reload tabel agar input tidak kehilangan fokus
}

// ==========================================
// MANAJEMEN LAYANAN (SERVICES)
// ==========================================
async function loadLayanan() {
  const { data, error } = await supabaseClient.from("services").select("*");
  if (error) return console.error(error);

  const list = document.getElementById("layananList");
  if (!data || data.length === 0) {
    list.innerHTML = `<p style="color:var(--text-muted);">Belum ada layanan.</p>`;
    return;
  }

  list.innerHTML = data.map(s => `
    <div style="display:flex; justify-content:space-between; align-items:center; border:1px solid var(--border); padding:16px; border-radius:12px; background:var(--bg-main);">
      <span style="font-weight:600;">${s.nama}</span>
      <button class="btn btn-danger" style="padding:6px 12px; font-size:0.85rem;" onclick="hapusLayanan('${s.id}')">Hapus</button>
    </div>
  `).join("");
}

document.getElementById("formLayanan")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("newLayanan");
  if(!input.value.trim()) return;
  
  await supabaseClient.from("services").insert({ nama: input.value });
  input.value = ""; 
  loadLayanan();
});

async function hapusLayanan(id) { 
  if(confirm("Hapus layanan ini?")) { 
    await supabaseClient.from("services").delete().eq("id", id); 
    loadLayanan(); 
  } 
}

// ==========================================
// FITUR CHAT ADMIN
// ==========================================
async function loadUserList() {
  // Ambil data chat di mana admin sebagai penerima
  const { data, error } = await supabaseClient
    .from('chats')
    .select('sender_id, profiles(nama)')
    .eq('receiver_id', currentUser.id);

  const userListEl = document.getElementById('userList');

  // Handling jika terjadi error (misal RLS block)
  if (error) {
    console.error("Gagal memuat user list:", error.message);
    userListEl.innerHTML = `<p style="color:var(--danger); font-size:0.85rem;">Gagal memuat chat. Cek RLS.</p>`;
    return;
  }

  // Handling jika data kosong
  if (!data || data.length === 0) {
    userListEl.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem;">Belum ada chat masuk.</p>`;
    return;
  }

  // Filter duplikat user
  const uniqueUsers = [...new Map(data.map(item => [item.sender_id, item])).values()];
  
  userListEl.innerHTML = uniqueUsers.map(u => `
    <div style="padding:16px; border-bottom:1px solid var(--border); cursor:pointer; font-weight:600; border-radius:8px;" onclick="loadAdminChat('${u.sender_id}')">
      ${u.profiles?.nama || 'User Tanpa Nama'}
    </div>
  `).join('');
}

async function loadAdminChat(userId) {
  activeChatUser = userId;
  const { data, error } = await supabaseClient.from('chats').select('*')
    .or(`and(sender_id.eq.${userId},receiver_id.eq.${currentUser.id}),and(sender_id.eq.${currentUser.id},receiver_id.eq.${userId})`)
    .order('created_at');

  if (error || !data) return;

  const chatBox = document.getElementById('adminChatBox');
  chatBox.innerHTML = data.map(c => `
    <div class="chat-msg ${c.sender_id === currentUser.id ? 'chat-me' : 'chat-them'}">${c.pesan}</div>
  `).join('');
  
  chatBox.scrollTop = chatBox.scrollHeight;
}

document.getElementById('btnAdminSend')?.addEventListener('click', async () => {
  const input = document.getElementById('adminChatInput'); 
  if(!input.value.trim() || !activeChatUser) return;

  await supabaseClient.from('chats').insert({ 
    sender_id: currentUser.id, 
    receiver_id: activeChatUser, 
    pesan: input.value 
  });
  
  input.value = ''; 
  loadAdminChat(activeChatUser);
});

// ==========================================
// PENGATURAN
// ==========================================
document.getElementById("btnSaveLogo")?.addEventListener("click", async () => {
  await supabaseClient.from("settings").update({ 
    logo_url: document.getElementById("logoUrl").value 
  }).eq("id", 1);
  
  alert("Logo Disimpan!"); 
  loadLogo();
});

// ==========================================
// FITUR CETAK NOTA
// ==========================================
async function cetakNota(orderId) {
  const { data, error } = await supabaseClient.from('orders').select('*').eq('id', orderId).single();
  
  if (error || !data) {
    alert("Gagal mengambil data nota.");
    return;
  }

  const tgl = new Date(data.created_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
  const biaya = data.biaya ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(data.biaya) : 'Rp 0';

  // Buka jendela baru untuk print
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
      @media print {
        body { padding: 0; }
        .no-print { display: none; }
      }
    </style>
    </head>
    <body>
      <div class="nota">
        <div class="header">
          <h2 style="margin:0;">MALIK SERVICE</h2>
          <p style="margin:5px 0; font-size:12px;">Semarang, Jawa Tengah<br>Telp: 0812-3456-7890</p>
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
        <button onclick="window.print()" style="padding:10px 20px; cursor:pointer; background:#4f46e5; color:#fff; border:none; border-radius:8px; font-weight:bold;">Cetak / Simpan PDF</button>
      </div>
    </body></html>
  `);
  printWindow.document.close();
}
