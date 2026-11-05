(async () => {
  const session = await requireAuth();
  if (!session) return;

  // Isi info user
  const user = session.user;
  const nama = user.user_metadata?.nama || user.email.split("@")[0];
  document.getElementById("userName").textContent = nama;
  document.getElementById("userEmail").textContent = user.email;
  document.getElementById("avatarNama").textContent = nama[0].toUpperCase();
  document.getElementById("orderNama").value = nama;

  // ===== NAV MENU =====
  const sectionOrder = document.getElementById("sectionOrder");
  const sectionRiwayat = document.getElementById("sectionRiwayat");
  const pageTitle = document.getElementById("pageTitle");

  document.getElementById("menuOrder").addEventListener("click", (e) => {
    e.preventDefault();
    sectionOrder.classList.remove("hidden");
    sectionRiwayat.classList.add("hidden");
    pageTitle.textContent = "Pesan Baru";
  });
  document.getElementById("menuRiwayat").addEventListener("click", (e) => {
    e.preventDefault();
    sectionOrder.classList.add("hidden");
    sectionRiwayat.classList.remove("hidden");
    pageTitle.textContent = "Riwayat";
    muatRiwayat();
  });

  // ===== SUBMIT ORDER =====
  document.getElementById("formOrder").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btnOrder");
    btn.disabled = true; btn.textContent = "Mengirim...";

    const { error } = await supabaseClient.from("orders").insert({
      user_id: user.id,
      nama:    document.getElementById("orderNama").value.trim(),
      telepon: document.getElementById("orderTelepon").value.trim(),
      alamat:  document.getElementById("orderAlamat").value.trim(),
      layanan: document.getElementById("orderLayanan").value,
      catatan: document.getElementById("orderCatatan").value.trim(),
      status:  "pending"
    });

    btn.disabled = false; btn.textContent = "Kirim Pesanan";

    if (error) {
      alert("Gagal kirim: " + error.message);
      return;
    }

    alert("✅ Pesanan terkirim!");
    e.target.reset();
    document.getElementById("orderNama").value = nama;
    muatRiwayat();
  });

  // ===== MUAT RIWAYAT =====
  async function muatRiwayat() {
    const list = document.getElementById("riwayatList");
    list.innerHTML = '<p class="muted">Memuat...</p>';

    const { data, error } = await supabaseClient
      .from("orders")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      list.innerHTML = `<p class="muted">Gagal memuat: ${error.message}</p>`;
      return;
    }
    if (!data.length) {
      list.innerHTML = '<p class="muted">Belum ada pesanan.</p>';
      return;
    }

    const label = { pending: "Menunggu", progress: "Diproses", done: "Selesai", cancel: "Dibatalkan" };
    list.innerHTML = data.map(o => `
      <div class="item">
        <div class="item-info">
          <strong>${o.layanan}</strong>
          <small>${o.alamat} • ${new Date(o.created_at).toLocaleString("id-ID")}</small>
        </div>
        <span class="status status-${o.status}">${label[o.status] || o.status}</span>
      </div>
    `).join("");
  }

  muatRiwayat();
})();
