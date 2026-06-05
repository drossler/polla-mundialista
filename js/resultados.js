// ============================================================
// RESULTADOS.JS — Resultados del usuario con Supabase
// ============================================================

let currentUser = null;

document.addEventListener('supabase:ready', async function () {
    currentUser = await checkAuth();
    if (!currentUser) return;

    await loadConfig();
    setupSidebar();

    document.getElementById('user-name').textContent  = currentUser.nombre;
    document.getElementById('user-email').textContent = currentUser.email;

    document.getElementById('results-phase')?.addEventListener('change', () => renderResults());
    await renderResults();

    try {
        const bets = await DB.getUserBets(currentUser.id);
        setStatusBadge(document.getElementById('user-status'), bets.filter(b => !b.paid).length);
    } catch (e) {}

    Realtime.onMatchesChange(() => renderResults());
    Realtime.onUserBetsChange(currentUser.id, () => renderResults());

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

async function renderResults() {
    const phaseFilter = document.getElementById('results-phase')?.value || 'all';
    const container   = document.getElementById('results-list');
    if (!container) return;

    try {
        const bets    = await DB.getUserBets(currentUser.id);
        let   matches = await DB.getMatches({ status: 'finished' });
        if (phaseFilter !== 'all') matches = matches.filter(m => m.phase === phaseFilter);

        let exact = 0, winner = 0, wrong = 0;

        const results = matches.map(match => {
            const bet = bets.find(b => b.match_id === match.id);
            if (!bet) return null;
            const t1 = getTeam(match.team1);
            const t2 = getTeam(match.team2);
            if (bet.result_type === 'exact')  exact++;
            if (bet.result_type === 'winner') winner++;
            if (bet.result_type === 'wrong')  wrong++;
            return { match, bet, t1, t2 };
        }).filter(Boolean);

        const total = exact + winner + wrong;
        const accuracy = total > 0 ? Math.round(((exact + winner) / total) * 100) : 0;

        const el2 = (id) => document.getElementById(id);
        if (el2('my-exact'))    el2('my-exact').textContent    = exact;
        if (el2('my-winner'))   el2('my-winner').textContent   = winner;
        if (el2('my-wrong'))    el2('my-wrong').textContent    = wrong;
        if (el2('my-accuracy')) el2('my-accuracy').textContent = accuracy + '%';

        if (results.length === 0) {
            container.innerHTML = '<div class="no-results"><i class="fas fa-futbol"></i><p>Aún no hay resultados disponibles</p></div>';
            return;
        }

        container.innerHTML = results.map(r => {
            const cls  = r.bet.result_type === 'exact' ? 'exact' : r.bet.result_type === 'winner' ? 'winner' : 'wrong';
            const icon = r.bet.result_type === 'exact' ? '🎯' : r.bet.result_type === 'winner' ? '✅' : '❌';
            const pts  = r.bet.points_earned > 0 ? `+${r.bet.points_earned} pts` : '0 pts';
            const label = r.bet.result_type === 'exact' ? 'Resultado Exacto' : r.bet.result_type === 'winner' ? 'Ganador Correcto' : 'Incorrecto';
            return `
                <div class="result-card ${cls}">
                    <div class="result-header">
                        <span class="result-phase">${r.match.phase === 'group' ? 'Grupo ' + r.match.group_name : r.match.phase}</span>
                        <span class="result-date">${formatDate(r.match.match_date)}</span>
                    </div>
                    <div class="result-teams">
                        <div class="result-team">
                            <span class="flag">${r.t1.flag}</span>
                            <span class="name">${r.t1.name}</span>
                            <span class="prediction">Pred: ${r.bet.prediction1}</span>
                            <span class="real">Real: ${r.match.score1}</span>
                        </div>
                        <div class="result-vs">VS</div>
                        <div class="result-team">
                            <span class="flag">${r.t2.flag}</span>
                            <span class="name">${r.t2.name}</span>
                            <span class="prediction">Pred: ${r.bet.prediction2}</span>
                            <span class="real">Real: ${r.match.score2}</span>
                        </div>
                    </div>
                    <div class="result-footer">
                        <span class="result-type">${icon} ${label}</span>
                        <span class="result-points">${pts}</span>
                    </div>
                </div>`;
        }).join('');
    } catch (e) {
        container.innerHTML = `<p style="color:#ef4444">Error: ${e.message}</p>`;
    }
}
