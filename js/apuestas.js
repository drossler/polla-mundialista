// ============================================================
// APUESTAS.JS — Sistema de apuestas con Supabase
// ============================================================

let currentUser = null;
let currentBet  = null;

document.addEventListener('supabase:ready', async function () {
    currentUser = await checkAuth();
    if (!currentUser) return;

    await loadConfig();
    setupSidebar();

    document.getElementById('user-name').textContent  = currentUser.nombre;
    document.getElementById('user-email').textContent = currentUser.email;

    // Filtros
    document.getElementById('filter-phase')?.addEventListener('change', () => renderMatches());
    document.getElementById('filter-status')?.addEventListener('change', () => renderMatches());
    document.getElementById('filter-group')?.addEventListener('change', () => renderMatches());

    await renderMatches();
    await updateSummary();

    // Sidebar payment status
    try {
        const myBets = await DB.getUserBets(currentUser.id);
        const unpaid = myBets.filter(b => !b.paid).length;
        setStatusBadge(document.getElementById('user-status'), unpaid);
    } catch (e) {}

    // REALTIME: recargar si cambia un partido o apuesta
    Realtime.onMatchesChange(() => renderMatches());
    Realtime.onUserBetsChange(currentUser.id, () => { renderMatches(); updateSummary(); });

    // Bet modal listeners
    const betModal = document.getElementById('bet-modal');
    betModal?.addEventListener('click', e => { if (e.target === betModal) closeBetModal(); });
    betModal?.querySelector('.modal-close')?.addEventListener('click', closeBetModal);

    document.querySelector('.modal-close')?.addEventListener('click', closeModal);
    document.getElementById('modal')?.addEventListener('click', e => {
        if (e.target === document.getElementById('modal')) closeModal();
    });
});

function setupSidebar() {
    document.getElementById('menu-toggle')?.addEventListener('click', () =>
        document.getElementById('sidebar').classList.toggle('active'));
    document.getElementById('sidebar-close')?.addEventListener('click', () =>
        document.getElementById('sidebar').classList.remove('active'));
    document.getElementById('logout-btn')?.addEventListener('click', e => { e.preventDefault(); logout(); });
}

function setStatusBadge(el, unpaid) {
    if (!el) return;
    el.textContent  = unpaid > 0 ? `⏳ ${unpaid} sin pagar` : '✅ Todas pagadas';
    el.className    = unpaid > 0 ? 'user-status pending' : 'user-status paid';
}

