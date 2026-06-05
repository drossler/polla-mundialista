// ============================================================
// ADMIN.JS — Panel de Administración con Supabase
// ============================================================

let adminUser = null;

document.addEventListener('supabase:ready', async function () {
    adminUser = await checkAdmin();
    if (!adminUser) return;

    await loadConfig();
    setupSidebar();

    document.getElementById('admin-name').textContent = adminUser.nombre;

    // Admin nav
    document.querySelectorAll('.admin-nav').forEach(nav => {
        nav.addEventListener('click', e => {
            e.preventDefault();
            const section = nav.dataset.section;
            showSection(section);
            document.querySelectorAll('.admin-nav').forEach(n => n.classList.remove('active'));
            nav.classList.add('active');
        });
    });

    showSection('dashboard');

    // REALTIME admin: pagos y usuarios
    Realtime.onPaymentsChange(() => {
        updatePendingBadge();
        if (document.getElementById('section-payments')?.classList.contains('active')) loadPayments();
        if (document.getElementById('section-dashboard')?.classList.contains('active')) loadDashboard();
    });
    Realtime.onProfilesChange(() => {
        if (document.getElementById('section-users')?.classList.contains('active')) loadUsers();
        if (document.getElementById('section-leaderboard')?.classList.contains('active')) loadAdminLeaderboard();
        if (document.getElementById('section-dashboard')?.classList.contains('active')) loadDashboard();
    });
    Realtime.onMatchesChange(() => {
        if (document.getElementById('section-matches')?.classList.contains('active')) loadMatches();
        if (document.getElementById('section-results')?.classList.contains('active')) loadResultsEntry();
    });
});

function setupSidebar() {
    document.getElementById('menu-toggle')?.addEventListener('click', () =>
        document.getElementById('sidebar').classList.toggle('active'));
    document.getElementById('sidebar-close')?.addEventListener('click', () =>
        document.getElementById('sidebar').classList.remove('active'));
    document.getElementById('logout-btn')?.addEventListener('click', e => { e.preventDefault(); logout(); });
    document.querySelector('.modal-close')?.addEventListener('click', closeModal);
    document.getElementById('modal')?.addEventListener('click', e => {
        if (e.target === document.getElementById('modal')) closeModal();
    });
}

function showSection(section) {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.getElementById('section-' + section)?.classList.add('active');

    const titles = {
        dashboard: 'Dashboard', users: 'Gestión de Usuarios',
        matches: 'Gestión de Partidos', bets: 'Todas las Apuestas',
        results: 'Ingresar Resultados', leaderboard: 'Tabla de Posiciones',
        payments: 'Gestión de Pagos', settings: 'Configuración'
    };
    document.getElementById('admin-page-title').textContent = titles[section] || 'Admin';

    switch (section) {
        case 'dashboard':   loadDashboard(); break;
        case 'users':       loadUsers(); break;
        case 'matches':     loadMatches(); break;
        case 'bets':        loadBets(); break;
        case 'results':     loadResultsEntry(); break;
        case 'leaderboard': loadAdminLeaderboard(); break;
        case 'payments':    loadPayments(); break;
        case 'settings':    loadSettings(); break;
    }
}

async function updatePendingBadge() {
    try {
        const payments = await DB.getPayments();
        const pending = payments.filter(p => !p.approved).length;
        const badge = document.getElementById('admin-notifications');
        if (badge) badge.textContent = pending;
    } catch (e) {}
}

