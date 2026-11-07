let currentUser, activeChatUser;
let kasirCart = [];
let revenueChartInstance = null;

(async () => {
  const session = await requireAdmin(); if (!session) return;
  currentUser = session.user;

  const { data: set } = await supabaseClient.from('settings').select('*').eq('id', 1).single();
  if (set && document.getElementById('logoUrl')) document.getElementById('logoUrl').value = set.logo_url || '';

  loadOrders(); 
  loadLayanan(); 
  loadProduk(); 
  loadKasirProducts();

  supabaseClient.channel('admin:chats')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' }, payload => {
      if (payload.new.receiver_id === currentUser.id) { 
        loadUserList(); 
        if (activeChatUser === payload.new.sender_id) loadAdminChat(payload.new.sender_id); 
      }
    }).subscribe();
})();

function showTab(tab) {
  document.querySelectorAll('.main > div').forEach(d => d.classList.add('hidden'));
  document.getElementById('tab-' + tab).classList.remove('hidden');
  if (tab === 'chat') loadUserList();
  if (tab === 'kasir') loadKasirProducts();
}

// ==========================================
// 1. DASHBOARD & CHART
// ==========================================
async function loadOrders() {
  const searchTerm = document.getElementById('searchOrder')?.value.toLowerCase() || "";
  const { data, error } = await supabaseClient.from("orders").select("*, order_items(*)").order("created_at", { ascending: false });
  if (error) return console.error(error);

  let totalPendapatan = 0, countPending = 0, countProgress = 0;
  let chartLabels = [];
  let chartData = {};

  data.forEach(o => {
    if (o.status === 'done') totalPendapatan += Number(o.biaya || 0);
    if (o.status === 'pending') countPending++;
    if (o.status === 'progress') countProgress++;

    if (o.status === 'done') {
      const tgl = o.created_at.split('T')[0];
      chartData[tgl] = (chartData[tgl] || 0) + Number(o.biaya || 0);
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
    document.getElementById('statProgress').textContent = countProgress;
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
    ordersList.innerHTML = `<tr><td colspan="5" style="text-align:center;">Pesanan tidak ditemukan.</td></tr>`;
    return;
  }

  ordersList.innerHTML = filteredData.map(o => {
    let itemsHtml = '';
    if (o.order_items && o.order_items.length > 0) {
      itemsHtml = `<div style="margin-top:4px; padding:4px 8px; background:#f1f5f9; border-radius:6px; font-size:0.85rem;">
        <strong>Barang:</strong> ${o.order_items.map(i => `${i.nama_produk} (x${i.qty})`).join(', ')}
      </div>`;
    }

    return `
      <tr>
        <td>
          <strong>${o.nama || '-'}</strong><br>
          <small style="color:var(--text-muted);">${o.telepon || '-'}</small><br>
          <small style="color:var(--primary); font-weight:600;">Keluhan: ${o.catatan || '-'}</small><br>
          <small style="color:var(--text-main);">Diagnosa: ${o.kerusakan || '-'}</small><br>
          <small style="color:var(--text-main);">Part: ${o.sparepart || '-'}</small>
          ${itemsHtml}
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

// ==========================================
// 2. FITUR KASIR / POS
// ==========================================
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
        <strong>${p.nama}</strong><br>
        <small>Rp ${(p.harga || 0).toLocaleString('id-ID')} | Stok: ${p.stok || 0}</small>
      </div>
      <button class="btn btn-primary" style="padding:8px 12px;" onclick="addToCart('${p.id}', '${p.nama}', ${p.harga || 0}, ${p.stok || 0})"><i class="fa-solid fa-cart-plus"></i></button>
    </div>
  `).join('');
}

function addToCart(id, nama, harga, stokMaks) {
  if (stokMaks <= 0) {
    return alert("Stok produk habis!");
  }

  const existing = kasirCart.find(c => c.id === id);
  if (existing) {
    if (existing.qty + 1 > stokMaks) {
      return alert(`Jumlah melebihi stok yang tersedia (Maks: ${stokMaks})!`);
    }
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
        <div>${c.nama}<br><small>Rp ${c.harga.toLocaleString('id-ID')}</small></div>
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
  
  if (qty < 1) {
    kasirCart[idx].qty = 1;
  } else if (qty > item.stokMaks) {
    alert(`Jumlah tidak boleh melebihi stok maksimal (${item.stokMaks})!`);
    kasirCart[idx].qty = item.stokMaks;
  } else {
    kasirCart[idx].qty = qty;
  }
  renderCart();
}

function removeFromCart(idx) {
  kasirCart.splice(idx, 1);
  renderCart();
}

async function prosesKasir() {
  if (kasirCart.length === 0) return alert("Keranjang kosong!");
  
  // Meminta nama pembeli (default: Pelanggan Kasir)
  const namaPembeli = prompt("Masukkan Nama Pembeli:", "Pelanggan Kasir");
  if (namaPembeli === null) return;

  const total = kasirCart.reduce((sum, c) => sum + (c.harga * c.qty), 0);
  const metode = prompt("Pilih Metode Pembayaran (cash / transfer / qris):", "cash");
  if (!metode) return;
  
  const { data: order, error: orderError } = await supabaseClient.from('orders').insert({
    nama: namaPembeli.trim() || 'Pelanggan Kasir',
    layanan: 'Pembelian Sparepart',
    status: 'done',
    biaya: total,
    metode_bayar: metode,
    catatan: 'Transaksi langsung di toko'
  }).select().single();

  if (orderError) return alert("Gagal membuat pesanan: " + orderError.message);

  const items = kasirCart.map(c => ({
    order_id: order.id,
    product_id: c.id,
    nama_produk: c.nama,
    qty: c.qty,
    harga_satuan: c.harga,
    subtotal: c.harga * c.qty
  }));

  const { error: itemError } = await supabaseClient.from('order_items').insert(items);
  
  if (itemError) {
    alert("Gagal menyimpan rincian barang: " + itemError.message);
    await supabaseClient.from('orders').delete().eq('id', order.id);
    return;
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

  alert(`Pembayaran Berhasil untuk ${namaPembeli}!\nTotal: Rp ${total.toLocaleString('id-ID')}\nMetode: ${metode.toUpperCase()}`);
  kasirCart = [];
  renderCart();
  loadKasirProducts();
  loadOrders();
}

// ==========================================
// 3. KATALOG PRODUK, TAMBAH STOK & EDIT
// ==========================================
async function loadProduk() {
  let { data, error } = await supabaseClient.from('products').select('*').order('nama');
  if (error || !data) {
    const res = await supabaseClient.from('produk').select('*').order('nama');
    data = res.data;
  }

  const list = document.getElementById('produkList');
  if (!list) return;
  if (!data || data.length === 0) { list.innerHTML = '<p>Belum ada produk.</p>'; return; }
  
  list.innerHTML = data.map(p => `
    <div style="display:flex; justify-content:space-between; align-items:center; border:1px solid var(--border); padding:16px; border-radius:12px; background:var(--bg-main);">
      <span style="font-weight:600;">${p.nama} - Rp ${(p.harga || 0).toLocaleString('id-ID')} (Stok: ${p.stok || 0})</span>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-outline" style="padding:6px 12px; font-size:0.85rem;" onclick="editProduk('${p.id}', '${p.nama}', ${p.harga || 0}, ${p.stok || 0})"><i class="fa-solid fa-pen"></i> Edit</button>
        <button class="btn btn-outline" style="padding:6px 12px; font-size:0.85rem;" onclick="tambahStok('${p.id}', '${p.nama}', ${p.stok || 0})"><i class="fa-solid fa-plus"></i> Tambah Stok</button>
        <button class="btn btn-danger" style="padding:6px 12px; font-size:0.85rem;" onclick="hapusProduk('${p.id}')">Hapus</button>
      </div>
    </div>
  `).join("");
}

document.getElementById("formProduk")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nama = document.getElementById("newProdukNama").value;
  const harga = Number(document.getElementById("newProdukHarga").value);
  const stok = Number(document.getElementById("newProdukStok").value);
  
  if (stok < 0) {
    return alert("Stok tidak boleh bernilai minus!");
  }

  let { error } = await supabaseClient.from("products").insert({ nama, harga, stok });
  if (error) {
    await supabaseClient.from("produk").insert({ nama, harga, stok });
  }

  document.getElementById("newProdukNama").value = "";
  document.getElementById("newProdukHarga").value = "";
  document.getElementById("newProdukStok").value = "";
  loadProduk(); loadKasirProducts();
});

async function editProduk(id, namaLama, hargaLama, stokLama) {
  const namaBaru = prompt("Edit Nama Produk:", namaLama);
  if (namaBaru === null) return;
  
  const hargaBaruStr = prompt("Edit Harga Produk (Rp):", hargaLama);
  if (hargaBaruStr === null) return;
  const hargaBaru = Number(hargaBaruStr);

  const stokBaruStr = prompt("Edit Jumlah Stok:", stokLama);
  if (stokBaruStr === null) return;
  const stokBaru = Number(stokBaruStr);

  if (!namaBaru || isNaN(hargaBaru) || isNaN(stokBaru) || stokBaru < 0) {
    return alert("Input tidak valid! Pastikan nama terisi dan angka harga/stok benar.");
  }

  let tableName = 'products';
  let { error } = await supabaseClient.from(tableName).update({ nama: namaBaru, harga: hargaBaru, stok: stokBaru }).eq('id', id);
  if (error) {
    tableName = 'produk';
    await supabaseClient.from(tableName).update({ nama: namaBaru, harga: hargaBaru, stok: stokBaru }).eq('id', id);
  }

  alert("Produk berhasil diperbarui!");
  loadProduk();
  loadKasirProducts();
}

async function tambahStok(id, nama, stokSekarang) {
  const tambahan = prompt(`Masukkan jumlah stok yang ingin ditambahkan untuk "${nama}":`, "1");
  if (tambahan === null) return;
  
  const jumlahTambah = parseInt(tambahan);
  if (isNaN(jumlahTambah) || jumlahTambah <= 0) {
    return alert("Masukkan angka yang valid!");
  }

  const stokBaru = stokSekarang + jumlahTambah;

  let tableName = 'products';
  let { error } = await supabaseClient.from(tableName).update({ stok: stokBaru }).eq('id', id);
  if (error) {
    tableName = 'produk';
    await supabaseClient.from(tableName).update({ stok: stokBaru }).eq('id', id);
  }

  alert(`Stok berhasil ditambah! Stok sekarang: ${stokBaru}`);
  loadProduk();
  loadKasirProducts();
}

async function hapusProduk(id) {
  if(confirm("Hapus produk ini?")) {
    let { error } = await supabaseClient.from('products').delete().eq('id', id);
    if (error) {
      await supabaseClient.from('produk').delete().eq('id', id);
    }
    loadProduk(); loadKasirProducts();
  }
}

// ==========================================
// 4. FITUR LAINNYA
// ==========================================
async function editDiagnosa(id) {
  const kerusakan = prompt("Masukkan Diagnosa Kerusakan:");
  if (kerusakan === null) return;
  const sparepart = prompt("Masukkan Sparepart yang Diganti:");
  if (sparepart === null) return;
  await supabaseClient.from("orders").update({ kerusakan, sparepart }).eq("id", id);
  loadOrders();
}

async function updateStatus(id, status) { await supabaseClient.from("orders").update({ status }).eq("id", id); loadOrders(); }
async function updateBiaya(id, biaya) { await supabaseClient.from("orders").update({ biaya: Number(biaya) }).eq("id", id); loadOrders(); }

async function hapusPesanan(id) { 
  if(confirm("Hapus pesanan ini?")) { 
    await supabaseClient.from("orders").delete().eq("id", id); 
    loadOrders(); 
  } 
}

async function loadLayanan() {
  const { data } = await supabaseClient.from("services").select("*");
  const list = document.getElementById("layananList");
  if (!list) return;
  if (!data || data.length === 0) { list.innerHTML = `<p>Belum ada layanan.</p>`; return; }
  list.innerHTML = data.map(s => `
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
  const el = document.getElementById('userList');
  if (!el) return;
  if (!data || data.length === 0) { el.innerHTML = `<p style="color:var(--text-muted);">Belum ada chat.</p>`; return; }
  const uniqueUsers = [...new Map(data.map(item => [item.sender_id, item])).values()];
  el.innerHTML = uniqueUsers.map(u => `
    <div style="padding:16px; border-bottom:1px solid var(--border); cursor:pointer; font-weight:600;" onclick="loadAdminChat('${u.sender_id}')">
      ${u.profiles?.nama || 'User'}
    </div>
  `).join('');
}

async function loadAdminChat(userId) {
  activeChatUser = userId;
  const { data } = await supabaseClient.from('chats').select('*')
    .or(`and(sender_id.eq.${userId},receiver_id.eq.${currentUser.id}),and(sender_id.eq.${currentUser.id},receiver_id.eq.${userId})`).order('created_at');
  
  const chatBox = document.getElementById('adminChatBox');
  if(!chatBox) return;
  chatBox.innerHTML = data.map(c => `<div class="chat-msg ${c.sender_id === currentUser.id ? 'chat-me' : 'chat-them'}">${c.pesan}</div>`).join('');
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

// ==========================================
// 5. CETAK NOTA
// ==========================================
async function cetakNota(orderId) {
  const { data: order, error } = await supabaseClient.from('orders').select('*').eq('id', orderId).single();
  if (error || !order) return alert("Gagal mengambil data nota.");

  const { data: items } = await supabaseClient.from('order_items').select('*').eq('order_id', orderId);

  const tgl = new Date(order.created_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
  const biaya = order.biaya ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(order.biaya) : 'Rp 0';

  let itemsHtml = '';
  if (items && items.length > 0) {
    itemsHtml = `
      <div class="line"></div>
      <div class="desc"><strong>Rincian Barang:</strong></div>
      ${items.map(i => `
        <div class="row">
          <span>${i.nama_produk} x${i.qty}</span>
          <span>Rp ${(i.subtotal).toLocaleString('id-ID')}</span>
        </div>
      `).join('')}
    `;
  }

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html><head><title>Nota - ${order.nama}</title>
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
    </style>
    </head>
    <body>
      <div class="nota">
        <div class="header">
          <h2 style="margin:0;">MALIK SERVICE</h2>
          <p style="margin:5px 0; font-size:12px;">Semarang, Jawa Tengah<br>Telp: 0857-1308-7659</p>
        </div>
        <div class="line"></div>
        <div class="row"><span>No. Nota</span><span>#${order.id.split('-')[0].toUpperCase()}</span></div>
        <div class="row"><span>Tanggal</span><span>${tgl}</span></div>
        <div class="row"><span>Pelanggan</span><span>${order.nama}</span></div>
        <div class="line"></div>
        
        <div class="desc"><strong>Layanan:</strong> ${order.layanan}</div>
        ${order.catatan ? `<div class="desc"><strong>Keluhan:</strong> ${order.catatan}</div>` : ''}
        ${order.kerusakan ? `<div class="desc"><strong>Diagnosa:</strong> ${order.kerusakan}</div>` : ''}
        ${order.sparepart ? `<div class="desc"><strong>Sparepart:</strong> ${order.sparepart}</div>` : ''}
        
        ${itemsHtml}
        
        <div class="line"></div>
        <div class="row total"><span>TOTAL</span><span>${biaya}</span></div>
        <div class="line"></div>
        <div class="footer">
          <p>Status: <strong>${order.status.toUpperCase()}</strong></p>
          <p>Metode: ${(order.metode_bayar || 'cash').toUpperCase()}</p>
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