async function renderMatches() {
    const container = document.getElementById('matches-betting');
    if (!container) return;

    container.innerHTML = '<p style="text-align:center;padding:2rem"><i class="fas fa-spinner fa-spin"></i> Cargando...</p>';

    try {
        const phaseFilter  = document.getElementById('filter-phase')?.value  || 'all';
        const statusFilter = document.getElementById('filter-status')?.value || 'all';
        const groupFilter  = document.getElementById('filter-group')?.value  || 'all';

        const filters = {};
        if (phaseFilter !== 'all') filters.phase = phaseFilter;
        if (groupFilter !== 'all') filters.group_name = groupFilter;

        let matches = await DB.getMatches(filters);
        const bets  = await DB.getUserBets(currentUser.id);

        // Filtro de estado
        if (statusFilter !== 'all') {
            matches = matches.filter(m => {
                const hasBet = bets.find(b => b.match_id === m.id);
                if (statusFilter === 'pending')  return !hasBet && m.status === 'upcoming';
                if (statusFilter === 'placed')   return hasBet  && m.status === 'upcoming';
                if (statusFilter === 'finished') return m.status === 'finished';
                return true;
            });
        }

        if (matches.length === 0) {
            container.innerHTML = '<div class="no-matches"><i class="fas fa-futbol"></i><p>No hay partidos que coincidan con los filtros</p></div>';
            return;
        }

        container.innerHTML = matches.map(match => {
            const t1  = getTeam(match.team1);
            const t2  = getTeam(match.team2);
            const bet = bets.find(b => b.match_id === match.id);
            const isFin = match.status === 'finished';
            const isOpen = match.status === 'upcoming' && !match.betting_closed;

            let betSection = '';
            if (isFin && bet) {
                const cls = bet.result_type === 'exact' ? 'exact' : bet.result_type === 'winner' ? 'winner' : 'wrong';
                const pts = bet.points_earned > 0 ? `+${bet.points_earned} pts` : '0 pts';
                betSection = `
                    <div class="bet-result-display ${cls}">
                        <span>Tu apuesta: ${bet.prediction1} - ${bet.prediction2}</span>
                        <span>Resultado: ${match.score1 ?? '-'} - ${match.score2 ?? '-'}</span>
                        <span class="points">${pts}</span>
                    </div>`;
            } else if (isFin && !bet) {
                betSection = `<div class="bet-result-display wrong"><span>No apostaste</span></div>`;
                } else if (isOpen) {
                if (bet) {
                    const payIcon = bet.paid ? '✅ Pagado' : '⏳ Pendiente pago';
                    const payBtn = bet.paid ? '' : `<button class="btn-sm" onclick="payForBet(${match.id})"><i class="fas fa-credit-card"></i> Pagar $${CONFIG.costo_apuesta}</button>`;
                    betSection = `
                        <div class="bet-placed-display">
                            <span><i class="fas fa-check-circle"></i> Apostado: ${bet.prediction1} - ${bet.prediction2}</span>
                            <span class="bet-pay-status ${bet.paid ? 'paid' : 'pending'}">${payIcon}</span>
                            ${payBtn}
                            <button class="btn-edit-bet" onclick="editBet(${match.id})">
                                <i class="fas fa-edit"></i> Editar
                            </button>
                        </div>`;
                } else {
                    betSection = `
                        <div class="bet-inputs">
                            <div class="score-input">
                                <label>${t1.name}</label>
                                <input type="number" id="score-${match.id}-1" min="0" max="20" placeholder="0">
                            </div>
                            <span class="vs">VS</span>
                            <div class="score-input">
                                <label>${t2.name}</label>
                                <input type="number" id="score-${match.id}-2" min="0" max="20" placeholder="0">
                            </div>
                            <button class="btn-bet" onclick="openBetModal(${match.id})">
                                <i class="fas fa-paper-plane"></i> Apostar
                            </button>
                        </div>
                        <p class="payment-info-bet"><i class="fas fa-info-circle"></i> Cada apuesta cuesta <strong>$${CONFIG.costo_apuesta} COP</strong>. Debes pagar después de apostar.</p>`;
                }
            } else {
                betSection = `<div class="bet-closed"><span><i class="fas fa-lock"></i> Apuestas cerradas</span></div>`;
            }

            const phaseLabel = match.phase === 'group' ? `Grupo ${match.group_name}` :
                               match.phase === 'round32' ? 'Dieciseisavos' :
                               match.phase === 'round16' ? 'Octavos' :
                               match.phase === 'quarter' ? 'Cuartos' :
                               match.phase === 'semi' ? 'Semifinal' : 'Final';

            return `
                <div class="match-bet-card ${isFin ? 'finished' : ''} ${bet ? 'has-bet' : ''}">
                    <div class="match-header">
                        <span class="match-phase-badge">${phaseLabel}</span>
                        <span class="match-date"><i class="fas fa-calendar"></i> ${formatDateTime(match.match_date, match.match_time)}</span>
                        <span class="match-stadium"><i class="fas fa-map-marker-alt"></i> ${match.stadium}</span>
                    </div>
                    <div class="match-teams-bet">
                        <div class="team-bet">
                            <span class="team-flag-large">${t1.flag}</span>
                            <span class="team-name-large">${t1.name}</span>
                        </div>
                        <div class="match-score-display">
                            ${isFin ? `<span class="final-score">${match.score1} - ${match.score2}</span>` : '<span class="vs-large">VS</span>'}
                        </div>
                        <div class="team-bet">
                            <span class="team-flag-large">${t2.flag}</span>
                            <span class="team-name-large">${t2.name}</span>
                        </div>
                    </div>
                    <div class="bet-section">${betSection}</div>
                </div>`;
        }).join('');
    } catch (e) {
        container.innerHTML = `<p style="text-align:center;color:#ef4444">Error: ${e.message}</p>`;
    }
}

function openBetModal(matchId) {
    const score1 = parseInt(document.getElementById(`score-${matchId}-1`)?.value);
    const score2 = parseInt(document.getElementById(`score-${matchId}-2`)?.value);

    if (isNaN(score1) || isNaN(score2) || score1 < 0 || score2 < 0) {
        showModal('Error', 'Ingresa marcadores válidos (números ≥ 0)');
        return;
    }

    DB.getMatch(matchId).then(match => {
        const t1 = getTeam(match.team1);
        const t2 = getTeam(match.team2);
        currentBet = { matchId, score1, score2, match };

        const summary = document.getElementById('bet-summary');
        summary.innerHTML = `
            <div class="bet-confirm-teams">
                <div class="confirm-team">
                    <span class="flag">${t1.flag}</span>
                    <span class="name">${t1.name}</span>
                    <span class="score">${score1}</span>
                </div>
                <span class="confirm-vs">VS</span>
                <div class="confirm-team">
                    <span class="flag">${t2.flag}</span>
                    <span class="name">${t2.name}</span>
                    <span class="score">${score2}</span>
                </div>
            </div>
            <p class="confirm-date">${formatDateTime(match.match_date, match.match_time)}</p>
            <p class="confirm-warning"><i class="fas fa-exclamation-circle"></i> Puedes editar tu apuesta hasta que cierre el partido</p>`;

        document.getElementById('bet-modal').style.display = 'flex';
    });
}

