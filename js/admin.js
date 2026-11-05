(async () => {
  const session = await requireAdmin();
  if (!session) return;

  const user = session.user;
  const nama = user.user_metadata?.nama || "Admin";
  document.getElementById("userName").textContent = nama;
  document.getElementById("userEmail").textContent = user.email;
  document.getElementById("avatarNama").textContent = nama[0].toUpperCase();

  async function muat() {
    const tbody = document.getElementById("tableOrders");
    tbody.innerHTML = '<tr><td colspan="7" class="muted center">Memuat...</td></tr>';

    const { data, error } = await supabaseClient
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      tbody.innerHTML = `<tr><td colspan="7" class="muted center">Error: ${error.message}</td></tr>`;
      return;
    }

    // Stats
    document.getElementById("statTotal").textContent   = data.length;
    document.getElementById("statPending").textContent  = data.filter(o => o.status === "pending").length;
    document.getElementById("statProgress").textContent = data.filter(o => o.status === "progress").length;
    document.getElementById("statDone").textContent     = data.filter(o => o.status === "done").length;

    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted center">Belum ada pesanan.</td></tr>';
      return;
    }

    const label = { pending: "Menunggu", progress: "Diproses", done: "Selesai", cancel: "Dibatalkan" };

    tbody.innerHTML = data.map(o => `
      <tr>
        <td>${new Date(o.created_at).toLocaleDateString("id-ID")}</td>
        <td><strong>${o.nama}</strong></td>
        <td>${o.telepon}</td>
        <td>${o.layanan}</td>
        <td>${o.alamat}</td>
        <td><span class="status status-${o.status}">${label[o.status] || o.status}</span></td>
        <td>
          <select data-id="${o.id}" class="ubahStatus">
            <option value="pending"  ${o.status==="pending"?"selected":""}>Menunggu</option>
            <option value="progress" ${o.status==="progress"?"selected":""}>Diproses</option>
            <option value="done"     ${o.status==="done"?"selected":""}>Selesai</option>
            <option value="cancel"   ${o.status==="cancel"?"selected":""}>Batalkan</option>
          </select>
        </td>
      </tr>
    `).join("");

    // Event ubah status
    document.querySelectorAll(".ubahStatus").forEach(sel => {
      sel.addEventListener("change", async (e) => {
        const id = e.target.dataset.id;
        const status = e.target.value;
        const { error } = await supabaseClient
          .from("orders").update({ status }).eq("id", id);
        if (error) { alert("Gagal update: " + error.message); return; }
        muat();
      });
    });
  }

  muat();
})();
