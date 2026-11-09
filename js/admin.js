let currentUser, activeChatUser;
let kasirCart = [];
let revenueChartInstance = null;
let dataLaporanGlobal = []; // Menyimpan data untuk di-export ke CSV

(async () => {
  const session = await requireAdmin(); if (!session) return;
  currentUser = session.user;

  const { data: set } = await supabaseClient.from('settings').select('*').eq('id', 1).single();
  if (set) {
    if (document.getElementById('logoUrl')) document.getElementById('logoUrl').value = set.logo_url || '';
    if (document.getElementById('qrisUrl')) document.getElementById('qrisUrl').value = set.qris_image_url || '';
    if (document.getElementById('bankInfo')) document.getElementById('bankInfo').value = set.bank_info || '';
    if (document.getElementById('adminWa')) document.getElementById('adminWa').value = set.admin_wa_number || '';
  }

  loadOrders(); 
  loadLayanan(); 
  loadProduk(); 
  loadKasirProducts();
  loadNotifications(); 

  supabaseClient.channel('admin:realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' }, payload => {
      if (payload.new.receiver_id === currentUser.id) { 
        loadUserList(); 
        if (activeChatUser === payload.new.sender_id) loadAdminChat(payload.new.sender_id); 
      }
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, payload => {
      loadNotifications(); 
    })
    .subscribe();
})();

function showTab(tab) {
  document.querySelectorAll('.main > div').forEach(d => d.classList.add('hidden'));
  document.getElementById('tab-' + tab).classList.remove('hidden');
  if (tab === 'chat') loadUserList();
  if (tab === 'kasir') loadKasirProducts();
  if (tab === 'verifikasi') loadVerifikasiList();
  if (tab === 'notifikasi') loadNotifications();
  if (tab === 'laporan') loadLaporan(); // <--- ROUTING BARU
}

