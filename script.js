const SUPABASE_URL = 'https://hcwtklceozkdwjsvixmh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhjd3RrbGNlb3prZHdqc3ZpeG1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNTk5NTQsImV4cCI6MjEwODgzNTk1NH0.au4ijN0B9QVMdzVz6rzoiAe6iFv_TU6KUjbZSLWEMyY';
let supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null, isLoginMode = true, allProducts = [], isLoading = false, currentPhoto = null, html5QrCode = null, currentView = 'products', realtimeChannel = null, clockInterval = null;

function startClock() { 
    if (clockInterval) clearInterval(clockInterval); 
    const updateClock = () => { 
        const now = new Date(); 
        document.getElementById('datetime-display').textContent = now.toLocaleDateString('it-IT',{weekday:'short',day:'numeric',month:'short'}) + ' - ' + now.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}); 
    }; 
    updateClock(); 
    clockInterval = setInterval(updateClock, 1000); 
}

supabaseClient.auth.onAuthStateChange(async (event, session) => { 
    if (session) { 
        currentUser = session.user; 
        document.getElementById('auth-screen').style.display = 'none'; 
        document.getElementById('app-screen').style.display = 'block'; 
        document.getElementById('user-name-display').textContent = currentUser.user_metadata?.username || currentUser.email.split('@')[0]; 
        document.getElementById('location-display').textContent = currentUser.user_metadata?.location || 'Locale Principale'; 
        startClock(); 
        await loadAndRender(); 
        initRealtime(); 
        setTimeout(checkAlerts, 2000); 
    } else { 
        currentUser = null; 
        document.getElementById('auth-screen').style.display = 'flex'; 
        document.getElementById('app-screen').style.display = 'none'; 
        if (clockInterval) clearInterval(clockInterval); 
        if (realtimeChannel) { supabaseClient.removeChannel(realtimeChannel); realtimeChannel = null; } 
    } 
});

function initRealtime() { 
    if (realtimeChannel) return; 
    realtimeChannel = supabaseClient.channel('prodotti-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'prodotti' }, () => loadAndRender()).subscribe(); 
}

function toggleAuthMode() { 
    isLoginMode = !isLoginMode; 
    document.getElementById('auth-title').textContent = isLoginMode ? 'Accedi' : 'Registrati'; 
    document.getElementById('btn-login').style.display = isLoginMode ? 'block' : 'none'; 
    document.getElementById('btn-register').style.display = isLoginMode ? 'none' : 'block'; 
    document.getElementById('group-username').style.display = isLoginMode ? 'none' : 'block'; 
    document.getElementById('group-location').style.display = isLoginMode ? 'none' : 'block'; 
    document.getElementById('toggle-text').textContent = isLoginMode ? 'Non hai un account?' : 'Hai già un account?'; 
    document.getElementById('toggle-link').textContent = isLoginMode ? 'Registrati' : 'Accedi'; 
    document.getElementById('auth-error').textContent = ''; 
}

async function handleLogin() { 
    const email = document.getElementById('auth-email').value.trim(), password = document.getElementById('auth-password').value, errorEl = document.getElementById('auth-error'); 
    errorEl.textContent = ''; 
    if (!email || !password) return errorEl.textContent = 'Inserisci email e password.'; 
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password }); 
    if (error) errorEl.textContent = 'Errore: ' + error.message; 
}

async function handleRegister() { 
    const email = document.getElementById('auth-email').value.trim(), password = document.getElementById('auth-password').value; 
    const username = document.getElementById('auth-username').value.trim(), location = document.getElementById('auth-location').value.trim(); 
    const errorEl = document.getElementById('auth-error'); 
    errorEl.textContent = ''; 
    if (!username) return errorEl.textContent = 'Inserisci un nome utente.'; 
    if (!location) return errorEl.textContent = 'Inserisci il nome del locale.'; 
    if (!email || !password) return errorEl.textContent = 'Inserisci email e password.'; 
    if (password.length < 6) return errorEl.textContent = 'Minimo 6 caratteri.'; 
    const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { data: { username, location } } }); 
    if (error) errorEl.textContent = 'Errore: ' + error.message; 
    else if (data.user && !data.session) { errorEl.style.color = '#27ae60'; errorEl.textContent = 'Registrato! Controlla la mail.'; } 
}

async function handleLogout() { await supabaseClient.auth.signOut(); }
function setStatus(msg, cls) { const el = document.getElementById('status-bar'); if (el) { el.textContent = msg; el.className = 'status-bar ' + (cls || ''); } }
function toast(msg) { const t = document.getElementById('toast'); if (t) { t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500); } }
function daysToExpiry(s) { if (!s) return 999; const t = new Date(); t.setHours(0,0,0,0); const e = new Date(s); e.setHours(0,0,0,0); return Math.ceil((e - t) / 86400000); }
function formatDate(d) { if (!d) return '—'; const p = String(d).split('T')[0].split('-'); return p.length !== 3 ? d : `${p[2]}/${p[1]}/${p[0]}`; }
function escapeHtml(s) { return s ? String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) : ''; }

function checkAlerts() { 
    if (!allProducts || allProducts.length === 0) return; 
    const alerts = allProducts.filter(p => p.alert && !p.deleted_at && daysToExpiry(p.scadenza) <= 3); 
    if (alerts.length > 0) { 
        let msg = "🔔 ATTENZIONE! Prodotti in scadenza:\n\n"; 
        alerts.forEach(p => { const d = daysToExpiry(p.scadenza); msg += `- ${p.nome} (${d < 0 ? `SCADUTO da ${Math.abs(d)} gg` : (d === 0 ? "SCADE OGGI" : `Scade tra ${d} gg`)})\n`; }); 
        alert(msg); 
    } 
}