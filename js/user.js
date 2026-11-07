let currentUser;
let settingsData = {};
let activeOrderForPayment = null;

(async () => {
  const session = await requireAuth(); if(!session) return;
  currentUser = session.user;

  const userNameEl = document.getElementById("userName");
  if(userNameEl) userNameEl.textContent = currentUser.email;

  const orderNamaEl = document.getElementById("orderNama");
  if(orderNamaEl) orderNamaEl.value = currentUser.user_metadata?.nama || "";

  // Ambil settings (QRIS, bank info)
  const { data: set } = await supabaseClient.from('settings').select('*').eq('id', 1).single();
  settingsData = set || {};

  // Load layanan
  const { data: services } = await supabaseClient.from('services').select('*');
  const orderLayananEl = document.getElementById('orderLayanan');
  if(orderLayananEl && services) {
    orderLayananEl.innerHTML = services.map(s => `<option>${s.nama}</option>`).join('');
  }

  // Submit order
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

      // Notif ke admin (web)
      await supabaseClient.from('notifications').insert({
        title: 'Pesanan Baru',
        message: `Pesanan baru dari ${document.getElementById("orderNama").value} - ${document.getElementById("orderLayanan").value}`,
        type: 'new_order'
      });

      alert("Pesanan Terkirim! Silakan lanjut ke pembayaran.");
      e.target.reset();
      btn.textContent = "Kirim Pesanan";
      showTab('riwayat');
    });
  }

  // Real-time chat
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
    
    // PERBAIKAN: Tombol bayar muncul jika belum lunas / ditolak, selama tidak dibatalkan
    const needPay = (o.payment_status === 'unpaid' || o.payment_status === 'rejected' || !o.payment_status) && o.status !== 'cancel';
    const waitingVerify = o.payment_status === 'waiting_verification';

    return `
    <div class="riwayat-card">
      <div style="flex:1; min-width:250px;">
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
          <span class="badge ${badge[o.status] || 'badge-pending'}">${label[o.status] || o.status}</span>
          <span class="badge ${pb.class}">${pb.text}</span>
        </div>
        <strong style="font-size:1.05rem;">${o.layanan} - ${o.catatan || 'Tanpa keterangan'}</strong><br>
        <small style="color:var(--text-muted);">${new Date(o.created_at).toLocaleString('id-ID')}</small><br>
        <small style="color:var(--text-main); font-weight:600;">Total: ${total ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(total) : 'Belum ditentukan'}</small>
        ${o.payment_status === 'rejected' && o.payment_proof_url ? `<br><small style="color:var(--danger);">Bukti ditolak, silakan upload ulang.</small>` : ''}
      </div>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${needPay ? `<button class="btn btn-primary" onclick="openCheckout('${o.id}')"><i class="fa-solid fa-qrcode"></i> Bayar Sekarang</button>` : ''}
        ${waitingVerify ? `<span style="font-size:0.85rem; color:var(--warning);"><i class="fa-solid fa-hourglass-half"></i> Menunggu verifikasi admin</span>` : ''}
        ${o.status === 'done' && o.payment_status === 'paid' ? `<button class="btn btn-outline" onclick="cetakNota('${o.id}')"><i class="fa-solid fa-print"></i> Nota</button>` : ''}
      </div>
    </div>
  `}).join("");
}

