// ==========================================
// KONFIGURASI SUPABASE
// Ganti dengan milikmu nanti (panduan di bawah)
// ==========================================
const SUPABASE_URL = "https://nudlxdmfroehbfwhqglv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51ZGx4ZG1mcm9laGJmd2hxZ2x2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4NTgxMzEsImV4cCI6MjEwOTQzNDEzMX0.idsWDwquxV2bhH7yNGEV47JOmAA8i471BhwTXC_xZb8";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== HELPER AUTH =====
async function getSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  return session;
}

async function getUser() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  return user;
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = "./index.html";
}

// ===== HELPER: cek role admin dari tabel profiles =====
async function isAdmin(userId) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (error || !data) return false;
  return data.role === "admin";
}

// ===== HELPER: proteksi halaman =====
async function requireAuth(redirectTo = "./login.html") {
  const session = await getSession();
  if (!session) { window.location.href = redirectTo; return null; }
  return session;
}

async function requireAdmin() {
  const session = await requireAuth();
  if (!session) return null;
  const admin = await isAdmin(session.user.id);
  if (!admin) { window.location.href = "./dashboard.html"; return null; }
  return session;
}
