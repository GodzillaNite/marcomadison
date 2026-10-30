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
    else if (data.user && !data.session) { errorEl.style.color = '#10b981'; errorEl.textContent = 'Registrato! Controlla la mail.'; } 
}

async function handleLogout() { await supabaseClient.auth.signOut(); }

function setStatus(msg, cls) { 
    const el = document.getElementById('status-bar'); 
    if (el) { el.textContent = msg; el.className = 'status-bar ' + (cls || ''); } 
}

function toast(msg) { 
    const t = document.getElementById('toast'); 
    if (t) { t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500); } 
}

function daysToExpiry(s) { 
    if (!s) return 999; 
    const t = new Date(); t.setHours(0,0,0,0); 
    const e = new Date(s); e.setHours(0,0,0,0); 
    return Math.ceil((e - t) / 86400000); 
}

function formatDate(d) { 
    if (!d) return '—'; 
    const p = String(d).split('T')[0].split('-'); 
    return p.length !== 3 ? d : `${p[2]}/${p[1]}/${p[0]}`; 
}

function escapeHtml(s) { 
    return s ? String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) : ''; 
}

function checkAlerts() { 
    if (!allProducts || allProducts.length === 0) return; 
    const alerts = allProducts.filter(p => p.alert && !p.deleted_at && daysToExpiry(p.scadenza) <= 3); 
    if (alerts.length > 0) { 
        let msg = "🔔 ATTENZIONE! Prodotti in scadenza:\n\n"; 
        alerts.forEach(p => { 
            const d = daysToExpiry(p.scadenza); 
            msg += `- ${p.nome} (${d < 0 ? `SCADUTO da ${Math.abs(d)} gg` : (d === 0 ? "SCADE OGGI" : `Scade tra ${d} gg`)})\n`; 
        }); 
        alert(msg); 
    } 
}async function loadAndRender() {
    if (isLoading || !currentUser) return;
    isLoading = true;
    try {
        const userLocation = currentUser.user_metadata?.location || 'Locale Principale';
        const { data, error } = await supabaseClient.from('prodotti').select('*').eq('location', userLocation).order('scadenza', { ascending: true });
        if (error) throw error;
        allProducts = data || [];
        if (currentView === 'products') {
            const active = allProducts.filter(p => !p.deleted_at);
            setStatus('✅ Connesso — ' + active.length + ' prodotti', 'online');
            renderProductList(active);
            updateStats(active);
        } else if (currentView === 'trash') {
            renderTrashList(allProducts.filter(p => p.deleted_at));
        }
    } catch(e) {
        setStatus('❌ Errore DB: ' + e.message, 'error');
    } finally {
        isLoading = false;
    }
}

function updateStats(products) {
    let urgent = 0, expired = 0;
    products.forEach(p => {
        const d = daysToExpiry(p.scadenza);
        if (d < 0) expired++; else if (d <= 3) urgent++;
    });
    document.getElementById('stat-total').textContent = products.length;
    document.getElementById('stat-urgent').textContent = urgent;
    document.getElementById('stat-expired').textContent = expired;
}

function renderProductList(products) {
    const search = document.getElementById('search').value.toLowerCase();
    const list = document.getElementById('products-list');
    const filtered = products.filter(p => (p.nome||'').toLowerCase().includes(search) || (p.lotto||'').toLowerCase().includes(search) || (p.preparazione?formatDate(p.preparazione).includes(search):false) || (p.scadenza?formatDate(p.scadenza).includes(search):false));
    
    if (filtered.length === 0) return list.innerHTML = `<div class="empty"><div class="big">📦</div><p>Nessun prodotto trovato.</p></div>`;
    
    list.innerHTML = filtered.map(p => {
        const days = daysToExpiry(p.scadenza);
        let cls = 'ok', badge = '', alertBadge = p.alert ? `<span class="badge bell">🔔</span>` : '';
        if (!p.scadenza) badge = '';
        else if (days < 0) { cls = 'urgent'; badge = `<span class="badge red">SCADUTO</span>`; }
        else if (days === 0) { cls = 'urgent'; badge = `<span class="badge red">OGGI</span>`; }
        else if (days <= 3) { cls = 'warning'; badge = `<span class="badge orange">${days}g</span>`; }
        else badge = `<span class="badge green">${days}g</span>`;
        
        return `<div class="card ${cls}">
            <h3>${escapeHtml(p.nome)} ${alertBadge} ${badge}</h3>
            <div class="meta">
                <strong>Lotto:</strong> ${escapeHtml(p.lotto||'—')}<br>
                <strong>Prep:</strong> ${formatDate(p.preparazione)} | <strong>Scade:</strong> ${formatDate(p.scadenza)}<br>
                ${p.quantita ? `<strong>Q.tà:</strong> ${escapeHtml(p.quantita)}<br>` : ''}
                ${p.note ? `<strong>Note:</strong> ${escapeHtml(p.note)}` : ''}
            </div>
            ${p.foto ? `<img src="${p.foto}" alt="Foto prodotto">` : ''}
            <div class="actions">
                <button class="btn btn-success" onclick="showQR(${p.id})">📱 QR</button>
                <button class="btn btn-primary" onclick="openForm(${p.id})">✏️ Modifica</button>
                <button class="btn btn-danger" onclick="softDeleteProduct(${p.id})">🗑️ Elimina</button>
            </div>
        </div>`;
    }).join('');
}