// ---- DASHBOARD ----
async function loadDashboard() {
    try {
        const [profiles, payments, matches] = await Promise.all([
            DB.getAllProfiles(),
            DB.getPayments(),
            DB.getMatches()
        ]);

        const paidUsers = profiles.filter(u => u.paid).length;
        const allBets   = await DB.getAllBets();
        const totalRec  = (allBets.filter(b => b.paid).length) * (CONFIG.costo_apuesta || 5000);

        document.getElementById('admin-total-users').textContent   = profiles.length;
        document.getElementById('admin-paid-users').textContent    = paidUsers;
        document.getElementById('admin-pending-users').textContent = profiles.length - paidUsers;
        document.getElementById('admin-total-money').textContent   = '$' + totalRec.toLocaleString('es-CO');

        const pendingPays = payments.filter(p => !p.approved);
        document.getElementById('admin-notifications').textContent = pendingPays.length;

        // Chart registros
        const ctx = document.getElementById('registrationsChart');
        if (ctx) {
            const regByDay = {};
            profiles.forEach(u => {
                const day = u.created_at?.split('T')[0] || 'N/A';
                regByDay[day] = (regByDay[day] || 0) + 1;
            });
            const labels = Object.keys(regByDay).sort();
            const data   = labels.map(d => regByDay[d]);
            if (window._dashChart2) window._dashChart2.destroy();
            window._dashChart2 = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels, datasets: [{ label: 'Registros', data,
                        backgroundColor: '#4f46e5', borderRadius: 4 }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
                }
            });
        }

        // Próximos partidos
        const upcoming = matches.filter(m => m.status === 'upcoming').slice(0, 5);
        const upcomEl  = document.getElementById('admin-upcoming-matches');
        if (upcomEl) {
            upcomEl.innerHTML = upcoming.map(m => {
                const t1 = getTeam(m.team1);
                const t2 = getTeam(m.team2);
                return `<div class="admin-match-item">
                    <span>${t1.flag} ${t1.name} vs ${t2.name} ${t2.flag}</span>
                    <span>${formatDate(m.match_date)} ${m.match_time}</span>
                </div>`;
            }).join('');
        }

        // Acciones pendientes (comprobantes sin aprobar)
        const pendingEl = document.getElementById('pending-actions');
        if (pendingEl) {
            pendingEl.innerHTML = pendingPays.length > 0
                ? pendingPays.map(p => `
                    <div class="pending-item">
                        <i class="fas fa-user-clock"></i>
                        <span>${p.profiles?.nombre || p.user_id} — Comprobante pendiente</span>
                        <button onclick="approvePaymentFromDash('${p.id}','${p.user_id}')">Aprobar</button>
                    </div>`)
                  .join('')
                : '<p class="no-pending">No hay acciones pendientes</p>';
        }
    } catch (e) { console.error('Dashboard error:', e); }
}

async function approvePaymentFromDash(payId, userId) {
    try {
        await DB.approvePayment(payId, adminUser.id);
        showModal('✅ Éxito', 'Pago aprobado');
        loadDashboard();
    } catch (e) { showModal('Error', e.message); }
}

// ---- USUARIOS ----
async function loadUsers() {
    const tbody  = document.getElementById('users-table-body');
    if (!tbody) return;
    const filter = document.getElementById('user-filter')?.value || 'all';
    const search = document.getElementById('user-search')?.value?.toLowerCase() || '';

    try {
        let users = await DB.getAllProfiles();
        if (filter === 'paid')    users = users.filter(u => u.paid);
        if (filter === 'pending') users = users.filter(u => !u.paid);
        if (search) users = users.filter(u =>
            u.nombre.toLowerCase().includes(search) || u.email.toLowerCase().includes(search));

        tbody.innerHTML = users.map(u => `
            <tr>
                <td>${u.id.substring(0,8)}...</td>
                <td>${u.nombre}</td>
                <td>${u.email}</td>
                <td>${u.telefono || '-'}</td>
                <td><span class="status-badge ${u.paid ? 'paid' : 'pending'}">${u.paid ? 'Pagado' : 'Pendiente'}</span></td>
                <td>${u.points}</td>
                <td>${u.created_at?.split('T')[0] || '-'}</td>
                <td>
                    <button class="btn-sm btn-danger" onclick="deleteUser('${u.id}')">Eliminar</button>
                </td>
            </tr>`).join('');

        // Re-attach filter listeners (solo una vez)
        document.getElementById('user-filter')?.removeEventListener('change', loadUsers);
        document.getElementById('user-filter')?.addEventListener('change', loadUsers);
        document.getElementById('user-search')?.removeEventListener('input', loadUsers);
        document.getElementById('user-search')?.addEventListener('input', loadUsers);
    } catch (e) { tbody.innerHTML = `<tr><td colspan="8" style="color:#ef4444">Error: ${e.message}</td></tr>`; }
}

