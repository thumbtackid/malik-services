// ===== TAB SWITCH =====
document.querySelectorAll(".auth-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const isLogin = tab.dataset.tab === "login";
    document.getElementById("formLogin").classList.toggle("hidden", !isLogin);
    document.getElementById("formRegister").classList.toggle("hidden", isLogin);
  });
});

// ===== LOGIN =====
const formLogin = document.getElementById("formLogin");
if (formLogin) {
  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btnLogin");
    const msg = document.getElementById("loginMsg");
    btn.disabled = true; btn.textContent = "Memproses...";
    msg.className = "auth-msg"; msg.textContent = "";

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: document.getElementById("loginEmail").value.trim(),
      password: document.getElementById("loginPass").value
    });

    btn.disabled = false; btn.textContent = "Masuk";

    if (error) {
      msg.className = "auth-msg error";
      msg.style.color = "red";
      msg.textContent = error.message;
      return;
    }

    // Redirect berdasarkan role
    const admin = await isAdmin(data.user.id);
    window.location.href = admin ? "./admin.html" : "./dashboard.html";
  });
}

// ===== REGISTER =====
const formRegister = document.getElementById("formRegister");
if (formRegister) {
  formRegister.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btnRegister");
    const msg = document.getElementById("regMsg");
    btn.disabled = true; btn.textContent = "Mendaftar...";
    msg.className = "auth-msg"; msg.textContent = "";

    const nama  = document.getElementById("regNama").value.trim();
    const email = document.getElementById("regEmail").value.trim();
    const pass  = document.getElementById("regPass").value;

    const { data, error } = await supabaseClient.auth.signUp({
      email, password: pass,
      options: { data: { nama } }
    });

    btn.disabled = false; btn.textContent = "Daftar";

    if (error) {
      msg.className = "auth-msg error";
      msg.style.color = "red";
      msg.textContent = error.message;
      return;
    }

    // Kalau email confirmation dimatikan di Supabase:
    if (data.session) {
      window.location.href = "./dashboard.html";
    } else {
      msg.className = "auth-msg success";
      msg.style.color = "green";
      msg.textContent = "✅ Cek email kamu untuk konfirmasi pendaftaran.";
    }
  });
}

const btnLogout = document.getElementById("btnLogout");
if (btnLogout) btnLogout.addEventListener("click", logout);