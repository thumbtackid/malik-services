let currentUser;
let settingsData = {};
let activeOrderForPayment = null;
let userOrdersData = [];
let produkPilihan = null; 

(async () => {
  const session = await requireAuth(); if(!session) return;
  currentUser = session.user;

  const userNameEl = document.getElementById("userName");
  if(userNameEl) userNameEl.textContent = currentUser.email;

  const orderNamaEl = document.getElementById("orderNama");
  if(orderNamaEl) orderNamaEl.value = currentUser.user_metadata?.nama || "";

  const { data: set } = await supabaseClient.from('settings').select('*').eq('id', 1).single();
  settingsData = set || {};

  if(document.getElementById('alamatTokoUser')) document.getElementById('alamatTokoUser').textContent = settingsData.alamat_toko || 'Silakan datang ke toko kami.';
  if(document.getElementById('mapsFrame')) document.getElementById('mapsFrame').src = settingsData.maps_url || 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3960.2435949048736!2d110.42045831477303!3d-7.005295994962411!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e708b1a2d6c9b0b%3A0x2b3e2b6c6d3e4b6c!2sSemarang!5e0!3m2!1sen!2sid!4v1620000000000!5m2!1sen!2sid';

  const { data: services } = await supabaseClient.from('services').select('*');
  const orderLayananEl = document.getElementById('orderLayanan');
  if(orderLayananEl && services) {
    orderLayananEl.innerHTML = services.map(s => `<option>${escapeHTML(s.nama)}</option>`).join('');
  }

  const formOrder = document.getElementById("formOrder");
  if(formOrder) {
    formOrder.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button'); btn.textContent = "Mengirim...";
      
      const { error } = await supabaseClient.from("orders").insert({
        user_id: currentUser.id,
        nama: document.getElementById("orderNama").value,
        telepon: document.getElementById("orderTelepon").value,
        alamat: document.getElementById("orderAlamat").value,
        layanan: document.getElementById("orderLayanan").value,
        catatan: document.getElementById("orderKeluhan").value,
        payment_status: 'unpaid'
      });

      if (error) { alert("Gagal: " + error.message); btn.textContent = "Kirim Pesanan"; return; }

      await supabaseClient.from('notifications').insert({
        title: 'Pesanan Baru', message: `Pesanan servis dari ${document.getElementById("orderNama").value}`, type: 'new_order'
      });

      alert("Pesanan Terkirim! Silakan cek di Riwayat.");
      e.target.reset(); btn.textContent = "Kirim Pesanan"; showTab('riwayat');
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
  if(tab === 'katalog') loadKatalog();
  if(tab === 'lacak') loadSelectLacak();
}

// ====== FITUR KATALOG & PENGIRIMAN ======
async function loadKatalog() {
  const list = document.getElementById('katalogList');
  if(!list) return;
  list.innerHTML = '<p style="text-align:center; color:var(--text-muted);">Memuat katalog...</p>';

  let { data } = await supabaseClient.from('products').select('*').order('nama');
  if (!data) { const res = await supabaseClient.from('produk').select('*').order('nama'); data = res.data; }

  if (!data || data.length === 0) {
    list.innerHTML = '<p style="text-align:center; color:var(--text-muted);">Belum ada produk yang dijual.</p>';
    return;
  }

  list.innerHTML = data.map(p => `
    <div class="card animate-in" style="padding: 16px; display:flex; flex-direction:column; gap:12px; text-align:center;">
      <img src="${p.image_url || 'https://via.placeholder.com/150?text=No+Image'}" alt="${escapeHTML(p.nama)}" style="width:100%; height:150px; object-fit:cover; border-radius:8px; border:1px solid var(--border);">
      <div>
        <h4 style="font-size:1rem; margin-bottom:4px;">${escapeHTML(p.nama)}</h4>
        <p style="color:var(--primary); font-weight:700; font-size:1.1rem;">Rp ${(p.harga || 0).toLocaleString('id-ID')}</p>
        <p style="font-size:0.8rem; color:var(--text-muted);">Stok: ${p.stok || 0}</p>
      </div>
      <button onclick="bukaModalPengiriman('${p.id}', '${escapeHTML(p.nama).replace(/'/g, "\\'")}', ${p.harga}, ${p.stok})" class="btn btn-primary" style="width:100%; padding:8px; font-size:0.85rem;" ${p.stok <= 0 ? 'disabled' : ''}>
        ${p.stok > 0 ? '<i class="fa-solid fa-cart-plus"></i> Beli Sekarang' : 'Stok Habis'}
      </button>
    </div>
  `).join('');
}

function bukaModalPengiriman(id, nama, harga, stok) {
  if(stok <= 0) return alert("Stok habis!");
  produkPilihan = { id, nama, harga };
  document.getElementById('ringkasanProduk').textContent = `Produk: ${nama} (Rp ${harga.toLocaleString('id-ID')})`;
  document.getElementById('metodeKirim').value = 'pickup';
  document.getElementById('alamatKirim').value = '';
  document.getElementById('alamatContainer').classList.add('hidden');
  updateOngkir();
  document.getElementById('modalPengiriman').classList.remove('hidden');
}

function closeModalPengiriman() {
  document.getElementById('modalPengiriman').classList.add('hidden');
  produkPilihan = null;
}

function updateOngkir() {
  const metode = document.getElementById('metodeKirim').value;
  const alamatContainer = document.getElementById('alamatContainer');
  
  let ongkir = 0;
  if (metode === 'delivery') {
    ongkir = 10000;
    alamatContainer.classList.remove('hidden');
  } else {
    alamatContainer.classList.add('hidden');
  }

  const total = produkPilihan.harga + ongkir;
  document.getElementById('totalBayarKatalog').textContent = `Rp ${total.toLocaleString('id-ID')}`;
}

async function prosesPesananKatalog() {
  if(!produkPilihan) return;
  const metode = document.getElementById('metodeKirim').value;
  const alamat = document.getElementById('alamatKirim').value;
  
  if(metode === 'delivery' && !alamat) return alert("Alamat pengiriman wajib diisi!");

  const ongkir = metode === 'delivery' ? 10000 : 0;
  const total = produkPilihan.harga + ongkir;
  const catatan = metode === 'delivery' ? `[DIANTAR] Ongkir: Rp ${ongkir.toLocaleString('id-ID')}` : `[AMBIL DI TOKO]`;

  const { data: order, error } = await supabaseClient.from('orders').insert({
    user_id: currentUser.id,
    nama: currentUser.user_metadata?.nama || "Pelanggan",
    telepon: "-", 
    alamat: metode === 'delivery' ? alamat : "Ambil di Toko",
    layanan: 'Pembelian Sparepart',
    catatan: catatan,
    total_amount: total,
    payment_status: 'unpaid'
  }).select().single();

  if (error) return alert("Gagal membuat pesanan: " + error.message);

  await supabaseClient.from('order_items').insert({
    order_id: order.id, product_id: produkPilihan.id, nama_produk: produkPilihan.nama, qty: 1, harga_satuan: produkPilihan.harga, subtotal: produkPilihan.harga
  });

  await supabaseClient.from('notifications').insert({
    title: 'Pesanan Produk Baru', message: `Pesanan produk dari ${currentUser.email}`, type: 'new_order'
  });

  closeModalPengiriman();
  alert("Pesanan berhasil dibuat! Lanjutkan ke pembayaran.");
  openCheckout(order.id);
  loadRiwayat();
}

// ====== FITUR CEK RESI ======
async function cekResi() {
  const input = document.getElementById('inputResi').value.trim().toUpperCase();
  const hasil = document.getElementById('hasilResi');
  if (!input) return alert("Masukkan nomor resi atau ID pesanan!");

  hasil.innerHTML = '<p>Mencari data...</p>';

  const { data, error } = await supabaseClient
    .from('orders')
    .select('*')
    .or(`id.ilike.%${input}%,no_resi.ilike.%${input}%`)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    hasil.innerHTML = '<p style="color: var(--danger);"><i class="fa-solid fa-circle-xmark"></i> Resi / Nota tidak ditemukan. Pastikan penulisan benar.</p>';
    return;
  }

  const order = data[0];
  const isDelivery = order.catatan?.includes('[DIANTAR]');
  const paymentStatus = (order.payment_status || 'unpaid').toUpperCase();
  
  hasil.innerHTML = `
    <div style="text-align: left; padding: 10px;">
      <h3 style="color: var(--primary); margin-bottom: 12px;">Detail Pesanan</h3>
      <p><strong>No. Nota:</strong> #${order.id.split('-')[0].toUpperCase()}</p>
      <p><strong>Nama:</strong> ${escapeHTML(order.nama)}</p>
      <p><strong>Layanan:</strong> ${escapeHTML(order.layanan)}</p>
      <p><strong>Status Pembayaran:</strong> <span class="badge ${order.payment_status === 'paid' ? 'badge-done' : 'badge-danger'}">${paymentStatus}</span></p>
      
      <hr style="margin: 12px 0; border: 1px solid var(--border);">
      
      <h4 style="margin-bottom: 8px;">Status Pengiriman:</h4>
      ${isDelivery 
        ? `<p style="color: var(--success); font-weight: 700;"><i class="fa-solid fa-truck-fast"></i> Paket Sedang Dikirim ke Alamat Tujuan</p>
           <p style="font-size: 0.85rem; color: var(--text-muted);">Alamat: ${escapeHTML(order.alamat || '-')}</p>` 
        : `<p style="color: var(--warning); font-weight: 700;"><i class="fa-solid fa-store"></i> Silakan Ambil di Toko</p>
           <p style="font-size: 0.85rem; color: var(--text-muted);">Alamat Toko: ${escapeHTML(settingsData.alamat_toko || 'Hubungi Admin')}</p>`
      }
      ${order.no_resi ? `<p style="margin-top: 10px;"><strong>No. Resi:</strong> ${escapeHTML(order.no_resi)}</p>` : ''}
    </div>
  `;
}

// ====== FITUR RIWAYAT & LACAK ======
async function loadRiwayat() {
  const { data } = await supabaseClient.from("orders").select("*").eq("user_id", currentUser.id).order("created_at", { ascending: false });
  userOrdersData = data || [];
  
  const badge = { pending: "badge-pending", progress: "badge-progress", done: "badge-done", cancel: "badge-danger" };
  const label = { pending: "Menunggu", progress: "Diproses", done: "Selesai", cancel: "Dibatalkan" };

  const payBadge = {
    unpaid: { class: "badge-danger", text: "Belum Bayar" },
    waiting_verification: { class: "badge-pending", text: "Menunggu Verifikasi" },
    paid: { class: "badge-done", text: "Lunas" },
    rejected: { class: "badge-danger", text: "Ditolak" }
  };

  const riwayatList = document.getElementById("riwayatList");
  if(!riwayatList) return;

  if (!data || data.length === 0) {
    riwayatList.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding:40px;">Belum ada pesanan.</p>`;
    return;
  }

  riwayatList.innerHTML = data.map(o => {
    const pb = payBadge[o.payment_status] || payBadge.unpaid;
    const total = o.total_amount || o.biaya || 0;
    const needPay = (o.payment_status === 'unpaid' || o.payment_status === 'rejected' || !o.payment_status) && o.status !== 'cancel';
    const waitingVerify = o.payment_status === 'waiting_verification';

    return `
    <div class="riwayat-card">
      <div style="flex:1; min-width:250px;">
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
          <span class="badge ${badge[o.status] || 'badge-pending'}">${label[o.status] || o.status}</span>
          <span class="badge ${pb.class}">${pb.text}</span>
        </div>
        <strong style="font-size:1.05rem;">${escapeHTML(o.layanan)}</strong><br>
        <small style="color:var(--text-muted);">${new Date(o.created_at).toLocaleString('id-ID')}</small><br>
        <small style="color:var(--text-main); font-weight:600;">Catatan: ${escapeHTML(o.catatan)}</small><br>
        <small style="color:var(--text-main); font-weight:600;">Total: ${total ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(total) : 'Belum ditentukan'}</small>
      </div>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${needPay ? `<button class="btn btn-primary" onclick="openCheckout('${o.id}')"><i class="fa-solid fa-qrcode"></i> Bayar Sekarang</button>` : ''}
        ${waitingVerify ? `<span style="font-size:0.85rem; color:var(--warning);"><i class="fa-solid fa-hourglass-half"></i> Menunggu verifikasi</span>` : ''}
        ${o.status === 'done' && o.payment_status === 'paid' ? `<button class="btn btn-outline" onclick="cetakNota('${o.id}')"><i class="fa-solid fa-print"></i> Nota</button>` : ''}
      </div>
    </div>
  `}).join("");
}

function loadSelectLacak() {
  const select = document.getElementById('lacakSelect');
  if(!select) return;
  if(userOrdersData.length === 0) {
    select.innerHTML = '<option value="">Belum ada pesanan</option>';
    document.getElementById('timelineContainer').innerHTML = '<p style="text-align:center; color:var(--text-muted);">Belum ada pesanan.</p>';
    return;
  }
  select.innerHTML = userOrdersData.map(o => `<option value="${o.id}">${escapeHTML(o.layanan)} - ${new Date(o.created_at).toLocaleDateString('id-ID')}</option>`).join('');
  renderTimeline(select.value);
}

function renderTimeline(orderId) {
  const container = document.getElementById('timelineContainer');
  const order = userOrdersData.find(o => o.id === orderId);
  if(!order || !container) return;

  const steps = [
    { key: 'pending', title: 'Pesanan Diterima', desc: 'Menunggu antrean pengerjaan.', icon: 'fa-clipboard-check' },
    { key: 'progress', title: 'Sedang Dikerjakan', desc: 'Sedang diproses.', icon: 'fa-wrench' },
    { key: 'done', title: 'Selesai', desc: 'Siap diambil/dikirim.', icon: 'fa-check-circle' }
  ];

  const currentIndex = steps.findIndex(s => s.key === order.status);
  
  let html = '<div class="timeline">';
  steps.forEach((step, index) => {
    const isDone = index <= currentIndex;
    const isActive = index === currentIndex;
    const statusClass = isDone ? (isActive ? 'active' : 'done') : '';
    
    html += `
      <div class="timeline-item ${statusClass}">
        <div class="timeline-dot"></div>
        <div class="timeline-content">
          <h4 style="color:${isActive ? 'var(--primary)' : (isDone ? 'var(--success)' : 'var(--text-muted)')};">
            <i class="fa-solid ${step.icon}"></i> ${step.title}
          </h4>
          <p style="font-size:0.9rem; color:var(--text-muted);">${step.desc}</p>
        </div>
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;
}

// ====== CHAT & HAPUS ======
async function loadChat() {
  const { data } = await supabaseClient.from('chats').select('*')
    .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`).order('created_at');
  const chatBox = document.getElementById('chatBox');
  if(!chatBox) return;
  if(!data || data.length === 0) { chatBox.innerHTML = '<p style="text-align:center; color:var(--text-muted); margin-top:20px;">Belum ada obrolan.</p>'; return; }
  chatBox.innerHTML = data.map(c => `<div class="chat-msg ${c.sender_id === currentUser.id ? 'chat-me' : 'chat-them'}">${escapeHTML(c.pesan)}</div>`).join('');
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

async function hapusSemuaChat() {
  if(!confirm("Hapus seluruh riwayat chat Anda dengan admin?")) return;
  try {
    await supabaseClient.from('chats').delete().or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);
    alert("Riwayat chat berhasil dihapus!"); loadChat();
  } catch (err) { alert("Gagal menghapus chat: " + err.message); }
}

// ====== CHECKOUT QRIS ======
function openCheckout(orderId) {
  activeOrderForPayment = orderId;
  const modal = document.getElementById('modalCheckout');
  const summary = document.getElementById('checkoutSummary');
  const qrisImg = document.getElementById('qrisImage');
  const bankInfo = document.getElementById('bankInfoText');

  qrisImg.src = settingsData.qris_image_url || '';
  bankInfo.textContent = settingsData.bank_info || 'Hubungi admin jika QRIS belum muncul.';

  supabaseClient.from('orders').select('*').eq('id', orderId).single().then(({data}) => {
    if (data) {
      const total = data.total_amount || data.biaya || 0;
      summary.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span>Layanan:</span><strong>${escapeHTML(data.layanan)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span>Catatan:</span><span>${escapeHTML(data.catatan) || '-'}</span>
        </div>
        <div style="display:flex; justify-content:space-between; border-top:1px solid var(--border); padding-top:8px; margin-top:8px;">
          <strong>Total Bayar:</strong>
          <strong style="color:var(--primary); font-size:1.2rem;">${total ? new Intl.NumberFormat('id-ID', {style:'currency',currency:'IDR'}).format(total) : 'Hubungi Admin'}</strong>
        </div>
      `;
    }
  });

  document.getElementById('proofFile').value = '';
  document.getElementById('checkoutMsg').textContent = '';
  modal.classList.remove('hidden');
}

function closeCheckout() {
  document.getElementById('modalCheckout').classList.add('hidden');
  activeOrderForPayment = null;
}

async function submitPaymentProof() {
  const file = document.getElementById('proofFile').files[0];
  const msg = document.getElementById('checkoutMsg');
  const btn = document.getElementById('btnConfirmPay');

  if (!file) { msg.style.color = 'var(--danger)'; msg.textContent = 'Pilih bukti bayar dulu!'; return; }
  if (file.size > 2 * 1024 * 1024) { msg.style.color = 'var(--danger)'; msg.textContent = 'File maksimal 2MB!'; return; }

  btn.disabled = true; btn.textContent = 'Mengunggah...'; msg.textContent = '';

  try {
    const ext = file.name.split('.').pop().toLowerCase();
    const filePath = `${activeOrderForPayment}/${Date.now()}.${ext}`;
    
    const { error: upErr } = await supabaseClient.storage.from('payment-proofs').upload(filePath, file);
    if (upErr) throw upErr;

    const { data: urlData } = supabaseClient.storage.from('payment-proofs').getPublicUrl(filePath);

    const { error: updErr } = await supabaseClient.from('orders').update({
      payment_status: 'waiting_verification',
      payment_proof_url: urlData.publicUrl,
      payment_method: 'qris'
    }).eq('id', activeOrderForPayment);

    if (updErr) throw updErr;

    await supabaseClient.from('notifications').insert({
      title: 'Konfirmasi Pembayaran Baru', message: `User ${currentUser.email} mengunggah bukti pembayaran.`, type: 'payment_verification', order_id: activeOrderForPayment
    });

    msg.style.color = 'var(--success)'; msg.textContent = '✅ Bukti terkirim! Menunggu verifikasi admin.';
    setTimeout(() => { closeCheckout(); loadRiwayat(); }, 1500);
  } catch (err) {
    msg.style.color = 'var(--danger)'; msg.textContent = 'Gagal: ' + err.message;
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Kirim Konfirmasi';
  }
}

// ====== CETAK NOTA ======
async function cetakNota(orderId) {
  const { data: order } = await supabaseClient.from('orders').select('*').eq('id', orderId).single();
  if (!order) return alert("Gagal mengambil nota.");
  const { data: items } = await supabaseClient.from('order_items').select('*').eq('order_id', orderId);
  const tgl = new Date(order.created_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
  const biaya = (order.total_amount || order.biaya) ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(order.total_amount || order.biaya) : 'Rp 0';

  let itemsHtml = '';
  if (items && items.length > 0) {
    itemsHtml = `<div class="line"></div><div class="desc"><strong>Rincian Barang:</strong></div>
      ${items.map(i => `<div class="row"><span>${escapeHTML(i.nama_produk)} x${i.qty}</span><span>Rp ${(i.subtotal).toLocaleString('id-ID')}</span></div>`).join('')}`;
  }

  const w = window.open('', '_blank');
  w.document.write(`
    <html><head><title>Nota - ${escapeHTML(order.nama)}</title>
    <style>
      body { font-family: 'Courier New', monospace; padding: 20px; }
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
        ${order.catatan ? `<div class="desc"><strong>Catatan:</strong> ${escapeHTML(order.catatan)}</div>` : ''}
        ${itemsHtml}
        <div class="line"></div>
        <div class="row total"><span>TOTAL</span><span>${biaya}</span></div>
        <div class="line"></div>
        <div class="footer">
          <p>Status: <strong>${(order.status || '-').toUpperCase()}</strong></p>
          <p>Pembayaran: <strong>${(order.payment_status || 'unpaid').toUpperCase()}</strong></p>
          <p>Terima kasih telah menggunakan layanan kami.</p>
        </div>
      </div>
      <div style="text-align:center; margin-top:20px;" class="no-print">
        <button onclick="window.print()" style="padding:10px 20px; cursor:pointer; background:#4f46e5; color:#fff; border:none; border-radius:8px;">Print / Save as PDF</button>
      </div>
    </body></html>`);
  w.document.close();
}