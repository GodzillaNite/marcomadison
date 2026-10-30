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
        if (p.foto) { currentPhoto = p.foto; document.getElementById('photo-preview').src = p.foto; document.getElementById('photo-container').style.display = 'block'; } 
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
    m.addEventListener('click', e => { 
        if (e.target === m) m.classList.remove('show'); 
    }); 
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
    else { try { const d = JSON.parse(text); if(d.app === 'TracciaFood') { const p = allProducts.find(x => x.nome === d.nome && x.lotto === d.lotto); if(p) productId = p.id; } } catch(e) {} } 
    if (!productId) { out.innerHTML = `<div class="card warning"><h3>QR non valido</h3></div><button class="btn btn-primary" style="width:100%" onclick="switchView('scanner')">📷 Riprova</button>`; return; } 
    const { data: p } = await supabaseClient.from('prodotti').select('*').eq('id', productId).single(); 
    if (!p) { out.innerHTML = `<div class="card urgent"><h3>Prodotto non trovato</h3></div><button class="btn btn-primary" style="width:100%" onclick="switchView('scanner')">📷 Riprova</button>`; return; } 
    const days = daysToExpiry(p.scadenza); let status = `✅ Valido - scade tra ${days} gg`, cls = 'ok'; 
    if (days < 0) { status = `❌ SCADUTO da ${Math.abs(days)} gg`; cls = 'urgent'; } 
    else if (days === 0) { status = `⚠️ SCADE OGGI`; cls = 'urgent'; } 
    else if (days <= 3) { status = `⚠️ Scade tra ${days} gg`; cls = 'warning'; } 
    out.innerHTML = `<div class="card ${cls}"><h3>${escapeHtml(p.nome)}</h3><div class="meta"><strong>Lotto:</strong> ${escapeHtml(p.lotto||'—')}<br><strong>Prep:</strong> ${formatDate(p.preparazione)} | <strong>Scade:</strong> ${formatDate(p.scadenza)}</div><div style="margin-top:12px;font-weight:700;font-size:15px">${status}</div></div><button class="btn btn-primary" style="width:100%" onclick="switchView('scanner')">📷 Scansiona un altro</button>`; 
}