async function loadOrders() {
  const searchTerm = document.getElementById('searchOrder')?.value.toLowerCase() || "";
  const { data, error } = await supabaseClient.from("orders").select("*, order_items(*)").order("created_at", { ascending: false });
  if (error) return console.error(error);

  let totalPendapatan = 0, countPending = 0, countVerif = 0;
  let chartLabels = [];
  let chartData = {};

  data.forEach(o => {
    const nominal = Number(o.total_amount || o.biaya || 0);
    if (o.payment_status === 'paid') totalPendapatan += nominal;
    if (o.status === 'pending') countPending++;
    if (o.payment_status === 'waiting_verification') countVerif++;

    if (o.payment_status === 'paid') {
      const tgl = o.created_at.split('T')[0];
      chartData[tgl] = (chartData[tgl] || 0) + nominal;
    }
  });

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    chartLabels.push(d.toISOString().split('T')[0]);
  }

  const chartValues = chartLabels.map(tgl => chartData[tgl] || 0);

  if(document.getElementById('statPendapatan')) {
    document.getElementById('statPendapatan').textContent = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(totalPendapatan);
    document.getElementById('statTotal').textContent = data.length;
    document.getElementById('statPending').textContent = countPending;
    document.getElementById('statVerif').textContent = countVerif;
    
    const badge = document.getElementById('badgeVerif');
    if (countVerif > 0) { badge.textContent = countVerif; badge.classList.remove('hidden'); } 
    else { badge.classList.add('hidden'); }
  }

  if (document.getElementById('revenueChart')) {
    if (revenueChartInstance) revenueChartInstance.destroy();
    const ctx = document.getElementById('revenueChart').getContext('2d');
    revenueChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartLabels.map(t => t.split('-').reverse().join('/')),
        datasets: [{
          label: 'Pendapatan (Rp)',
          data: chartValues,
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79, 70, 229, 0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }

  const filteredData = data.filter(o => (o.nama || "").toLowerCase().includes(searchTerm) || (o.telepon || "").toLowerCase().includes(searchTerm));
  const ordersList = document.getElementById("ordersList");
  if (!ordersList) return;
  
  if (filteredData.length === 0) {
    ordersList.innerHTML = `<tr><td colspan="6" style="text-align:center;">Pesanan tidak ditemukan.</td></tr>`;
    return;
  }

  const payLabel = { unpaid: 'Belum Bayar', waiting_verification: 'Menunggu Verifikasi', paid: 'Lunas', rejected: 'Ditolak' };
  const payBadge = { unpaid: 'badge-danger', waiting_verification: 'badge-pending', paid: 'badge-done', rejected: 'badge-danger' };

  ordersList.innerHTML = filteredData.map(o => {
    let itemsHtml = '';
    if (o.order_items && o.order_items.length > 0) {
      itemsHtml = `<div style="margin-top:4px; padding:4px 8px; background:#f1f5f9; border-radius:6px; font-size:0.85rem;">
        <strong>Barang:</strong> ${o.order_items.map(i => `${escapeHTML(i.nama_produk)} (x${i.qty})`).join(', ')}
      </div>`;
    }

    return `
      <tr>
        <td>
          <strong>${escapeHTML(o.nama) || '-'}</strong><br>
          <small style="color:var(--text-muted);">${escapeHTML(o.telepon) || '-'}</small><br>
          <small style="color:var(--primary); font-weight:600;">Keluhan: ${escapeHTML(o.catatan) || '-'}</small><br>
          <small style="color:var(--text-main);">Diagnosa: ${escapeHTML(o.kerusakan) || '-'}</small><br>
          <small style="color:var(--text-main);">Part: ${escapeHTML(o.sparepart) || '-'}</small>
          ${itemsHtml}
        </td>
        <td>${escapeHTML(o.layanan) || '-'}</td>
        <td>
          <select onchange="updateStatus('${o.id}', this.value)" style="padding:8px; border-radius:8px; border:1px solid var(--border); font-weight:600;">
            <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>Menunggu</option>
            <option value="progress" ${o.status === 'progress' ? 'selected' : ''}>Diproses</option>
            <option value="done" ${o.status === 'done' ? 'selected' : ''}>Selesai</option>
            <option value="cancel" ${o.status === 'cancel' ? 'selected' : ''}>Batal</option>
          </select>
        </td>
        <td><span class="badge ${payBadge[o.payment_status] || 'badge-danger'}">${payLabel[o.payment_status] || 'Belum Bayar'}</span></td>
        <td>
          <input type="number" value="${o.total_amount || o.biaya || 0}" onchange="updateBiaya('${o.id}', this.value)" style="width:100px; padding:8px; border-radius:8px; border:1px solid var(--border);" placeholder="0">
        </td>
        <td>
          <div style="display:flex; flex-direction:column; gap:4px;">
            <button class="btn btn-outline" style="padding:6px; font-size:0.75rem;" onclick="editDiagnosa('${o.id}')"><i class="fa-solid fa-stethoscope"></i> Diagnosa</button>
            <button class="btn btn-outline" style="padding:6px; font-size:0.75rem;" onclick="cetakNota('${o.id}')"><i class="fa-solid fa-print"></i> Nota</button>
            <button class="btn btn-danger" style="padding:6px; font-size:0.75rem;" onclick="hapusPesanan('${o.id}')"><i class="fa-solid fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

async function loadVerifikasiList() {
  const { data, error } = await supabaseClient.from('orders').select('*').eq('payment_status', 'waiting_verification').order('created_at', { ascending: true });
  const list = document.getElementById('verifList');
  if (!list) return;

  if (!data || data.length === 0) {
    list.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:40px;">Tidak ada pembayaran yang perlu diverifikasi.</p>';
    return;
  }

  list.innerHTML = data.map(o => `
    <div style="border:1px solid var(--border); border-radius:12px; padding:20px; background:white; display:flex; flex-wrap:wrap; gap:20px;">
      <div style="flex:1; min-width:250px;">
        <h4 style="margin-bottom:8px;">Order #${o.id.split('-')[0].toUpperCase()}</h4>
        <p style="font-size:0.9rem; margin-bottom:4px;"><strong>Pelanggan:</strong> ${escapeHTML(o.nama)} (${escapeHTML(o.telepon)})</p>
        <p style="font-size:0.9rem; margin-bottom:4px;"><strong>Layanan:</strong> ${escapeHTML(o.layanan)}</p>
        <p style="font-size:0.9rem; margin-bottom:4px;"><strong>Total Tagihan:</strong> Rp ${(o.total_amount || o.biaya || 0).toLocaleString('id-ID')}</p>
        <p style="font-size:0.9rem; margin-bottom:12px; color:var(--warning);"><strong>Status:</strong> Menunggu Verifikasi Bukti</p>
        <div style="display:flex; gap:8px; margin-top:16px;">
          <button class="btn btn-primary" style="padding:8px 16px; font-size:0.9rem;" onclick="verifikasiPembayaran('${o.id}', true)"><i class="fa-solid fa-check"></i> Terima (Lunas)</button>
          <button class="btn btn-danger" style="padding:8px 16px; font-size:0.9rem;" onclick="verifikasiPembayaran('${o.id}', false)"><i class="fa-solid fa-xmark"></i> Tolak</button>
        </div>
      </div>
      <div style="width:300px;">
        <p style="font-size:0.85rem; font-weight:600; margin-bottom:6px;">Bukti Transfer:</p>
        ${o.payment_proof_url ? `<a href="${o.payment_proof_url}" target="_blank"><img src="${o.payment_proof_url}" class="pay-proof-img"></a>` : '<p style="color:var(--danger);">User tidak upload bukti.</p>'}
      </div>
    </div>
  `).join('');
}

async function verifikasiPembayaran(orderId, isAccept) {
  if (!isAccept && !confirm("Tolak pembayaran ini? User harus upload ulang.")) return;

  const newStatus = isAccept ? 'paid' : 'rejected';
  const updateData = { payment_status: newStatus, verified_by: currentUser.id };
  if (isAccept) updateData.paid_at = new Date().toISOString();

  const { error } = await supabaseClient.from('orders').update(updateData).eq('id', orderId);
  if (error) return alert("Gagal update: " + error.message);

  const { data: order, error: orderErr } = await supabaseClient
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (orderErr || !order) {
    console.error("Gagal mengambil data order:", orderErr);
    alert("Pembayaran berhasil diupdate, tapi gagal mengambil detail user.");
    loadVerifikasiList();
    loadOrders();
    return;
  }
  
  if (isAccept && order.payment_proof_url) {
    try {
      const urlParts = order.payment_proof_url.split('/payment-proofs/');
      if (urlParts.length >= 2) {
        const filePath = urlParts[1];
        const { error: deleteErr } = await supabaseClient.storage.from('payment-proofs').remove([filePath]);
        
        if (!deleteErr) {
          await supabaseClient.from('orders').update({ payment_proof_url: null }).eq('id', orderId);
          console.log("✅ Gambar bukti berhasil dihapus otomatis.");
        } else {
          console.error("Gagal hapus gambar:", deleteErr);
        }
      }
    } catch (e) {
      console.error("Error saat auto-delete gambar:", e);
    }
  }

  if (order.user_id) {
    const msg = isAccept 
      ? "✅ Pembayaran Anda telah diverifikasi. Pesanan sedang diproses."
      : "❌ Bukti pembayaran ditolak. Silakan upload ulang bukti yang benar.";
    await supabaseClient.from('chats').insert({ sender_id: currentUser.id, receiver_id: order.user_id, pesan: msg });
  }

  if (order.telepon) {
    const waNumber = order.telepon.replace(/[^0-9]/g, '').replace(/^0/, '62');
    const waPesan = isAccept 
      ? `Halo ${order.nama}, pembayaran Anda untuk order #${orderId.split('-')[0]} telah diverifikasi. Terima kasih!`
      : `Halo ${order.nama}, bukti pembayaran untuk order #${orderId.split('-')[0]} ditolak. Silakan upload ulang.`;
    kirimWA(waNumber, waPesan);
  }

  alert(isAccept ? "Pembayaran Diterima & Gambar Bukti Dihapus!" : "Pembayaran Ditolak!");
  loadVerifikasiList();
  loadOrders();
}

async function kirimWA(target, message) {
  try {
    const { data, error } = await supabaseClient.functions.invoke('send-wa', {
      body: { target, message }
    });
    if (error) throw error;
    console.log('WA Terkirim:', data);
  } catch (e) {
    console.error("Gagal kirim WA via Edge Function:", e.message);
  }
}

async function loadNotifications() {
  const { data } = await supabaseClient.from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
  const list = document.getElementById('notifList');
  const badge = document.getElementById('badgeNotif');
  if (!list) return;

  const unreadCount = data.filter(n => !n.is_read).length;
  if (badge) {
    if (unreadCount > 0) { badge.textContent = unreadCount; badge.classList.remove('hidden'); }
    else { badge.classList.add('hidden'); }
  }

  if (!data || data.length === 0) {
    list.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:40px;">Belum ada notifikasi.</p>';
    return;
  }

  list.innerHTML = data.map(n => `
    <div class="notif-item ${n.is_read ? '' : 'unread'}">
      <div class="notif-icon" style="background:${n.type === 'new_order' ? '#e0e7ff' : '#dcfce7'}; color:${n.type === 'new_order' ? '#4f46e5' : '#15803d'};">
        <i class="fa-solid ${n.type === 'new_order' ? 'fa-box' : 'fa-money-bill'}"></i>
      </div>
      <div style="flex:1;">
        <strong style="font-size:0.95rem;">${escapeHTML(n.title)}</strong>
        <p style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">${escapeHTML(n.message)}</p>
        <small style="color:var(--text-muted); font-size:0.75rem;">${new Date(n.created_at).toLocaleString('id-ID')}</small>
      </div>
    </div>
  `).join('');
}

async function markAllRead() {
  await supabaseClient.from('notifications').update({ is_read: true }).eq('is_read', false);
  loadNotifications();
}

async function loadKasirProducts() {
  let { data, error } = await supabaseClient.from('products').select('*').order('nama');
  if (error || !data || data.length === 0) {
    const res = await supabaseClient.from('produk').select('*').order('nama');
    data = res.data;
  }

  const list = document.getElementById('kasirProductList');
  if (!list) return;
  if (!data || data.length === 0) { list.innerHTML = '<p>Belum ada produk.</p>'; return; }
  
  list.innerHTML = data.map(p => `
    <div style="display:flex; justify-content:space-between; align-items:center; border:1px solid var(--border); padding:12px; border-radius:8px; background:white;">
      <div>
        <strong>${escapeHTML(p.nama)}</strong><br>
        <small>Rp ${(p.harga || 0).toLocaleString('id-ID')} | Stok: ${p.stok || 0}</small>
      </div>
      <button class="btn btn-primary" style="padding:8px 12px;" onclick="addToCart('${p.id}', '${escapeHTML(p.nama).replace(/'/g, "\\'")}', ${p.harga || 0}, ${p.stok || 0})"><i class="fa-solid fa-cart-plus"></i></button>
    </div>
  `).join('');
}

function addToCart(id, nama, harga, stokMaks) {
  if (stokMaks <= 0) return alert("Stok produk habis!");
  const existing = kasirCart.find(c => c.id === id);
  if (existing) {
    if (existing.qty + 1 > stokMaks) return alert(`Jumlah melebihi stok (Maks: ${stokMaks})!`);
    existing.qty++;
  } else {
    kasirCart.push({ id, nama, harga, qty: 1, stokMaks });
  }
  renderCart();
}

function renderCart() {
  const cartDiv = document.getElementById('kasirCart');
  if (!cartDiv) return;
  if (kasirCart.length === 0) {
    cartDiv.innerHTML = '<p style="color:var(--text-muted);">Keranjang kosong</p>';
    document.getElementById('kasirTotal').innerText = 'Rp 0';
    return;
  }
  
  let total = 0;
  cartDiv.innerHTML = kasirCart.map((c, idx) => {
    total += c.harga * c.qty;
    return `
      <div style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding:8px 0; align-items:center;">
        <div>${escapeHTML(c.nama)}<br><small>Rp ${c.harga.toLocaleString('id-ID')}</small></div>
        <div style="display:flex; align-items:center; gap:8px;">
          <input type="number" value="${c.qty}" min="1" max="${c.stokMaks}" onchange="updateQty(${idx}, this.value)" style="width:55px; padding:4px; text-align:center;">
          <button class="btn btn-danger" style="padding:4px 8px;" onclick="removeFromCart(${idx})"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `;
  }).join('');
  document.getElementById('kasirTotal').innerText = 'Rp ' + total.toLocaleString('id-ID');
}

function updateQty(idx, val) {
  const qty = parseInt(val);
  const item = kasirCart[idx];
  if (qty < 1) kasirCart[idx].qty = 1;
  else if (qty > item.stokMaks) { alert(`Maksimal ${item.stokMaks}!`); kasirCart[idx].qty = item.stokMaks; }
  else kasirCart[idx].qty = qty;
  renderCart();
}

function removeFromCart(idx) { kasirCart.splice(idx, 1); renderCart(); }

async function prosesKasir() {
  if (kasirCart.length === 0) return alert("Keranjang kosong!");
  const namaPembeli = prompt("Nama Pembeli:", "Pelanggan Kasir");
  if (namaPembeli === null) return;

  const total = kasirCart.reduce((sum, c) => sum + (c.harga * c.qty), 0);
  
  const { data: order, error: orderError } = await supabaseClient.from('orders').insert({
    nama: namaPembeli.trim() || 'Pelanggan Kasir',
    layanan: 'Pembelian Sparepart',
    status: 'done',
    biaya: total,
    total_amount: total,
    payment_status: 'paid',
    payment_method: 'cash',
    catatan: 'Transaksi langsung di toko',
    paid_at: new Date().toISOString()
  }).select().single();

  if (orderError) return alert("Gagal membuat pesanan: " + orderError.message);

  const items = kasirCart.map(c => ({
    order_id: order.id, product_id: c.id, nama_produk: c.nama, qty: c.qty, harga_satuan: c.harga, subtotal: c.harga * c.qty
  }));

  const { error: itemError } = await supabaseClient.from('order_items').insert(items);
  if (itemError) {
    await supabaseClient.from('orders').delete().eq('id', order.id);
    return alert("Gagal menyimpan rincian: " + itemError.message);
  }

  for (let item of kasirCart) {
    let tableName = 'products';
    let { data: prod } = await supabaseClient.from(tableName).select('stok').eq('id', item.id).single();
    if (!prod) {
      tableName = 'produk';
      const res = await supabaseClient.from(tableName).select('stok').eq('id', item.id).single();
      prod = res.data;
    }
    if (prod) {
      let stokBaru = prod.stok - item.qty;
      if (stokBaru < 0) stokBaru = 0;
      await supabaseClient.from(tableName).update({ stok: stokBaru }).eq('id', item.id);
    }
  }

  alert(`Pembayaran Berhasil! Total: Rp ${total.toLocaleString('id-ID')}`);
  kasirCart = []; renderCart(); loadKasirProducts(); loadOrders();
}

async function loadProduk() {
  let { data } = await supabaseClient.from('products').select('*').order('nama');
  if (!data) { const res = await supabaseClient.from('produk').select('*').order('nama'); data = res.data; }

  const list = document.getElementById('produkList');
  if (!list) return;
  if (!data || data.length === 0) { list.innerHTML = '<p>Belum ada produk.</p>'; return; }
  
  list.innerHTML = data.map(p => `
    <div style="display:flex; justify-content:space-between; align-items:center; border:1px solid var(--border); padding:16px; border-radius:12px; background:var(--bg-main);">
      <span style="font-weight:600;">${escapeHTML(p.nama)} - Rp ${(p.harga || 0).toLocaleString('id-ID')} (Stok: ${p.stok || 0})</span>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-outline" style="padding:6px 12px; font-size:0.85rem;" onclick="editProduk('${p.id}', '${escapeHTML(p.nama).replace(/'/g, "\\'")}', ${p.harga || 0}, ${p.stok || 0})"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-danger" style="padding:6px 12px; font-size:0.85rem;" onclick="hapusProduk('${p.id}')"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>
  `).join("");
}

document.getElementById("formProduk")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nama = document.getElementById("newProdukNama").value;
  const harga = Number(document.getElementById("newProdukHarga").value);
  const stok = Number(document.getElementById("newProdukStok").value);
  if (stok < 0) return alert("Stok tidak boleh minus!");

  let { error } = await supabaseClient.from("products").insert({ nama, harga, stok });
  if (error) await supabaseClient.from("produk").insert({ nama, harga, stok });

  document.getElementById("newProdukNama").value = "";
  document.getElementById("newProdukHarga").value = "";
  document.getElementById("newProdukStok").value = "";
  loadProduk(); loadKasirProducts();
});

