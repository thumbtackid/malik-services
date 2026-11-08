// Tab Switch
document.querySelectorAll(".auth-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const type = tab.dataset.tab;
    document.getElementById("formLogin").classList.toggle("hidden", type !== "login");
    document.getElementById("formRegister").classList.toggle("hidden", type !== "register");
    document.getElementById("formForgot").classList.toggle("hidden", type !== "forgot");
  });
});

// LOGIN
document.getElementById("formLogin")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("btnLogin"); btn.textContent = "Memproses...";
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: document.getElementById("loginEmail").value.trim(),
    password: document.getElementById("loginPass").value
  });
  btn.textContent = "Masuk";
  if (error) return document.getElementById("loginMsg").innerText = error.message;
  
  const admin = await isAdmin(data.user.id);
  window.location.href = admin ? "./admin.html" : "./dashboard.html";
});

// REGISTER
document.getElementById("formRegister")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("btnRegister"); btn.textContent = "Mendaftar...";
  const q = document.getElementById("regQuestion").value;
  const a = document.getElementById("regAnswer").value.trim();

  const { data, error } = await supabaseClient.auth.signUp({
    email: document.getElementById("regEmail").value.trim(),
    password: document.getElementById("regPass").value,
    options: { data: { nama: document.getElementById("regNama").value.trim() } }
  });

  if (error) { btn.textContent = "Daftar"; return document.getElementById("regMsg").innerText = error.message; }

  if (data.user) {
    await supabaseClient.from("profiles").update({ 
      security_question: q, security_answer: a 
    }).eq("id", data.user.id);
  }

  btn.textContent = "Daftar";
  if (data.session) window.location.href = "./dashboard.html";
  else document.getElementById("regMsg").innerText = "✅ Cek email untuk konfirmasi.";
});

// FORGOT PASSWORD - Step 1: Cek Email & Pertanyaan
document.getElementById("btnCheckEmail")?.addEventListener("click", async () => {
  const email = document.getElementById("forgotEmail").value.trim();
  const msg = document.getElementById("forgotMsg");
  if(!email) return msg.innerText = "Masukkan email.";

  const { data: profile, error: err } = await supabaseClient.rpc('get_security_question', { user_email: email });
  
  if (err || !profile) {
    msg.innerText = "Email tidak ditemukan atau belum mengatur pertanyaan keamanan.";
    msg.style.color = "red";
    return;
  }

  document.getElementById("questionLabel").innerText = profile;
  document.getElementById("questionContainer").style.display = "block";
  document.getElementById("newPassContainer").style.display = "block";
  document.getElementById("btnResetPass").classList.remove("hidden");
  document.getElementById("btnCheckEmail").classList.add("hidden");
  msg.innerText = "";
});

// FORGOT PASSWORD - Step 2: Simpan Password Baru
document.getElementById("btnResetPass")?.addEventListener("click", async () => {
  const email = document.getElementById("forgotEmail").value.trim();
  const answer = document.getElementById("forgotAnswer").value.trim();
  const newPass = document.getElementById("forgotNewPass").value;
  const msg = document.getElementById("forgotMsg");
  const btn = document.getElementById("btnResetPass");

  if (!answer || !newPass) return msg.innerText = "Isi jawaban dan password baru.";
  if (newPass.length < 6) return msg.innerText = "Password minimal 6 karakter.";

  btn.textContent = "Menyimpan...";
  btn.disabled = true;

  // Panggil RPC untuk reset password (Pastikan kamu sudah membuat fungsi ini di Supabase)
  const { data, error } = await supabaseClient.rpc('reset_password_with_security_question', { 
    user_email: email, 
    user_answer: answer, 
    new_password: newPass 
  });

  btn.textContent = "Simpan Password Baru";
  btn.disabled = false;

  if (error || data === false) {
    msg.style.color = "red";
    msg.innerText = "Jawaban keamanan salah atau terjadi kesalahan.";
  } else {
    msg.style.color = "green";
    msg.innerText = "✅ Password berhasil diubah! Silakan login.";
    setTimeout(() => { window.location.href = "./login.html"; }, 2000);
  }
});