// ---- PARTIDOS ----
async function loadMatches() {
    const tbody = document.getElementById('matches-table-body');
    if (!tbody) return;
    const filter = document.getElementById('match-phase-filter')?.value || 'all';

    try {
        const filters = {};
        if (filter !== 'all') filters.phase = filter;
        const matches = await DB.getMatches(filters);

        tbody.innerHTML = matches.map(m => {
            const t1 = getTeam(m.team1);
            const t2 = getTeam(m.team2);
            const result = m.status === 'finished' ? `${m.score1}-${m.score2}` : '-';
            return `
                <tr>
                    <td>${m.id}</td>
                    <td>${formatDate(m.match_date)}</td>
                    <td>${m.match_time}</td>
                    <td>${t1.flag} ${t1.name}</td>
                    <td>${t2.flag} ${t2.name}</td>
                    <td>${m.phase === 'group' ? 'Grupos' : m.phase}</td>
                    <td>${m.group_name || '-'}</td>
                    <td>${result}</td>
                    <td><span class="status-badge ${m.status}">${m.status}</span></td>
                    <td>
                        <button class="btn-sm" onclick="editMatch(${m.id})">Editar</button>
                        <button class="btn-sm ${m.betting_closed ? '' : 'btn-danger'}"
                            onclick="toggleBetting(${m.id}, ${m.betting_closed})">
                            ${m.betting_closed ? '🔓 Abrir' : '🔒 Cerrar'}
                        </button>
                    </td>
                </tr>`;
        }).join('');

        document.getElementById('match-phase-filter')?.addEventListener('change', loadMatches);
    } catch (e) { tbody.innerHTML = `<tr><td colspan="10" style="color:#ef4444">Error: ${e.message}</td></tr>`; }
}

// ---- APUESTAS ----
async function loadBets() {
    const tbody = document.getElementById('bets-table-body');
    if (!tbody) return;
    try {
        const bets = await DB.getAllBets();
        tbody.innerHTML = bets.map(b => {
            const t1 = getTeam(b.matches?.team1 || '');
            const t2 = getTeam(b.matches?.team2 || '');
            const result = b.matches?.score1 != null ? `${b.matches.score1}-${b.matches.score2}` : 'Pendiente';
            const pts    = b.points_earned > 0 ? `+${b.points_earned}` : b.result_type === 'pending' ? '-' : '0';
            const payStatus = b.paid ? '✅ Pagada' : '⏳ Pendiente';
            return `
                <tr>
                    <td>${b.profiles?.nombre || '-'}</td>
                    <td>${t1.name} vs ${t2.name}</td>
                    <td>${b.prediction1}-${b.prediction2}</td>
                    <td>${result}</td>
                    <td>${pts}</td>
                    <td><span class="status-badge ${b.paid ? 'paid' : 'pending'}">${payStatus}</span></td>
                    <td>${b.created_at?.split('T')[0] || '-'}</td>
                </tr>`;
        }).join('');
    } catch (e) { tbody.innerHTML = `<tr><td colspan="6" style="color:#ef4444">Error: ${e.message}</td></tr>`; }
}

// ---- INGRESAR RESULTADOS ----
async function loadResultsEntry() {
    const select = document.getElementById('result-match-select');
    if (!select) return;
    try {
        const matches = await DB.getMatches({ status: 'upcoming' });
        select.innerHTML = '<option value="">Selecciona un partido</option>' +
            matches.map(m => {
                const t1 = getTeam(m.team1);
                const t2 = getTeam(m.team2);
                return `<option value="${m.id}">${m.id} — ${t1.name} vs ${t2.name} (${formatDate(m.match_date)})</option>`;
            }).join('');

        select.onchange = async function () {
            const m = matches.find(x => x.id === parseInt(this.value));
            if (m) {
                const t1 = getTeam(m.team1);
                const t2 = getTeam(m.team2);
                document.getElementById('result-team1-name').textContent = t1.name;
                document.getElementById('result-team2-name').textContent = t2.name;
                document.getElementById('result-team1-score').value = '';
                document.getElementById('result-team2-score').value = '';
                await showMatchBets(m.id);
            } else {
                document.getElementById('result-bets-container').style.display = 'none';
            }
        };
    } catch (e) { console.error(e); }
}

