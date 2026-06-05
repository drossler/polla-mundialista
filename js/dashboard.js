// ============================================================
// DASHBOARD.JS — Panel de usuario con Supabase
// ============================================================

let currentUser = null;

document.addEventListener('supabase:ready', async function () {
    currentUser = await checkAuth();
    if (!currentUser) return;

    await loadConfig();
    setupSidebar(currentUser);

    document.getElementById('user-name').textContent  = currentUser.nombre;
    document.getElementById('user-email').textContent = currentUser.email;

    // Estadísticas
    document.getElementById('dash-points').textContent = currentUser.points;
    document.getElementById('dash-exact').textContent  = currentUser.exact_count;
    document.getElementById('dash-correct').textContent = currentUser.winner_count;

    // Posición en ranking
    try {
        const all = await DB.getPaidProfiles();
        const pos = all.findIndex(u => u.id === currentUser.id) + 1;
        document.getElementById('dash-position').textContent = pos > 0 ? `#${pos}` : '--';
    } catch (e) {}

    // Contar apuestas pendientes de pago
    try {
        const myBets = await DB.getUserBets(currentUser.id);
        const unpaid = myBets.filter(b => !b.paid).length;
        const payAlert = document.getElementById('payment-alert');
        if (payAlert) {
            if (unpaid > 0) {
                payAlert.style.display = 'block';
                payAlert.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Tienes <strong>${unpaid} apuesta${unpaid > 1 ? 's' : ''}</strong> pendiente${unpaid > 1 ? 's' : ''} de pago. <a href="apuestas.html" style="color:#fff;text-decoration:underline">Pagar ahora</a>`;
            } else {
                payAlert.style.display = 'none';
            }
        }
        setStatusBadge(document.getElementById('user-status'), unpaid);
    } catch (e) {}

    // Cargar contenido
    await Promise.all([
        renderDashUpcoming(),
        renderDashBets(),
        renderProgressChart()
    ]);

    // REALTIME: actualizar dashboard si cambian sus datos
    Realtime.onProfilesChange(async payload => {
        if (payload.new?.id === currentUser.id) {
            currentUser = payload.new;
            document.getElementById('dash-points').textContent = currentUser.points;
            document.getElementById('dash-exact').textContent  = currentUser.exact_count;
            document.getElementById('dash-correct').textContent = currentUser.winner_count;
            await renderProgressChart();
        }
    });

    Realtime.onMatchesChange(() => renderDashUpcoming());
    Realtime.onUserBetsChange(currentUser.id, () => {
        renderDashUpcoming();
        renderDashBets();
    });

    // Modal listeners
    document.querySelector('.modal-close')?.addEventListener('click', closeModal);
    document.getElementById('modal')?.addEventListener('click', e => {
        if (e.target === document.getElementById('modal')) closeModal();
    });
});

function setupSidebar(user) {
    const menuToggle  = document.getElementById('menu-toggle');
    const sidebar     = document.getElementById('sidebar');
    const sidebarClose = document.getElementById('sidebar-close');
    menuToggle?.addEventListener('click', () => sidebar.classList.toggle('active'));
    sidebarClose?.addEventListener('click', () => sidebar.classList.remove('active'));
    document.getElementById('logout-btn')?.addEventListener('click', e => { e.preventDefault(); logout(); });
}

function setStatusBadge(el, unpaid) {
    if (!el) return;
    el.textContent  = unpaid > 0 ? `⏳ ${unpaid} sin pagar` : '✅ Todas pagadas';
    el.className    = unpaid > 0 ? 'user-status pending' : 'user-status paid';
}

async function renderDashUpcoming() {
    const container = document.getElementById('dash-upcoming');
    if (!container) return;
    try {
        const matches = (await DB.getMatches({ status: 'upcoming' })).slice(0, 5);
        const bets    = await DB.getUserBets(currentUser.id);

        container.innerHTML = matches.map(match => {
            const t1  = getTeam(match.team1);
            const t2  = getTeam(match.team2);
            const bet = bets.find(b => b.match_id === match.id);
            const betStatus = bet
                ? `<span class="bet-placed"><i class="fas fa-check"></i> ${bet.prediction1}-${bet.prediction2}</span>`
                : `<span class="bet-pending"><i class="fas fa-clock"></i> Sin apostar</span>`;
            return `
                <div class="match-item">
                    <div class="match-teams-mini">
                        <span>${t1.flag} ${t1.name}</span>
                        <span class="vs">VS</span>
                        <span>${t2.name} ${t2.flag}</span>
                    </div>
                    <div class="match-meta">
                        <span>${formatDate(match.match_date)} ${match.match_time}</span>
                        <span>Grupo ${match.group_name}</span>
                    </div>
                    <div class="match-bet-status">${betStatus}</div>
                </div>`;
        }).join('');
    } catch (e) { container.innerHTML = '<p>Error cargando partidos.</p>'; }
}

async function renderDashBets() {
    const container = document.getElementById('dash-bets');
    if (!container) return;
    try {
        const bets = (await DB.getUserBets(currentUser.id))
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 5);

        if (bets.length === 0) {
            container.innerHTML = '<p class="no-bets">Aún no has realizado apuestas</p>';
            return;
        }

        container.innerHTML = bets.map(bet => {
            const match = bet.matches;
            if (!match) return '';
            const t1  = getTeam(match.team1);
            const t2  = getTeam(match.team2);
            const cls = bet.result_type === 'exact' ? 'exact' : bet.result_type === 'winner' ? 'winner' : bet.result_type === 'wrong' ? 'wrong' : '';
            const icon = bet.result_type === 'exact' ? '🎯' : bet.result_type === 'winner' ? '✅' : bet.result_type === 'wrong' ? '❌' : '🕐';
            const pts  = bet.points_earned > 0 ? `+${bet.points_earned} pts` : bet.result_type === 'pending' ? 'Pendiente' : '0 pts';
            return `
                <div class="bet-item ${cls}">
                    <div class="bet-match">
                        <span>${t1.flag} ${t1.name} ${bet.prediction1} - ${bet.prediction2} ${t2.name} ${t2.flag}</span>
                    </div>
                    <div class="bet-result"><span>${icon} ${pts}</span></div>
                </div>`;
        }).join('');
    } catch (e) { container.innerHTML = '<p>Error cargando apuestas.</p>'; }
}

async function renderProgressChart() {
    const ctx = document.getElementById('pointsChart');
    if (!ctx) return;
    try {
        const bets = (await DB.getUserBets(currentUser.id))
            .filter(b => b.result_type !== 'pending')
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        let cumulative = 0;
        const labels = [];
        const data   = [];
        bets.forEach((bet, i) => {
            cumulative += bet.points_earned;
            labels.push(`P${i + 1}`);
            data.push(cumulative);
        });
        if (data.length === 0) { labels.push('Inicio'); data.push(0); }

        if (window._dashChart) window._dashChart.destroy();
        window._dashChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Puntos Acumulados',
                    data,
                    borderColor: '#4f46e5',
                    backgroundColor: 'rgba(79,70,229,0.1)',
                    fill: true, tension: 0.4, pointRadius: 4,
                    pointBackgroundColor: '#4f46e5'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                    x: { grid: { display: false } }
                }
            }
        });
    } catch (e) { console.error('Chart error:', e); }
}

function showPaymentInfo() {
    showModal('Información de Pago', `
        <div class="payment-details">
            <p><strong>Costo por apuesta:</strong> $${(CONFIG.costo_apuesta || 5000).toLocaleString('es-CO')} COP</p>
            <p><strong>Nequi:</strong> ${CONFIG.nequi || '3218593047'}</p>
            <p><strong>Banco:</strong> ${CONFIG.banco || 'Bancolombia | Cuenta: 08585591247 | Titular: Polla Mundialista'}</p>
            <p>Después de apostar, ve a <a href="apuestas.html">Mis Apuestas</a> y paga cada partido.</p>
        </div>
    `);
}
