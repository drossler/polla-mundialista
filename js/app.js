// ============================================================
// APP.JS — LANDING PAGE con Supabase
// ============================================================

document.addEventListener('supabase:ready', async function () {
    await loadConfig();

    // Mobile menu
    const mobileToggle = document.querySelector('.mobile-menu-toggle');
    const navLinks = document.querySelector('.nav-links');
    mobileToggle?.addEventListener('click', () => navLinks.classList.toggle('active'));

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                navLinks?.classList.remove('active');
            }
        });
    });

    // Cargar datos iniciales
    await Promise.all([
        renderParticipantsCount(),
        renderUpcomingMatches(),
        renderLeaderboardPreview()
    ]);

    // Formulario de registro
    document.getElementById('register-form')?.addEventListener('submit', handleRegistration);

    // Realtime: actualizar ranking si cambian puntos
    Realtime.onProfilesChange(() => renderLeaderboardPreview());
    Realtime.onMatchesChange(() => renderUpcomingMatches());

    // Modal
    document.querySelector('.modal-close')?.addEventListener('click', closeModal);
    document.getElementById('modal')?.addEventListener('click', e => {
        if (e.target === document.getElementById('modal')) closeModal();
    });
});

async function renderParticipantsCount() {
    const countEl = document.getElementById('participantes-count');
    if (!countEl) return;
    try {
        const profiles = await DB.getPaidProfiles();
        animateNumber(countEl, 0, profiles.length, 1500);
    } catch (e) { countEl.textContent = '0'; }
}

function animateNumber(element, start, end, duration) {
    let startTime = null;
    function step(timestamp) {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        element.textContent = Math.floor(progress * (end - start) + start);
        if (progress < 1) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
}

async function renderUpcomingMatches() {
    const container = document.getElementById('upcoming-matches');
    if (!container) return;
    try {
        const matches = await DB.getMatches({ status: 'upcoming' });
        const slice = matches.slice(0, 6);
        container.innerHTML = slice.map(match => {
            const t1 = getTeam(match.team1);
            const t2 = getTeam(match.team2);
            return `
                <div class="match-card">
                    <div class="match-phase">Grupo ${match.group_name}</div>
                    <div class="match-teams">
                        <div class="team">
                            <span class="team-flag">${t1.flag}</span>
                            <span class="team-name">${t1.name}</span>
                        </div>
                        <div class="match-vs">VS</div>
                        <div class="team">
                            <span class="team-flag">${t2.flag}</span>
                            <span class="team-name">${t2.name}</span>
                        </div>
                    </div>
                    <div class="match-info">
                        <span><i class="fas fa-calendar"></i> ${formatDate(match.match_date)}</span>
                        <span><i class="fas fa-clock"></i> ${match.match_time}</span>
                        <span><i class="fas fa-map-marker-alt"></i> ${match.stadium}</span>
                    </div>
                </div>`;
        }).join('');
    } catch (e) {
        container.innerHTML = '<p>No se pudieron cargar los partidos.</p>';
    }
}

async function renderLeaderboardPreview() {
    const tbody = document.getElementById('leaderboard-preview-body');
    if (!tbody) return;
    try {
        const users = (await DB.getPaidProfiles()).slice(0, 5);
        tbody.innerHTML = users.map((user, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`;
            return `
                <tr>
                    <td class="position">${medal}</td>
                    <td class="player">${user.nombre}</td>
                    <td class="points">${user.points}</td>
                    <td class="exact">${user.exact_count}</td>
                    <td class="streak">${user.streak > 2 ? '🔥 ' + user.streak : user.streak}</td>
                </tr>`;
        }).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5">No hay datos aún.</td></tr>';
    }
}

async function handleRegistration(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');

    const nombre   = document.getElementById('reg-name').value.trim();
    const email    = document.getElementById('reg-email').value.trim();
    const telefono = document.getElementById('reg-phone').value.trim();
    const password  = document.getElementById('reg-password').value;
    const password2 = document.getElementById('reg-password2').value;

    if (password !== password2) {
        showModal('Error', 'Las contraseñas no coinciden');
        return;
    }
    if (password.length < 6) {
        showModal('Error', 'La contraseña debe tener al menos 6 caracteres');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando...';

    try {
        await Auth.register(email, password, nombre, telefono);
        showModal('¡Registro Exitoso!', `
            Bienvenido <strong>${nombre}</strong>! Tu cuenta ha sido creada.<br><br>
            Cada apuesta cuesta <strong>$${(CONFIG.costo_apuesta || 5000).toLocaleString('es-CO')} COP</strong>.
            Después de registrarte, ingresa a <strong>Mis Apuestas</strong> y paga cada partido por separado.<br><br>
            <div class="payment-info">
                <p><strong>Nequi:</strong> ${CONFIG.nequi || '3218593047'}</p>
                <p><strong>Banco:</strong> ${CONFIG.banco || 'Bancolombia | Cuenta: 08585591247 | Titular: Polla Mundialista'}</p>
            </div><br>
            <a href="login.html" class="btn-primary">Ir al Login</a>
        `);
        setTimeout(() => { window.location.href = 'login.html'; }, 4000);
    } catch (err) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-user-plus"></i> Registrarse';
        const msg = err.message?.includes('already registered')
            ? 'Este correo ya está registrado. <a href="login.html">Inicia sesión.</a>'
            : err.message || 'Error al registrarse';
        showModal('Error', msg);
    }
}