async function editProduk(id, namaLama, hargaLama, stokLama) {
  const namaBaru = prompt("Edit Nama:", namaLama);
  if (namaBaru === null) return;
  const hargaBaru = Number(prompt("Edit Harga:", hargaLama));
  const stokBaru = Number(prompt("Edit Stok:", stokLama));
  
  if (!namaBaru || isNaN(hargaBaru) || isNaN(stokBaru) || stokBaru < 0) return alert("Input tidak valid!");

  let { error } = await supabaseClient.from('products').update({ nama: namaBaru, harga: hargaBaru, stok: stokBaru }).eq('id', id);
  if (error) await supabaseClient.from('produk').update({ nama: namaBaru, harga: hargaBaru, stok: stokBaru }).eq('id', id);
  loadProduk(); loadKasirProducts();
}

async function hapusProduk(id) {
  if(confirm("Hapus produk ini?")) {
    let { error } = await supabaseClient.from('products').delete().eq('id', id);
    if (error) await supabaseClient.from('produk').delete().eq('id', id);
    loadProduk(); loadKasirProducts();
  }
}

async function loadLayanan() {
  const { data } = await supabaseClient.from("services").select("*");
  const list = document.getElementById("layananList");
  if (!list) return;
  if (!data || data.length === 0) { list.innerHTML = `<p>Belum ada layanan.</p>`; return; }
  list.innerHTML = data.map(s => `
    <div style="display:flex; justify-content:space-between; align-items:center; border:1px solid var(--border); padding:16px; border-radius:12px; background:var(--bg-main);">
      <span style="font-weight:600;">${escapeHTML(s.nama)}</span>
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
  const el = document.getElementById('userList');
  if (!el) return;
  if (!data || data.length === 0) { el.innerHTML = `<p style="color:var(--text-muted);">Belum ada chat.</p>`; return; }
  const uniqueUsers = [...new Map(data.map(item => [item.sender_id, item])).values()];
  el.innerHTML = uniqueUsers.map(u => `
    <div style="padding:16px; border-bottom:1px solid var(--border); cursor:pointer; font-weight:600;" onclick="loadAdminChat('${u.sender_id}')">
      ${escapeHTML(u.profiles?.nama) || 'User'}
    </div>
  `).join('');
}

async function loadAdminChat(userId) {
  activeChatUser = userId;
  const { data } = await supabaseClient.from('chats').select('*')
    .or(`and(sender_id.eq.${userId},receiver_id.eq.${currentUser.id}),and(sender_id.eq.${currentUser.id},receiver_id.eq.${userId})`).order('created_at');
  
  const chatBox = document.getElementById('adminChatBox');
  if(!chatBox) return;
  chatBox.innerHTML = data.map(c => `<div class="chat-msg ${c.sender_id === currentUser.id ? 'chat-me' : 'chat-them'}">${escapeHTML(c.pesan)}</div>`).join('');
  chatBox.scrollTop = chatBox.scrollHeight;
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

document.getElementById("btnSavePaymentSettings")?.addEventListener("click", async () => {
  const qris = document.getElementById("qrisUrl").value;
  const bank = document.getElementById("bankInfo").value;
  const wa = document.getElementById("adminWa").value;
  await supabaseClient.from("settings").update({ qris_image_url: qris, bank_info: bank, admin_wa_number: wa }).eq("id", 1);
  alert("Pengaturan Pembayaran Disimpan!");
});

async function updateStatus(id, status) { await supabaseClient.from("orders").update({ status }).eq("id", id); loadOrders(); }
async function updateBiaya(id, biaya) { 
  const num = Number(biaya);
  await supabaseClient.from("orders").update({ biaya: num, total_amount: num }).eq("id", id); 
  loadOrders(); 
}

async function editDiagnosa(id) {
  const kerusakan = prompt("Diagnosa Kerusakan:"); if (kerusakan === null) return;
  const sparepart = prompt("Sparepart Diganti:"); if (sparepart === null) return;
  await supabaseClient.from("orders").update({ kerusakan, sparepart }).eq("id", id);
  loadOrders();
}

async function hapusPesanan(id) { 
  if(confirm("Hapus pesanan ini?")) { await supabaseClient.from("orders").delete().eq("id", id); loadOrders(); } 
}

async function cetakNota(orderId) {
  const { data: order } = await supabaseClient.from('orders').select('*').eq('id', orderId).single();
  if (!order) return alert("Gagal mengambil data nota.");
  const { data: items } = await supabaseClient.from('order_items').select('*').eq('order_id', orderId);

  const tgl = new Date(order.created_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
  const totalNominal = order.total_amount || order.biaya || 0;
  const biaya = totalNominal ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(totalNominal) : 'Rp 0';

  let itemsHtml = '';
  if (items && items.length > 0) {
    itemsHtml = `<div class="line"></div><div class="desc"><strong>Rincian Barang:</strong></div>
      ${items.map(i => `<div class="row"><span>${escapeHTML(i.nama_produk)} x${i.qty}</span><span>Rp ${(i.subtotal).toLocaleString('id-ID')}</span></div>`).join('')}`;
  }

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html><head><title>Nota - ${escapeHTML(order.nama)}</title>
    <style>
      body { font-family: 'Courier New', monospace; padding: 20px; color: #000; background: #fff; }
      .nota { max-width: 400px; margin: 0 auto; border: 2px dashed #000; padding: 20px; }
      .header { text-align: center; margin-bottom: 20px; }
      .line { border-top: 1px dashed #000; margin: 10px 0; }
      .row { display: flex; justify-content: space-between; margin: 5px 0; font-size: 13px; }
      .desc { font-size: 13px; margin: 4px 0; }
      .total { font-size: 18px; font-weight: bold; margin-top: 15px; }
      .footer { text-align: center; font-size: 12px; margin-top: 20px; }
      @media print { body { padding: 0; } .no-print { display: none; } }
    </style></head><body>
      <div class="nota">
        <div class="header"><h2 style="margin:0;">MALIK SERVICE</h2>
        <p style="margin:5px 0; font-size:12px;">Semarang, Jawa Tengah<br>Telp: 0857-1308-7659</p></div>
        <div class="line"></div>
        <div class="row"><span>No. Nota</span><span>#${order.id.split('-')[0].toUpperCase()}</span></div>
        <div class="row"><span>Tanggal</span><span>${tgl}</span></div>
        <div class="row"><span>Pelanggan</span><span>${escapeHTML(order.nama)}</span></div>
        <div class="line"></div>
        <div class="desc"><strong>Layanan:</strong> ${escapeHTML(order.layanan)}</div>
        ${order.catatan ? `<div class="desc"><strong>Keluhan:</strong> ${escapeHTML(order.catatan)}</div>` : ''}
        ${order.kerusakan ? `<div class="desc"><strong>Diagnosa:</strong> ${escapeHTML(order.kerusakan)}</div>` : ''}
        ${order.sparepart ? `<div class="desc"><strong>Sparepart:</strong> ${escapeHTML(order.sparepart)}</div>` : ''}
        ${itemsHtml}
        <div class="line"></div>
        <div class="row total"><span>TOTAL</span><span>${biaya}</span></div>
        <div class="line"></div>
        <div class="footer">
          <p>Status Kerja: <strong>${order.status.toUpperCase()}</strong></p>
          <p>Pembayaran: <strong>${(order.payment_status || 'unpaid').toUpperCase()}</strong></p>
          <p>Terima kasih telah menggunakan layanan kami.</p>
        </div>
      </div>
      <div style="text-align:center; margin-top:20px;" class="no-print">
        <button onclick="window.print()" style="padding:10px 20px; cursor:pointer; background:#4f46e5; color:#fff; border:none; border-radius:8px;">Print / Save as PDF</button>
      </div>
    </body></html>`);
  printWindow.document.close();
}

