async function loadAndRender() { 
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
    products.forEach(p => { const d = daysToExpiry(p.scadenza); if (d < 0) expired++; else if (d <= 3) urgent++; }); 
    document.getElementById('stat-total').textContent = products.length; 
    document.getElementById('stat-urgent').textContent = urgent; 
    document.getElementById('stat-expired').textContent = expired; 
}

function renderProductList(products) { 
    const search = document.getElementById('search').value.toLowerCase(), list = document.getElementById('products-list'); 
    const filtered = products.filter(p => (p.nome||'').toLowerCase().includes(search) || (p.lotto||'').toLowerCase().includes(search)); 
    if (filtered.length === 0) return list.innerHTML = `<div class="empty"><div class="big">📦</div><p>Nessun prodotto trovato.</p></div>`; 
    list.innerHTML = filtered.map(p => { 
        const days = daysToExpiry(p.scadenza); 
        let cls = 'ok', badge = '', alertBadge = p.alert ? `<span class="badge bell">🔔</span>` : ''; 
        if (!p.scadenza) badge = ''; 
        else if (days < 0) { cls = 'urgent'; badge = `<span class="badge red">SCADUTO</span>`; } 
        else if (days === 0) { cls = 'urgent'; badge = `<span class="badge red">OGGI</span>`; } 
        else if (days <= 3) { cls = 'warning'; badge = `<span class="badge orange">${days}g</span>`; } 
        else badge = `<span class="badge green">${days}g</span>`; 
        return `<div class="card ${cls}"><h3>${escapeHtml(p.nome)} ${alertBadge} ${badge}</h3><div class="meta"><strong>Lotto:</strong> ${escapeHtml(p.lotto||'—')}<br><strong>Scade:</strong> ${formatDate(p.scadenza)}</div>${p.foto?`<img src="${p.foto}">`:''}<div class="actions"><button class="btn btn-success" onclick="showQR(${p.id})">📱 QR</button><button class="btn btn-primary" onclick="openForm(${p.id})">✏️ Modifica</button><button class="btn btn-danger" onclick="softDeleteProduct(${p.id})">🗑️ Elimina</button></div></div>`; 
    }).join(''); 
}

function renderTrashList(products) { 
    const list = document.getElementById('trash-list'); 
    if (products.length === 0) return list.innerHTML = `<div class="empty"><div class="big">🗑️</div><p>Il cestino è vuoto.</p></div>`; 
    list.innerHTML = products.map(p => `<div class="card deleted"><h3>${escapeHtml(p.nome)}</h3><div class="actions"><button class="btn btn-restore" onclick="restoreProduct(${p.id})">♻️ Ripristina</button></div></div>`).join(''); 
}