function renderTrashList(products) {
    const list = document.getElementById('trash-list');
    if (products.length === 0) return list.innerHTML = `<div class="empty"><div class="big">🗑️</div><p>Il cestino è vuoto.</p></div>`;
    
    list.innerHTML = products.map(p => `<div class="card deleted">
        <h3>${escapeHtml(p.nome)} <span class="badge gray">ELIMINATO</span></h3>
        <div class="meta">
            <strong>Lotto:</strong> ${escapeHtml(p.lotto||'—')}<br>
            <strong>Scadenza:</strong> ${formatDate(p.scadenza)}<br>
            <small>Eliminato il: ${formatDate(p.deleted_at)}</small>
        </div>
        <div class="actions">
            <button class="btn btn-restore" onclick="restoreProduct(${p.id})">♻️ Ripristina</button>
        </div>
    </div>`).join('');
}

function openForm(id) {
    currentPhoto = null;
    document.getElementById('photo-container').style.display = 'none';
    document.getElementById('f-foto').value = '';
    document.getElementById('product-form').reset();
    document.getElementById('product-id').value = '';
    
    if (id) {
        const p = allProducts.find(x => x.id === id);
        if (!p) return;
        document.getElementById('form-title').textContent = '✏️ Modifica';
        document.getElementById('product-id').value = p.id;
        document.getElementById('f-nome').value = p.nome;
        document.getElementById('f-lotto').value = p.lotto || '';
        document.getElementById('f-preparazione').value = p.preparazione ? String(p.preparazione).split('T')[0] : '';
        document.getElementById('f-scadenza').value = p.scadenza ? String(p.scadenza).split('T')[0] : '';
        document.getElementById('f-quantita').value = p.quantita || '';
        document.getElementById('f-note').value = p.note || '';
        document.getElementById('f-alert').checked = p.alert || false;
        if (p.foto) {
            currentPhoto = p.foto;
            document.getElementById('photo-preview').src = p.foto;
            document.getElementById('photo-container').style.display = 'block';
        }
    } else {
        document.getElementById('form-title').textContent = '➕ Nuovo';
        document.getElementById('f-preparazione').value = new Date().toISOString().split('T')[0];
        document.getElementById('f-alert').checked = true;
    }
    document.getElementById('modal-form').classList.add('show');
}

function closeForm() { document.getElementById('modal-form').classList.remove('show'); }

function previewPhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;
            if (width > height && width > 800) { height = height * 800 / width; width = 800; }
            else if (height > 800) { width = width * 800 / height; height = 800; }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            currentPhoto = canvas.toDataURL('image/jpeg', 0.75);
            document.getElementById('photo-preview').src = currentPhoto;
            document.getElementById('photo-container').style.display = 'block';
        };
        img.src = reader.result;
    };
    reader.readAsDataURL(file);
}

function removePhoto() {
    currentPhoto = null;
    document.getElementById('f-foto').value = '';
    document.getElementById('photo-container').style.display = 'none';
}

async function saveProduct(e) {
    e.preventDefault();
    const nome = document.getElementById('f-nome').value.trim();
    if (!nome) return toast('⚠️ Il nome è obbligatorio');
    
    const id = document.getElementById('product-id').value;
    document.getElementById('save-btn').textContent = '⏳...';
    
    const obj = {
        nome: nome,
        lotto: document.getElementById('f-lotto').value.trim() || null,
        preparazione: document.getElementById('f-preparazione').value || null,
        scadenza: document.getElementById('f-scadenza').value || null,
        quantita: document.getElementById('f-quantita').value.trim() || null,
        note: document.getElementById('f-note').value.trim() || null,
        foto: currentPhoto || null,
        alert: document.getElementById('f-alert').checked,
        user_id: currentUser.id,
        location: currentUser.user_metadata?.location || 'Locale Principale'
    };
    
    let error;
    if (id) {
        const { id: _, ...updateData } = obj;
        const { error: updateError } = await supabaseClient.from('prodotti').update(updateData).eq('id', parseInt(id));
        error = updateError;
    } else {
        const { error: insertError } = await supabaseClient.from('prodotti').insert([obj]);
        error = insertError;
    }
    
    document.getElementById('save-btn').textContent = '💾 Salva';
    if (error) return toast('❌ Errore: ' + error.message);
    
    closeForm();
    toast(id ? '✅ Aggiornato' : '✅ Salvato');
    loadAndRender();
}

