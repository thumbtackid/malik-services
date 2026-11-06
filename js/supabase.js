const SUPABASE_URL = "https://nudlxdmfroehbfwhqglv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51ZGx4ZG1mcm9laGJmd2hxZ2x2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4NTgxMzEsImV4cCI6MjEwOTQzNDEzMX0.idsWDwquxV2bhH7yNGEV47JOmAA8i471BhwTXC_xZb8";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function getSession() { const { data: { session } } = await supabaseClient.auth.getSession(); return session; }
async function logout() { await supabaseClient.auth.signOut(); window.location.href = "./index.html"; }
async function isAdmin(userId) {
  const { data } = await supabaseClient.from("profiles").select("role").eq("id", userId).single();
  return data?.role === "admin";
}
async function requireAuth() {
  const session = await getSession();
  if (!session) { window.location.href = "./login.html"; return null; }
  return session;
}
async function requireAdmin() {
  const session = await requireAuth();
  if (!session) return null;
  const admin = await isAdmin(session.user.id);
  if (!admin) { window.location.href = "./dashboard.html"; return null; }
  return session;
}

async function loadLogo() {
  const { data } = await supabaseClient.from('settings').select('logo_url, nama_web').eq('id', 1).single();
  if(data) {
    document.querySelectorAll('.brand-logo').forEach(img => img.src = data.logo_url);
    document.querySelectorAll('.brand-text').forEach(el => el.textContent = data.nama_web);
  }
}
document.addEventListener("DOMContentLoaded", loadLogo);
