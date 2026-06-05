// ============================================================
// PERFIL.JS — Perfil de usuario con Supabase
// ============================================================

let currentUser = null;

document.addEventListener('supabase:ready', async function () {
    currentUser = await checkAuth();
    if (!currentUser) return;

    await loadConfig();
    setupSidebar();

    // Sidebar info
    document.getElementById('user-name').textContent  = currentUser.nombre;
    document.getElementById('user-email').textContent = currentUser.email;
    setStatusBadge(document.getElementById('user-status'), currentUser.paid);

    // Perfil info
    document.getElementById('profile-name').textContent  = currentUser.nombre;
    document.getElementById('profile-email').textContent = currentUser.email;

    // Formulario
    document.getElementById('edit-name').value  = currentUser.nombre;
    document.getElementById('edit-email').value = currentUser.email;
    document.getElementById('edit-phone').value = currentUser.telefono || '';

    // Equipo favorito
    const teamSelect = document.getElementById('edit-favorite-team');
    if (teamSelect) {
        Object.entries(TEAMS).forEach(([code, team]) => {
            const option = document.createElement('option');
            option.value = code;
            option.textContent = `${team.flag} ${team.name}`;
            if (currentUser.favorite_team === code) option.selected = true;
            teamSelect.appendChild(option);
        });
    }

    // Estadísticas
    document.getElementById('prof-points').textContent = currentUser.points;
    document.getElementById('prof-exact').textContent  = currentUser.exact_count;
    const total = currentUser.exact_count + currentUser.winner_count + currentUser.wrong_count;
    const accuracy = total > 0 ? Math.round(((currentUser.exact_count + currentUser.winner_count) / total) * 100) : 0;
    document.getElementById('prof-accuracy').textContent = accuracy + '%';

    // Posición
    try {
        const all = await DB.getPaidProfiles();
        const pos = all.findIndex(u => u.id === currentUser.id) + 1;
        document.getElementById('prof-position').textContent = pos > 0 ? `#${pos}` : '--';
    } catch (e) {}

    // Estado de pago
    try {
        const myBets = await DB.getUserBets(currentUser.id);
        const paidBets = myBets.filter(b => b.paid).length;
        const pendingBets = myBets.filter(b => !b.paid).length;
        const payCard = document.getElementById('payment-status-card');
        if (payCard) {
            payCard.innerHTML = `
                <div style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center">
                    <div class="mini-stat"><strong>✅ Pagadas:</strong> ${paidBets}</div>
                    <div class="mini-stat"><strong>⏳ Pendientes:</strong> ${pendingBets}</div>
                    <div class="mini-stat"><strong>💰 Costo:</strong> $${(CONFIG.costo_apuesta || 5000).toLocaleString('es-CO')} COP</div>
                </div>`;
        }
        document.getElementById('pay-costo').textContent = (CONFIG.costo_apuesta || 5000).toLocaleString('es-CO');
        document.getElementById('pay-nequi').textContent = CONFIG.nequi || '+57 300 123 4567';
        document.getElementById('pay-banco').textContent = CONFIG.banco || 'Bancolombia | Cuenta: 1234567890 | Titular: Polla Mundialista';
    } catch (e) {}

    // Formulario de perfil
    document.getElementById('profile-form')?.addEventListener('submit', handleProfileUpdate);

    // Formulario de comprobante
    document.getElementById('payment-form')?.addEventListener('submit', handlePaymentSubmit);

    // Cambiar contraseña
    document.getElementById('change-password-form')?.addEventListener('submit', handleChangePassword);

    // Realtime: actualizar puntos si cambian
    Realtime.onProfilesChange(payload => {
        if (payload.new?.id === currentUser.id) {
            currentUser = payload.new;
            document.getElementById('prof-points').textContent = currentUser.points;
            document.getElementById('prof-exact').textContent  = currentUser.exact_count;
        }
    });

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

function setStatusBadge(el, paid) {
    if (!el) return;
    el.textContent = paid ? '✅ Pago Confirmado' : '⏳ Pendiente de Pago';
    el.className   = paid ? 'user-status paid' : 'user-status pending';
}

async function handleProfileUpdate(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const updated = await DB.updateProfile(currentUser.id, {
            nombre:        document.getElementById('edit-name').value.trim(),
            telefono:      document.getElementById('edit-phone').value.trim(),
            favorite_team: document.getElementById('edit-favorite-team')?.value || ''
        });
        currentUser = updated;
        document.getElementById('profile-name').textContent = updated.nombre;
        document.getElementById('user-name').textContent    = updated.nombre;
        showModal('✅ Éxito', 'Perfil actualizado correctamente');
    } catch (err) {
        showModal('Error', err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
    }
}

async function handlePaymentSubmit(e) {
    e.preventDefault();
    const notes = document.getElementById('payment-notes')?.value || '';
    const btn   = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

    try {
        await DB.submitPayment(currentUser.id, notes);
        showModal('✅ Comprobante Enviado', 'El administrador revisará tu comprobante y activará tu cuenta en breve.');
        e.target.reset();
    } catch (err) {
        showModal('Error', err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Comprobante';
    }
}

async function markAsPaid() {
    try {
        const profile = await DB.getCurrentProfile();
        if (!profile) return;
        // Verificar si es admin
        if (profile.role === 'admin') {
            await DB.adminConfirmPayment(profile.id);
            showModal('✅ Pago Confirmado', 'Te has marcado como pagado');
            location.reload();
        } else {
            // Si es usuario normal, redirigir al envío de comprobante
            const notes = document.getElementById('payment-notes')?.value || 'Marcado manualmente';
            await DB.submitPayment(profile.id, notes);
            showModal('✅ Comprobante Enviado', 'Tu solicitud de pago ha sido enviada al administrador');
        }
    } catch (e) { showModal('Error', e.message); }
}

async function handleChangePassword(e) {
    e.preventDefault();
    const newPass  = document.getElementById('new-password')?.value;
    const newPass2 = document.getElementById('new-password2')?.value;

    if (!newPass || newPass !== newPass2) {
        showModal('Error', 'Las contraseñas no coinciden');
        return;
    }
    if (newPass.length < 6) {
        showModal('Error', 'La contraseña debe tener al menos 6 caracteres');
        return;
    }

    try {
        const { error } = await getSB().auth.updateUser({ password: newPass });
        if (error) throw error;
        showModal('✅ Éxito', 'Contraseña actualizada correctamente');
        e.target.reset();
    } catch (err) {
        showModal('Error', err.message);
    }
}
