let currentUser, activeChatUser;

(async () => {
  const session = await requireAdmin(); 
  if (!session) return;
  currentUser = session.user;

  const { data: set } = await supabaseClient.from('settings').select('*').eq('id', 1).single();
  if (set && document.getElementById('logoUrl')) {
    document.getElementById('logoUrl').value = set.logo_url || '';
  }

  loadOrders(); 
  loadLayanan();

  supabaseClient.channel('admin:chats')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' }, payload => {
      if (payload.new.receiver_id === currentUser.id) { 
        loadUserList(); 
        if (activeChatUser === payload.new.sender_id) {
          loadAdminChat(payload.new.sender_id); 
        }
      }
    })
    .subscribe();
})();

function showTab(tab) {
  document.querySelectorAll('.main > div').forEach(d => d.classList.add('hidden'));
  const target = document.getElementById('tab-' + tab);
  if(target) target.classList.remove('hidden');
  if (tab === 'chat') loadUserList();
}

async function loadOrders() {
  const searchTerm = document.getElementById('searchOrder')?.value.toLowerCase() || "";
  
  const { data, error } = await supabaseClient
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return console.error("Gagal load orders:", error);

  let totalPendapatan = 0;
  let countPending = 0;
  let countProgress = 0;

  data.forEach(o => {
    if (o.status === 'done') totalPendapatan += Number(o.biaya || 0);
    if (o.status === 'pending') countPending++;
    if (o.status === 'progress') countProgress++;
  });

  const elPendapatan = document.getElementById('statPendapatan');
  if(elPendapatan) {
    elPendapatan.textContent = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(totalPendapatan);
    document.getElementById('statTotal').textContent = data.length;
    document.getElementById('statPending').textContent = countPending;
    document.getElementById('statProgress').textContent = countProgress;
  }

  const filteredData = data.filter(o => 
    (o.nama || "").toLowerCase().includes(searchTerm) || 
    (o.telepon || "").toLowerCase().includes(searchTerm)
  );

  const ordersList = document.getElementById("ordersList");
  if (!ordersList) return;

  if (filteredData.length === 0) {
    ordersList.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Pesanan tidak ditemukan.</td></tr>`;
    return;
  }

  ordersList.innerHTML = filteredData.map(o => `
    <tr>
      <td>
        <strong>${o.nama || '-'}</strong><br>
        <small style="color:var(--text-muted);">${o.telepon || '-'}</small><br>
        <a href="https://wa.me/${o.telepon?.replace(/^0/, '62')}" target="_blank" style="font-size:0.75rem; color:#10b981; font-weight:600;"><i class="fa-brands fa-whatsapp"></i> Chat WA</a>
      </td>
      <td>${o.layanan || '-'}</td>
      <td>
        <select onchange="updateStatus('${o.id}', this.value)" style="padding:8px; border-radius:8px; border:1px solid var(--border); font-weight:600;">
          <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>Menunggu</option>
          <option value="progress" ${o.status === 'progress' ? 'selected' : ''}>Diproses</option>
          <option value="done" ${o.status === 'done' ? 'selected' : ''}>Selesai</option>
          <option value="cancel" ${o.status === 'cancel' ? 'selected' : ''}>Batal</option>
        </select>
      </td>
      <td>
        <input type="number" value="${o.biaya || 0}" onchange="updateBiaya('${o.id}', this.value)" style="width:100px; padding:8px; border-radius:8px; border:1px solid var(--border);" placeholder="0">
      </td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-outline" style="padding:8px; font-size:0.85rem;" onclick="cetakNota('${o.id}')"><i class="fa-solid fa-print"></i></button>
          <button class="btn btn-danger" style="padding:8px; font-size:0.85rem;" onclick="hapusPesanan('${o.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
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
  loadOrders(); 
}

async function hapusPesanan(id) {
  if(confirm("Hapus pesanan ini secara permanen?")) {
    await supabaseClient.from("orders").delete().eq("id", id);
    loadOrders();
  }
}

async function loadLayanan() {
  const { data, error } = await supabaseClient.from("services").select("*");
  if (error) return console.error(error);

  const list = document.getElementById("layananList");
  if (!list) return;

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

async function loadUserList() {
  const { data, error } = await supabaseClient
    .from('chats')
    .select('sender_id, profiles(nama)')
    .eq('receiver_id', currentUser.id);

  const userListEl = document.getElementById('userList');
  if(!userListEl) return;

  if (error) {
    userListEl.innerHTML = `<p style="color:var(--danger); font-size:0.85rem;">Gagal memuat chat. Cek RLS.</p>`;
    return;
  }

  if (!data || data.length === 0) {
    userListEl.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem;">Belum ada chat masuk.</p>`;
    return;
  }

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
  if(!chatBox) return;

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

document.getElementById("btnSaveLogo")?.addEventListener("click", async () => {
  await supabaseClient.from("settings").update({ 
    logo_url: document.getElementById("logoUrl").value 
  }).eq("id", 1);
  
  alert("Logo Disimpan!"); 
  loadLogo();
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