async function softDeleteProduct(id) {
    if (!confirm('Spostare nel cestino?')) return;
    await supabaseClient.from('prodotti').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    toast('🗑️ Spostato');
    loadAndRender();
}

async function restoreProduct(id) {
    await supabaseClient.from('prodotti').update({ deleted_at: null }).eq('id', id);
    toast('✅ Ripristinato');
    loadAndRender();
}

async function showQR(id) {
    const { data: p } = await supabaseClient.from('prodotti').select('*').eq('id', id).single();
    if (!p) return toast('❌ Non trovato');
    const qrText = "TF-" + p.id;
    const container = document.getElementById('qr-container');
    container.innerHTML = '';
    new QRCode(container, { text: qrText, width: 250, height: 250, colorDark: "#2c3e50", colorLight: "#ffffff" });
    const details = document.getElementById('qr-print-details');
    details.innerHTML = `<strong>${escapeHtml(p.nome)}</strong>${p.lotto ? `Lotto: ${escapeHtml(p.lotto)}<br>` : ''}${p.scadenza ? `Scadenza: ${formatDate(p.scadenza)}` : ''}`;
    document.getElementById('modal-qr').classList.add('show');
}

function closeModal(id) { document.getElementById(id).classList.remove('show'); }

document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); });
});

function switchView(view) {
    currentView = view;
    document.getElementById('view-products').style.display = view === 'products' ? 'block' : 'none';
    document.getElementById('view-scanner').style.display = view === 'scanner' ? 'block' : 'none';
    document.getElementById('view-trash').style.display = view === 'trash' ? 'block' : 'none';
    document.getElementById('nav-products').classList.toggle('active', view === 'products');
    document.getElementById('nav-scanner').classList.toggle('active', view === 'scanner');
    document.getElementById('nav-trash').classList.toggle('active', view === 'trash');
    if (view === 'scanner') startScanner(); else stopScanner();
    if (view === 'trash') loadAndRender(); else if (view === 'products') loadAndRender();
}

function startScanner() {
    if (html5QrCode) return;
    document.getElementById('scan-result').innerHTML = '';
    html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => { stopScanner(); handleScan(decodedText); }, () => {}
    ).then(() => document.getElementById('stop-scan').style.display = 'block')
     .catch(err => { document.getElementById('scan-result').innerHTML = `<div class="card urgent">⚠️ Errore fotocamera</div>`; html5QrCode = null; });
}

function stopScanner() {
    if (html5QrCode) html5QrCode.stop().then(() => { html5QrCode.clear(); html5QrCode = null; document.getElementById('stop-scan').style.display = 'none'; }).catch(() => {});
}

async function handleScan(text) {
    const out = document.getElementById('scan-result');
    out.innerHTML = '<div class="loading">⏳ Ricerca...</div>';
    let productId = null;
    if (text.startsWith("TF-")) productId = parseInt(text.replace("TF-", ""));
    else {
        try { const d = JSON.parse(text); if(d.app === 'TracciaFood') { const p = allProducts.find(x => x.nome === d.nome && x.lotto === d.lotto); if(p) productId = p.id; } } catch(e) {}
    }
    if (!productId) { out.innerHTML = `<div class="card warning"><h3>QR non valido</h3></div><button class="btn btn-primary" style="width:100%" onclick="switchView('scanner')">📷 Riprova</button>`; return; }
    const { data: p } = await supabaseClient.from('prodotti').select('*').eq('id', productId).single();
    if (!p) { out.innerHTML = `<div class="card urgent"><h3>Prodotto non trovato</h3></div><button class="btn btn-primary" style="width:100%" onclick="switchView('scanner')">📷 Riprova</button>`; return; }
    const days = daysToExpiry(p.scadenza); let status = `✅ Valido - scade tra ${days} gg`, cls = 'ok';
    if (days < 0) { status = `❌ SCADUTO da ${Math.abs(days)} gg`; cls = 'urgent'; }
    else if (days === 0) { status = `⚠️ SCADE OGGI`; cls = 'urgent'; }
    else if (days <= 3) { status = `⚠️ Scade tra ${days} gg`; cls = 'warning'; }
    out.innerHTML = `<div class="card ${cls}"><h3>${escapeHtml(p.nome)}</h3><div class="meta"><strong>Lotto:</strong> ${escapeHtml(p.lotto||'—')}<br><strong>Prep:</strong> ${formatDate(p.preparazione)} | <strong>Scade:</strong> ${formatDate(p.scadenza)}<br>${p.quantita?`<strong>Q.tà:</strong> ${escapeHtml(p.quantita)}<br>`:''}${p.note?`<strong>Note:</strong> ${escapeHtml(p.note)}`:''}</div><div style="margin-top:12px;font-weight:700;font-size:15px">${status}</div></div><button class="btn btn-primary" style="width:100%" onclick="switchView('scanner')">📷 Scansiona un altro</button>`;
}