async function saveMatchResult() {
    const matchId = parseInt(document.getElementById('result-match-select').value);
    const score1  = parseInt(document.getElementById('result-team1-score').value);
    const score2  = parseInt(document.getElementById('result-team2-score').value);

    if (!matchId || isNaN(score1) || isNaN(score2)) {
        showModal('Error', 'Completa todos los campos');
        return;
    }

    const btn = document.querySelector('[onclick="saveMatchResult()"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

    try {
        await DB.saveMatchResult(matchId, score1, score2);
        showModal('✅ Éxito', `Resultado guardado: ${score1}-${score2}. Puntos calculados automáticamente.`);
        loadResultsEntry();
        loadAdminLeaderboard();
    } catch (e) {
        showModal('Error', e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = 'Guardar Resultado'; }
    }
}

async function showMatchBets(matchId) {
    const container = document.getElementById('result-bets-container');
    const tbody = document.getElementById('result-bets-body');
    if (!container || !tbody) return;
    try {
        const allBets = await DB.getAllBets();
        const matchBets = allBets.filter(b => b.match_id === matchId);
        if (matchBets.length === 0) {
            container.style.display = 'none';
            return;
        }
        container.style.display = 'block';
        tbody.innerHTML = matchBets.map(b => {
            const name = b.profiles?.nombre || 'Usuario';
            const paidStatus = b.paid ? '✅ Sí' : '❌ No';
            const payoutBtn = (b.result_type === 'exact' || b.result_type === 'winner') && !b.payout
                ? `<button class="btn-sm" onclick="payUserPayout('${b.id}')">Pagar x Nequi</button>`
                : b.payout ? '✅ Pagado' : '-';
            return `
                <tr>
                    <td>${name}</td>
                    <td>${b.prediction1} - ${b.prediction2}</td>
                    <td>${b.points_earned || 0}</td>
                    <td>${paidStatus}</td>
                    <td>${payoutBtn}</td>
                </tr>`;
        }).join('');
    } catch (e) { console.error('showMatchBets error:', e); container.style.display = 'none'; }
}

async function recalculateAllPoints() {
    // Recalcular todos los partidos finalizados
    try {
        const matches = await DB.getMatches({ status: 'finished' });
        for (const m of matches) {
            await getSB().rpc('recalculate_match_points', { p_match_id: m.id });
        }
        showModal('✅ Éxito', 'Todos los puntos han sido recalculados');
        loadAdminLeaderboard();
    } catch (e) { showModal('Error', e.message); }
}

// ---- RANKING ADMIN ----
async function loadAdminLeaderboard() {
    const tbody = document.getElementById('admin-leaderboard-body');
    if (!tbody) return;
    try {
        const users = await DB.getPaidProfiles();
        tbody.innerHTML = users.map((u, index) => {
            const total    = u.exact_count + u.winner_count + u.wrong_count;
            const accuracy = total > 0 ? Math.round(((u.exact_count + u.winner_count) / total) * 100) : 0;
            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>${u.nombre}</td>
                    <td>${u.points}</td>
                    <td>${u.exact_count}</td>
                    <td>${u.winner_count}</td>
                    <td>${u.wrong_count}</td>
                    <td>${accuracy}%</td>
                    <td><span class="status-badge ${u.paid ? 'paid' : 'pending'}">${u.paid ? 'Sí' : 'No'}</span></td>
                </tr>`;
        }).join('');
    } catch (e) { tbody.innerHTML = `<tr><td colspan="8" style="color:#ef4444">Error: ${e.message}</td></tr>`; }
}

// ---- PAGOS ----
async function loadPayments() {
    try {
        const [profiles, payments, allBets] = await Promise.all([
            DB.getAllProfiles(),
            DB.getPayments(),
            DB.getAllBets()
        ]);
        const totalRecaudado = payments.filter(p => p.approved && !p.payout).reduce((s, p) => s + Number(p.amount || CONFIG.costo_apuesta || 5000), 0);

        document.getElementById('pay-confirmed').textContent = payments.filter(p => p.approved && !p.payout).length;
        document.getElementById('pay-pending').textContent   = payments.filter(p => !p.approved).length;
        document.getElementById('pay-total').textContent     = '$' + totalRecaudado.toLocaleString('es-CO');

        const tbody = document.getElementById('payments-table-body');
        if (!tbody) return;

        // Mostrar apuestas pendientes de pago y pagos recibidos
        const unpaidBets = allBets.filter(b => !b.paid && b.matches?.status === 'upcoming');

        tbody.innerHTML = [
            ...unpaidBets.map(b => {
                const t1 = getTeam(b.matches?.team1 || '');
                const t2 = getTeam(b.matches?.team2 || '');
                return `
                <tr style="background:#fff7ed">
                    <td><strong>${b.profiles?.nombre || '-'}</strong></td>
                    <td>${b.profiles?.email || ''}</td>
                    <td>$${CONFIG.costo_apuesta?.toLocaleString('es-CO') || '5,000'}</td>
                    <td><span class="status-badge pending">Sin pagar</span></td>
                    <td>-</td>
                    <td>${t1.name} vs ${t2.name} (${b.prediction1}-${b.prediction2})</td>
                    <td>
                        <button class="btn-sm" onclick="approveBetPayment('${b.id}')">Aprobar pago</button>
                    </td>
                </tr>`;
            }),
            ...payments.map(p => {
                const t1 = getTeam(p.bets?.matches?.team1 || '');
                const t2 = getTeam(p.bets?.matches?.team2 || '');
                const matchInfo = p.bets ? `${t1.name} vs ${t2.name}` : 'General';
                return `
                <tr>
                    <td>${p.profiles?.nombre || '-'}</td>
                    <td>${p.profiles?.email || ''}</td>
                    <td>$${Number(p.amount || CONFIG.costo_apuesta || 5000).toLocaleString('es-CO')}</td>
                    <td><span class="status-badge ${p.approved ? 'paid' : 'pending'}">${p.approved ? 'Aprobado' : 'Pendiente'}</span></td>
                    <td>${p.created_at?.split('T')[0] || '-'}</td>
                    <td>${matchInfo} ${p.comprobante_notes ? '— ' + p.comprobante_notes : ''}</td>
                    <td>
                        ${!p.approved ? `<button class="btn-sm" onclick="approvePayment('${p.id}', '${p.user_id}', '${p.bet_id || ''}')">Aprobar</button>` : ''}
                        ${p.payout ? '✅ Pagado' : ''}
                    </td>
                </tr>`;
            })
        ].join('');
    } catch (e) { console.error('Payments error:', e); }
}

async function approvePayment(paymentId, userId, betId) {
    try {
        await DB.approvePayment(paymentId, adminUser.id, betId || null);
        showModal('✅ Éxito', 'Pago aprobado. Apuesta marcada como pagada.');
        loadPayments();
        loadDashboard();
    } catch (e) { showModal('Error', e.message); }
}

async function approveBetPayment(betId) {
    // Crear un pago automático para esta apuesta y aprobarlo
    try {
        await getSB().from('payments').insert({
            user_id: adminUser.id,
            bet_id: betId,
            comprobante_notes: 'Aprobado manual por admin',
            amount: CONFIG.costo_apuesta || 5000,
            approved: true,
            approved_by: adminUser.id,
            approved_at: new Date().toISOString()
        });
        await getSB().from('bets').update({ paid: true, paid_at: new Date().toISOString() }).eq('id', betId);
        showModal('✅ Éxito', 'Apuesta marcada como pagada');
        loadPayments();
    } catch (e) { showModal('Error', e.message); }
}

async function payUserPayout(betId) {
    if (!confirm('¿Confirmas que pagaste esta apuesta por Nequi?')) return;
    try {
        await DB.payBetPayout(betId, adminUser.id);
        showModal('✅ Pago Registrado', 'Pago por Nequi registrado exitosamente.');
        loadPayments();
        loadAdminLeaderboard();
    } catch (e) { showModal('Error', e.message); }
}

async function rejectPayment(paymentId) {
    if (!confirm('¿Rechazar este pago?')) return;
    try {
        await DB.rejectPayment(paymentId);
        showModal('✅ Pago rechazado');
        loadPayments();
    } catch (e) { showModal('Error', e.message); }
}

async function deleteUser(userId) {
    if (!confirm('¿Eliminar este usuario? Esta acción no se puede deshacer.')) return;
    try {
        await DB.adminDeleteUser(userId);
        showModal('✅ Éxito', 'Usuario eliminado');
        loadUsers();
    } catch (e) { showModal('Error', e.message); }
}

// ---- EDITAR PARTIDO ----
async function editMatch(matchId) {
    try {
        const m  = await DB.getMatch(matchId);
        const t1 = getTeam(m.team1);
        const t2 = getTeam(m.team2);
        showModal(`Editar Partido #${matchId}`, `
            <div style="display:flex;flex-direction:column;gap:12px">
                <p><strong>${t1.flag} ${t1.name} vs ${t2.name} ${t2.flag}</strong></p>
                <p>${formatDate(m.match_date)} — ${m.match_time}</p>
                <label>Estado:
                    <select id="edit-match-status">
                        <option value="upcoming" ${m.status==='upcoming'?'selected':''}>Próximo</option>
                        <option value="live"     ${m.status==='live'?'selected':''}>En Vivo</option>
                        <option value="finished" ${m.status==='finished'?'selected':''}>Finalizado</option>
                    </select>
                </label>
                <label>Apuestas cerradas:
                    <input type="checkbox" id="edit-bet-closed" ${m.betting_closed?'checked':''}>
                </label>
                <button onclick="saveEditMatch(${matchId})" style="padding:8px;background:#4f46e5;color:#fff;border:none;border-radius:6px;cursor:pointer">Guardar</button>
            </div>`);
    } catch (e) { showModal('Error', e.message); }
}

async function saveEditMatch(matchId) {
    try {
        await DB.updateMatch(matchId, {
            status:         document.getElementById('edit-match-status').value,
            betting_closed: document.getElementById('edit-bet-closed').checked
        });
        closeModal();
        showModal('✅ Éxito', 'Partido actualizado');
        loadMatches();
    } catch (e) { showModal('Error', e.message); }
}

async function toggleBetting(matchId, currentlyClosed) {
    try {
        await DB.updateMatch(matchId, { betting_closed: !currentlyClosed });
        loadMatches();
    } catch (e) { showModal('Error', e.message); }
}

// ---- CONFIGURACIÓN ----
async function loadSettings() {
    try {
        const config = await DB.getConfig();
        document.getElementById('setting-name').value         = config.nombre_polla;
        document.getElementById('setting-cost').value         = config.costo_apuesta || config.valor_apuesta || 5000;
        document.getElementById('setting-moneda').value       = config.moneda || 'COP';
        document.getElementById('setting-nequi').value        = config.nequi || '3218593047';
        document.getElementById('setting-banco').value        = config.banco || 'Bancolombia | Cuenta: 08585591247 | Titular: Polla Mundialista';
        document.getElementById('setting-exact').value        = config.points_exact;
        document.getElementById('setting-winner').value       = config.points_winner;
        document.getElementById('setting-multiplier').value   = config.multiplier;
        document.getElementById('setting-prize1').value       = config.prize_first;
        document.getElementById('setting-prize2').value       = config.prize_second;
        document.getElementById('setting-prize3').value       = config.prize_third;
        document.getElementById('setting-prize-last').value   = config.prize_last;
        document.getElementById('setting-active').checked     = config.active;

        document.getElementById('settings-form')?.addEventListener('submit', async function (e) {
            e.preventDefault();
            try {
                await DB.updateConfig({
                    nombre_polla:  document.getElementById('setting-name').value,
                    costo_apuesta: parseFloat(document.getElementById('setting-cost').value),
                    moneda:        document.getElementById('setting-moneda').value,
                    nequi:         document.getElementById('setting-nequi').value,
                    banco:         document.getElementById('setting-banco').value,
                    points_exact:  parseInt(document.getElementById('setting-exact').value),
                    points_winner: parseInt(document.getElementById('setting-winner').value),
                    multiplier:    parseFloat(document.getElementById('setting-multiplier').value),
                    prize_first:   parseInt(document.getElementById('setting-prize1').value),
                    prize_second:  parseInt(document.getElementById('setting-prize2').value),
                    prize_third:   parseInt(document.getElementById('setting-prize3').value),
                    prize_last:    parseInt(document.getElementById('setting-prize-last').value),
                    active:        document.getElementById('setting-active').checked
                });
                showModal('✅ Éxito', 'Configuración guardada');
                await loadConfig();
            } catch (err) { showModal('Error', err.message); }
        }, { once: true });
    } catch (e) { console.error('Settings error:', e); }
}
