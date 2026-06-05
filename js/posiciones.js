// ============================================================
// POSICIONES.JS — Ranking en tiempo real con Supabase
// ============================================================

let currentUser = null;

document.addEventListener('supabase:ready', async function () {
    currentUser = await checkAuth();
    if (!currentUser) return;

    await loadConfig();
    setupSidebar();

    document.getElementById('user-name').textContent  = currentUser.nombre;
    document.getElementById('user-email').textContent = currentUser.email;

    await renderLeaderboard();

    try {
        const myBets = await DB.getUserBets(currentUser.id);
        const unpaid = myBets.filter(b => !b.paid).length;
        setStatusBadge(document.getElementById('user-status'), unpaid);
    } catch (e) {}

    // REALTIME: actualizar ranking automáticamente
    Realtime.onProfilesChange(() => renderLeaderboard());

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

async function renderLeaderboard() {
    const tbody         = document.getElementById('leaderboard-body');
    const totalPlayers  = document.getElementById('total-players');
    const matchesPlayed = document.getElementById('matches-played');
    if (!tbody) return;

    try {
        const users   = await DB.getPaidProfiles();
        const matches = await DB.getMatches({ status: 'finished' });

        if (totalPlayers)  totalPlayers.textContent  = users.length;
        if (matchesPlayed) matchesPlayed.textContent = matches.length;

        tbody.innerHTML = users.map((u, index) => {
            const position = index + 1;
            const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : position;
            const total = u.exact_count + u.winner_count + u.wrong_count;
            const accuracy = total > 0 ? Math.round(((u.exact_count + u.winner_count) / total) * 100) : 0;
            const isMe = u.id === currentUser.id;
            return `
                <tr class="${isMe ? 'current-user' : ''}">
                    <td class="position">${medal}</td>
                    <td class="player">
                        <div class="player-info">
                            <span class="player-name">${u.nombre}</span>
                            ${isMe ? '<span class="you-badge">TÚ</span>' : ''}
                        </div>
                    </td>
                    <td class="points">${u.points}</td>
                    <td class="exact">${u.exact_count}</td>
                    <td class="winner">${u.winner_count}</td>
                    <td class="wrong">${u.wrong_count}</td>
                    <td class="accuracy">
                        <div class="accuracy-bar">
                            <div class="accuracy-fill" style="width:${accuracy}%"></div>
                            <span>${accuracy}%</span>
                        </div>
                    </td>
                    <td class="streak">${u.streak > 2 ? '🔥 ' + u.streak : u.streak}</td>
                </tr>`;
        }).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="8" style="color:#ef4444">Error: ${e.message}</td></tr>`;
    }
}