// ==========================================
// 7. FITUR LAPORAN KEUANGAN & EXPORT CSV
// ==========================================
async function loadLaporan() {
  const list = document.getElementById('laporanList');
  const elOmzet = document.getElementById('lapOmzet');
  const elLaba = document.getElementById('lapLaba');
  const elBatal = document.getElementById('lapBatal');
  
  if (!list) return;
  list.innerHTML = '<tr><td colspan="5" style="text-align: center;">Menghitung data...</td></tr>';

  try {
    const { data: orders, error } = await supabaseClient
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!orders || orders.length === 0) {
      list.innerHTML = '<tr><td colspan="5" style="text-align: center;">Belum ada data transaksi.</td></tr>';
      elOmzet.textContent = 'Rp 0';
      elLaba.textContent = 'Rp 0';
      elBatal.textContent = 'Rp 0';
      return;
    }

    let totalOmzet = 0;
    let totalBatal = 0;
    const BIAYA_OPERASIONAL_PERSEN = 0.70; // 70% (Bisa Anda ubah manual di sini)

    list.innerHTML = orders.map(o => {
      const nominal = Number(o.total_amount || o.biaya || 0);
      
      if (o.payment_status === 'paid') {
        totalOmzet += nominal;
      } else if (o.status === 'cancel' || o.payment_status === 'rejected') {
        totalBatal += nominal;
      }

      const statusKerja = o.status ? o.status.toUpperCase() : '-';
      const statusBayar = o.payment_status ? o.payment_status.toUpperCase() : 'UNPAID';
      const tgl = new Date(o.created_at).toLocaleDateString('id-ID');

      return `
        <tr>
          <td>${tgl}</td>
          <td>${escapeHTML(o.nama) || '-'}</td>
          <td>${escapeHTML(o.layanan) || '-'}</td>
          <td>
            <span class="badge ${o.status === 'done' ? 'badge-done' : 'badge-pending'}">${statusKerja}</span>
            <span class="badge ${o.payment_status === 'paid' ? 'badge-done' : 'badge-danger'}">${statusBayar}</span>
          </td>
          <td style="text-align: right; font-weight: 600;">${nominal.toLocaleString('id-ID')}</td>
        </tr>
      `;
    }).join('');

    const biayaOperasional = totalOmzet * BIAYA_OPERASIONAL_PERSEN;
    const labaBersih = totalOmzet - biayaOperasional;

    const formatRp = (angka) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(angka);
    
    elOmzet.textContent = formatRp(totalOmzet);
    elLaba.textContent = formatRp(labaBersih);
    elBatal.textContent = formatRp(totalBatal);

    dataLaporanGlobal = orders;

  } catch (err) {
    console.error("Error loadLaporan:", err);
    list.innerHTML = '<tr><td colspan="5" style="text-align: center; color: red;">Gagal memuat data laporan.</td></tr>';
  }
}

function downloadCSV() {
  if (dataLaporanGlobal.length === 0) {
    return alert("Tidak ada data untuk di-download.");
  }

  try {
    let csvContent = "Tanggal,Nama Pelanggan,Layanan,Status Kerja,Status Pembayaran,Nominal (Rp)\n";

    dataLaporanGlobal.forEach(o => {
      const nominal = Number(o.total_amount || o.biaya || 0);
      const tgl = new Date(o.created_at).toLocaleDateString('id-ID');
      
      const nama = (o.nama || '-').replace(/,/g, '');
      const layanan = (o.layanan || '-').replace(/,/g, '');

      csvContent += `${tgl},${nama},${layanan},${o.status},${o.payment_status || 'unpaid'},${nominal}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Laporan_Keuangan_MalikService_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

  } catch (err) {
    alert("Gagal mendownload CSV: " + err.message);
  }
}