// ===== CHECKOUT QRIS =====
function openCheckout(orderId) {
  activeOrderForPayment = orderId;
  const modal = document.getElementById('modalCheckout');
  const summary = document.getElementById('checkoutSummary');
  const qrisImg = document.getElementById('qrisImage');
  const bankInfo = document.getElementById('bankInfoText');

  qrisImg.src = settingsData.qris_image_url || '';
  bankInfo.textContent = settingsData.bank_info || 'Hubungi admin jika QRIS belum muncul.';

  // Ambil detail order untuk summary
  supabaseClient.from('orders').select('*').eq('id', orderId).single().then(({data}) => {
    if (data) {
      const total = data.total_amount || data.biaya || 0;
      summary.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span>Layanan:</span><strong>${data.layanan}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span>Keluhan:</span><span>${data.catatan || '-'}</span>
        </div>
        <div style="display:flex; justify-content:space-between; border-top:1px solid var(--border); padding-top:8px; margin-top:8px;">
          <strong>Total Bayar:</strong>
          <strong style="color:var(--primary); font-size:1.2rem;">${total ? new Intl.NumberFormat('id-ID', {style:'currency',currency:'IDR'}).format(total) : 'Hubungi Admin'}</strong>
        </div>
      `;
    }
  });

  document.getElementById('proofFile').value = '';
  document.getElementById('checkoutNote').value = '';
  document.getElementById('checkoutMsg').textContent = '';
  modal.classList.remove('hidden');
}

function closeCheckout() {
  document.getElementById('modalCheckout').classList.add('hidden');
  activeOrderForPayment = null;
}

async function submitPaymentProof() {
  const file = document.getElementById('proofFile').files[0];
  const note = document.getElementById('checkoutNote').value;
  const msg = document.getElementById('checkoutMsg');
  const btn = document.getElementById('btnConfirmPay');

  if (!file) { msg.style.color = 'var(--danger)'; msg.textContent = 'Pilih bukti bayar dulu!'; return; }
  if (file.size > 2 * 1024 * 1024) { msg.style.color = 'var(--danger)'; msg.textContent = 'File maksimal 2MB!'; return; }

  btn.disabled = true;
  btn.textContent = 'Mengunggah...';
  msg.textContent = '';

  try {
    // Upload ke Supabase Storage
    const ext = file.name.split('.').pop();
    const filePath = `${activeOrderForPayment}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabaseClient.storage.from('payment-proofs').upload(filePath, file, { upsert: true });
    if (upErr) throw upErr;

    const { data: urlData } = supabaseClient.storage.from('payment-proofs').getPublicUrl(filePath);

    // Update order
    const { error: updErr } = await supabaseClient.from('orders').update({
      payment_status: 'waiting_verification',
      payment_proof_url: urlData.publicUrl,
      payment_method: 'qris',
      payment_note: note
    }).eq('id', activeOrderForPayment);

    if (updErr) throw updErr;

    // Notif ke admin
    await supabaseClient.from('notifications').insert({
      title: 'Konfirmasi Pembayaran Baru',
      message: `User ${currentUser.email} mengunggah bukti pembayaran. Menunggu verifikasi.`,
      type: 'payment_verification',
      order_id: activeOrderForPayment
    });

    msg.style.color = 'var(--success)';
    msg.textContent = '✅ Bukti terkirim! Menunggu verifikasi admin.';
    setTimeout(() => { closeCheckout(); loadRiwayat(); }, 1500);
  } catch (err) {
    msg.style.color = 'var(--danger)';
    msg.textContent = 'Gagal: ' + err.message;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Kirim Konfirmasi';
  }
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

// ===== CETAK NOTA =====
async function cetakNota(orderId) {
  const { data: order } = await supabaseClient.from('orders').select('*').eq('id', orderId).single();
  if (!order) return alert("Gagal mengambil nota.");
  const { data: items } = await supabaseClient.from('order_items').select('*').eq('order_id', orderId);
  const tgl = new Date(order.created_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
  const biaya = (order.total_amount || order.biaya) ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(order.total_amount || order.biaya) : 'Rp 0';

  let itemsHtml = '';
  if (items && items.length > 0) {
    itemsHtml = `<div class="line"></div><div class="desc"><strong>Rincian Barang:</strong></div>
      ${items.map(i => `<div class="row"><span>${i.nama_produk} x${i.qty}</span><span>Rp ${(i.subtotal).toLocaleString('id-ID')}</span></div>`).join('')}`;
  }

  const w = window.open('', '_blank');
  w.document.write(`
    <html><head><title>Nota - ${order.nama}</title>
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