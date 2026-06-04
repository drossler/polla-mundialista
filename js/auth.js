// ============================================================
// AUTH.JS — Login con Supabase Auth
// Sin passwords hardcodeados, sin admin local
// ============================================================

document.addEventListener('supabase:ready', async function () {
    // Verificar si es callback de recovery de contraseña
    const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));
    const accessToken = hashParams.get('access_token');
    const type = hashParams.get('type');

    if (type === 'recovery' && accessToken) {
        // Mostrar formulario de nueva contraseña
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.innerHTML = `
                <h3 style="text-align:center;margin-bottom:1rem">Recuperar Contraseña</h3>
                <div class="form-group">
                    <label><i class="fas fa-lock"></i> Nueva Contraseña</label>
                    <input type="password" id="recovery-password" required placeholder="Mínimo 6 caracteres">
                </div>
                <div class="form-group">
                    <label><i class="fas fa-lock"></i> Confirmar Contraseña</label>
                    <input type="password" id="recovery-password2" required placeholder="Repite la contraseña">
                </div>
                <button type="button" class="btn-auth" onclick="handleRecoveryPassword()">
                    <i class="fas fa-save"></i> Actualizar Contraseña
                </button>
                <p style="text-align:center;margin-top:1rem"><a href="login.html">Volver al login</a></p>
            `;
            document.querySelector('.auth-divider')?.remove();
            document.querySelector('.auth-social')?.remove();
            document.querySelector('.auth-footer')?.remove();
            document.querySelector('.form-options')?.remove();
        }
        return;
    }

    // Redirigir si ya está logueado
    const session = await Auth.getSession();
    if (session) {
        const profile = await DB.getProfile(session.user.id);
        window.location.href = profile?.role === 'admin' ? 'admin.html' : 'dashboard.html';
        return;
    }

    // Toggle password
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', function () {
            const input = this.previousElementSibling;
            input.type = input.type === 'password' ? 'text' : 'password';
            this.classList.toggle('fa-eye');
            this.classList.toggle('fa-eye-slash');
        });
    });

    // Login form
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);

    // Forgot password
    document.querySelector('.forgot-password')?.addEventListener('click', handleForgotPassword);

    // Modal listeners
    document.querySelector('.modal-close')?.addEventListener('click', closeModal);
    document.getElementById('modal')?.addEventListener('click', e => {
        if (e.target === document.getElementById('modal')) closeModal();
    });
});

async function handleRecoveryPassword() {
    const password  = document.getElementById('recovery-password')?.value;
    const password2 = document.getElementById('recovery-password2')?.value;

    if (!password || password !== password2) {
        showModal('Error', 'Las contraseñas no coinciden');
        return;
    }
    if (password.length < 6) {
        showModal('Error', 'La contraseña debe tener al menos 6 caracteres');
        return;
    }

    try {
        const { error } = await getSB().auth.updateUser({ password });
        if (error) throw error;
        await getSB().auth.signOut();
        showModal('✅ Contraseña Actualizada', 'Tu contraseña ha sido cambiada exitosamente. Ahora puedes iniciar sesión.');
        setTimeout(() => { window.location.href = 'login.html'; }, 3000);
    } catch (err) {
        showModal('Error', err.message + ' Intenta solicitar un nuevo correo de recuperación.');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';

    try {
        await Auth.login(email, password);
        const profile = await DB.getCurrentProfile();
        window.location.href = profile?.role === 'admin' ? 'admin.html' : 'dashboard.html';
    } catch (err) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Iniciar Sesión';
        const msg = err.message?.includes('Invalid login') || err.message?.includes('invalid')
            ? 'Correo o contraseña incorrectos'
            : err.message || 'Error al iniciar sesión';
        showModal('Error', `<p style="color:#ef4444">${msg}</p>`);
    }
}

async function handleForgotPassword(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    if (!email) {
        showModal('Recuperar Contraseña', '<p>Escribe tu correo en el campo de email y luego haz clic aquí.</p>');
        return;
    }
    try {
        await Auth.resetPassword(email);
        showModal('Correo Enviado', `<p>Revisa tu bandeja de entrada en <strong>${email}</strong> para resetear tu contraseña.</p>`);
    } catch (err) {
        showModal('Error', `<p>${err.message}</p>`);
    }
}
