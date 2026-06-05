// ============================================================
// CALENDARIO.JS — Calendario de partidos con Supabase
// ============================================================

let currentUser = null;

document.addEventListener('supabase:ready', async function () {
    currentUser = await checkAuth();
    if (!currentUser) return;

    await loadConfig();
    setupSidebar();

    document.getElementById('user-name').textContent  = currentUser.nombre;
    document.getElementById('user-email').textContent = currentUser.email;

    document.getElementById('calendar-phase')?.addEventListener('change', renderCalendar);
    document.getElementById('calendar-group')?.addEventListener('change', renderCalendar);

    await renderCalendar();

    try {
        const bets = await DB.getUserBets(currentUser.id);
        setStatusBadge(document.getElementById('user-status'), bets.filter(b => !b.paid).length);
    } catch (e) {}

    Realtime.onMatchesChange(() => renderCalendar());

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

async function renderCalendar() {
    const container = document.getElementById('calendar-grid');
    if (!container) return;

    const phaseFilter = document.getElementById('calendar-phase')?.value || 'all';
    const groupFilter = document.getElementById('calendar-group')?.value || 'all';

    try {
        const filters = {};
        if (phaseFilter !== 'all') filters.phase = phaseFilter;
        if (groupFilter !== 'all') filters.group_name = groupFilter;

        const matches = await DB.getMatches(filters);

        // Agrupar por fecha
        const grouped = {};
        matches.forEach(m => {
            const key = m.match_date;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(m);
        });

        const sortedDates = Object.keys(grouped).sort();

        if (sortedDates.length === 0) {
            container.innerHTML = '<div class="no-calendar"><i class="fas fa-calendar-times"></i><p>No hay partidos en este período</p></div>';
            return;
        }

        container.innerHTML = sortedDates.map(date => {
            const dayMatches = grouped[date].sort((a, b) => a.match_time.localeCompare(b.match_time));
            const dateObj    = new Date(date + 'T00:00:00');
            const dayName    = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

            return `
                <div class="calendar-day">
                    <div class="calendar-day-header">
                        <span class="day-name">${dayName}</span>
                        <span class="day-count">${dayMatches.length} partidos</span>
                    </div>
                    <div class="calendar-matches">
                        ${dayMatches.map(match => {
                            const t1 = getTeam(match.team1);
                            const t2 = getTeam(match.team2);
                            const statusClass = match.status === 'finished' ? 'finished' : match.status === 'live' ? 'live' : 'upcoming';
                            const statusText  = match.status === 'finished' ? 'Finalizado' : match.status === 'live' ? 'En Vivo 🔴' : 'Pendiente';
                            const result = match.status === 'finished' ? `${match.score1} - ${match.score2}` : 'VS';
                            return `
                                <div class="calendar-match ${statusClass}">
                                    <div class="match-time">${match.match_time}</div>
                                    <div class="match-teams-cal">
                                        <div class="cal-team">
                                            <span class="flag">${t1.flag}</span>
                                            <span class="name">${t1.name}</span>
                                        </div>
                                        <div class="cal-result">${result}</div>
                                        <div class="cal-team">
                                            <span class="name">${t2.name}</span>
                                            <span class="flag">${t2.flag}</span>
                                        </div>
                                    </div>
                                    <div class="match-meta-cal">
                                        <span class="group">Grupo ${match.group_name}</span>
                                        <span class="stadium"><i class="fas fa-map-marker-alt"></i> ${match.stadium}</span>
                                        <span class="status ${statusClass}">${statusText}</span>
                                    </div>
                                </div>`;
                        }).join('')}
                    </div>
                </div>`;
        }).join('');
    } catch (e) {
        container.innerHTML = `<p style="color:#ef4444">Error: ${e.message}</p>`;
    }
}