// Alias para compatibilidad
function placeBet(matchId) { openBetModal(matchId); }

async function confirmBet() {
    if (!currentBet) return;
    const btn = document.querySelector('#bet-modal .btn-primary') ||
                document.querySelector('#bet-modal button[onclick="confirmBet()"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

    try {
        await DB.placeBet(currentUser.id, currentBet.matchId, currentBet.score1, currentBet.score2);
        closeBetModal();
        showModal('¡Apuesta Realizada!', 'Tu predicción ha sido guardada exitosamente');
        await renderMatches();
        await updateSummary();
    } catch (err) {
        if (btn) { btn.disabled = false; btn.innerHTML = 'Confirmar'; }
        showModal('Error', err.message);
    }
}

async function editBet(matchId) {
    // En lugar de eliminar, abrimos el modal directamente para hacer upsert
    try {
        const score1 = parseInt(document.getElementById(`score-${matchId}-1`)?.value);
        const score2 = parseInt(document.getElementById(`score-${matchId}-2`)?.value);
        if (!isNaN(score1) && !isNaN(score2) && score1 >= 0 && score2 >= 0) {
            await DB.placeBet(currentUser.id, matchId, score1, score2);
            showModal('¡Apuesta Editada!', 'Tu predicción ha sido actualizada');
            await renderMatches();
            await updateSummary();
        } else {
            openBetModal(matchId);
        }
    } catch (e) { showModal('Error', e.message); }
}

async function payForBet(matchId) {
    try {
        const bets = await DB.getUserBets(currentUser.id);
        const bet = bets.find(b => b.match_id === matchId);
        if (!bet) { showModal('Error', 'Primero debes hacer la apuesta'); return; }
        if (bet.paid) { showModal('Información', 'Esta apuesta ya está pagada'); return; }

        showModal('Pagar Apuesta', `
            <p><strong>Partido:</strong> ${getTeam(bet.matches?.team1)?.name || '?'} vs ${getTeam(bet.matches?.team2)?.name || '?'}</p>
            <p><strong>Tu apuesta:</strong> ${bet.prediction1} - ${bet.prediction2}</p>
            <p><strong>Costo:</strong> $${CONFIG.costo_apuesta} COP</p>
            <hr>
            <p>Transfiere <strong>$${CONFIG.costo_apuesta} COP</strong> a:</p>
            <p><strong>Nequi:</strong> ${CONFIG.nequi || '3218593047'}</p>
            <p><strong>Banco:</strong> ${CONFIG.banco || 'Bancolombia | Cuenta: 08585591247 | Titular: Polla Mundialista'}</p>
            <hr>
            <input type="text" id="pay-notes" placeholder="Nombre del titular del envío" style="width:100%;padding:8px;margin:8px 0;border:1px solid #ddd;border-radius:6px;">
            <button onclick="submitBetPayment(${matchId})" style="width:100%;padding:10px;background:#4f46e5;color:#fff;border:none;border-radius:6px;cursor:pointer">
                <i class="fas fa-paper-plane"></i> Ya envié el pago
            </button>
        `);
    } catch (e) { showModal('Error', e.message); }
}

async function submitBetPayment(matchId) {
    try {
        const bets = await DB.getUserBets(currentUser.id);
        const bet = bets.find(b => b.match_id === matchId);
        if (!bet) return;
        const notes = document.getElementById('pay-notes')?.value || '';
        await DB.submitPayment(currentUser.id, notes, bet.id);
        // Marcar la apuesta como pendiente de pago (el admin lo aprobará)
        showModal('✅ Comprobante Enviado', 'El administrador revisará tu pago y lo activará pronto.');
        await renderMatches();
    } catch (e) { showModal('Error', e.message); }
}

function closeBetModal() {
    document.getElementById('bet-modal').style.display = 'none';
    currentBet = null;
}

async function updateSummary() {
    try {
        const matches = await DB.getMatches();
        const bets    = await DB.getUserBets(currentUser.id);
        const total   = matches.length;
        const placed  = bets.length;
        const finished = bets.filter(b => b.result_type !== 'pending').length;
        const pending  = matches.filter(m => m.status === 'upcoming' && !bets.find(b => b.match_id === m.id)).length;

        const el = (id) => document.getElementById(id);
        if (el('total-bets'))   el('total-bets').textContent = total;
        if (el('pending-bets')) el('pending-bets').textContent = pending;
        if (el('placed-bets'))  el('placed-bets').textContent = placed;
        if (el('finished-bets')) el('finished-bets').textContent = finished;
    } catch (e) {}
}
