// ============================================================
// SUPABASE CLIENT - POLLA MUNDIALISTA 2026
// Reemplaza completamente localStorage como backend
// ============================================================

const SUPABASE_URL  = 'https://ocdmgaolgwzscsnjvjen.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jZG1nYW9sZ3d6c2Nzbmp2amVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MDM1MTAsImV4cCI6MjA5NjA3OTUxMH0.yLww3fmUT10jfkWZtZtX8BamwvMQK5pdWBk-hkUQoUw';

// Cargar Supabase JS desde CDN
(function loadSupabase() {
    if (window.supabase) return;
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    s.onload = () => {
        window._sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
            auth: { persistSession: true, autoRefreshToken: true }
        });
        document.dispatchEvent(new Event('supabase:ready'));
    };
    document.head.appendChild(s);
})();

// Acceso global al cliente
function getSB() {
    return window._sb;
}

// ============================================================
// AUTH
// ============================================================
const Auth = {
    // Registro con metadata de nombre/teléfono
    async register(email, password, nombre, telefono) {
        const { data, error } = await getSB().auth.signUp({
            email, password,
            options: { data: { nombre, telefono } }
        });
        if (error) throw error;
        return data.user;
    },

    // Login
    async login(email, password) {
        const { data, error } = await getSB().auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data.user;
    },

    // Logout
    async logout() {
        await getSB().auth.signOut();
        window.location.href = 'index.html';
    },

    // Sesión actual
    async getSession() {
        const { data: { session } } = await getSB().auth.getSession();
        return session;
    },

    // Usuario actual (solo el objeto auth, sin perfil)
    async getUser() {
        const { data: { user } } = await getSB().auth.getUser();
        return user;
    },

    // Recuperar contraseña
    async resetPassword(email) {
        const { error } = await getSB().auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/login.html'
        });
        if (error) throw error;
    },

    // Escuchar cambios de sesión
    onAuthChange(callback) {
        return getSB().auth.onAuthStateChange(callback);
    }
};

// ============================================================
// DB — Capa de datos sobre Supabase (reemplaza objeto DB)
// ============================================================
const DB = {
    // ---- PERFIL ----
    async getProfile(userId) {
        const { data, error } = await getSB()
            .from('profiles').select('*').eq('id', userId).single();
        if (error) throw error;
        return data;
    },

    async getCurrentProfile() {
        const user = await Auth.getUser();
        if (!user) return null;
        return this.getProfile(user.id);
    },

    async updateProfile(userId, updates) {
        const { data, error } = await getSB()
            .from('profiles').update(updates).eq('id', userId).select().single();
        if (error) throw error;
        return data;
    },

    async getAllProfiles() {
        const { data, error } = await getSB()
            .from('profiles').select('*').order('points', { ascending: false });
        if (error) throw error;
        return data;
    },

    async getPaidProfiles() {
        const { data, error } = await getSB()
            .from('profiles').select('*').order('points', { ascending: false });
        if (error) throw error;
        return data;
    },

    // ---- PARTIDOS ----
    async getMatches(filters = {}) {
        let q = getSB().from('matches').select('*').order('match_date').order('match_time');
        if (filters.status)     q = q.eq('status', filters.status);
        if (filters.group_name) q = q.eq('group_name', filters.group_name);
        if (filters.phase)      q = q.eq('phase', filters.phase);
        const { data, error } = await q;
        if (error) throw error;
        return data;
    },

    async getMatch(id) {
        const { data, error } = await getSB()
            .from('matches').select('*').eq('id', id).single();
        if (error) throw error;
        return data;
    },

    async updateMatch(id, updates) {
        const { data, error } = await getSB()
            .from('matches').update(updates).eq('id', id).select().single();
        if (error) throw error;
        return data;
    },

    // ---- APUESTAS ----
    async getUserBets(userId) {
        const { data, error } = await getSB()
            .from('bets').select('*, matches(*)').eq('user_id', userId);
        if (error) throw error;
        return data;
    },

    async getAllBets() {
        const { data, error } = await getSB()
            .from('bets').select('*, profiles(nombre,email), matches(team1,team2,match_date)');
        if (error) throw error;
        return data;
    },

    async placeBet(userId, matchId, prediction1, prediction2) {
        const { data, error } = await getSB()
            .from('bets')
            .upsert({ user_id: userId, match_id: matchId, prediction1, prediction2 },
                    { onConflict: 'user_id,match_id' })
            .select().single();
        if (error) throw error;
        return data;
    },

    async deleteBet(userId, matchId) {
        const { error } = await getSB()
            .from('bets').delete().eq('user_id', userId).eq('match_id', matchId);
        if (error) throw error;
    },

    // ---- PAGOS ----
    async getPayments(userId = null) {
        let q = getSB().from('payments').select('*, profiles(nombre,email), bets(matches(team1,team2))').order('created_at', { ascending: false });
        if (userId) q = q.eq('user_id', userId);
        const { data, error } = await q;
        if (error) throw error;
        return data;
    },

    async submitPayment(userId, notes = '', betId = null) {
        const payload = { user_id: userId, comprobante_notes: notes };
        if (betId) payload.bet_id = betId;
        const { data, error } = await getSB()
            .from('payments')
            .insert(payload)
            .select().single();
        if (error) throw error;
        return data;
    },

    async approvePayment(paymentId, adminId, betId) {
        const { data: pay, error: e1 } = await getSB()
            .from('payments').select('user_id, bet_id').eq('id', paymentId).single();
        if (e1) throw e1;

        const targetBetId = betId || pay?.bet_id;

        await getSB()
            .from('payments')
            .update({ approved: true, approved_by: adminId, approved_at: new Date().toISOString() })
            .eq('id', paymentId);

        // Si el pago está asociado a una apuesta, marcar esa apuesta como pagada
        if (targetBetId) {
            await getSB()
                .from('bets')
                .update({ paid: true, paid_at: new Date().toISOString() })
                .eq('id', targetBetId);
        }
    },

    async payBetPayout(betId, adminId) {
        await getSB()
            .from('bets')
            .update({ payout: true, payout_at: new Date().toISOString() })
            .eq('id', betId);
        await getSB()
            .from('payments')
            .insert({
                user_id: adminId,
                bet_id: betId,
                comprobante_notes: 'Pago por partido vía Nequi',
                approved: true,
                approved_by: adminId,
                approved_at: new Date().toISOString(),
                payout: true,
                payout_at: new Date().toISOString()
            });
    },

    async rejectPayment(paymentId, userId) {
        await getSB().from('payments').delete().eq('id', paymentId);
    },

    // ---- CONFIG ----
    async getConfig() {
        const { data, error } = await getSB()
            .from('config').select('*').eq('id', 1).single();
        if (error) throw error;
        return data;
    },

    async updateConfig(updates) {
        const { data, error } = await getSB()
            .from('config').update(updates).eq('id', 1).select().single();
        if (error) throw error;
        return data;
    },

    // ---- RESULTADO PARTIDO (ADMIN) ----
    async saveMatchResult(matchId, score1, score2) {
        // 1. Actualizar partido
        await this.updateMatch(matchId, {
            score1, score2,
            status: 'finished',
            betting_closed: true
        });
        // 2. Llamar función SQL que recalcula todos los puntos
        const { error } = await getSB().rpc('recalculate_match_points', { p_match_id: matchId });
        if (error) throw error;
    },

    // ---- ADMIN: usuarios ----
    async adminConfirmPayment(userId) {
        const { error } = await getSB()
            .from('profiles')
            .update({ paid: true, paid_date: new Date().toISOString().split('T')[0] })
            .eq('id', userId);
        if (error) throw error;
    },

    async adminDeleteUser(userId) {
        const { error } = await getSB().rpc('admin_delete_user', { target_user_id: userId });
        if (error) {
            // Fallback manual si la RPC falla
            await getSB().from('payments').delete().eq('user_id', userId);
            await getSB().from('bets').delete().eq('user_id', userId);
            await getSB().from('profiles').delete().eq('id', userId);
        }
    }
};

// ============================================================
// REALTIME — Suscripciones en tiempo real
// ============================================================
const Realtime = {
    channels: {},

    // Escuchar cambios en partidos (para todos)
    onMatchesChange(callback) {
        const ch = getSB()
            .channel('public:matches')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, callback)
            .subscribe();
        this.channels['matches'] = ch;
        return ch;
    },

    // Escuchar cambios en apuestas del usuario actual
    onUserBetsChange(userId, callback) {
        const ch = getSB()
            .channel('bets:' + userId)
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'bets',
                filter: `user_id=eq.${userId}`
            }, callback)
            .subscribe();
        this.channels['bets_' + userId] = ch;
        return ch;
    },

    // Escuchar cambios en perfiles (para ranking en tiempo real)
    onProfilesChange(callback) {
        const ch = getSB()
            .channel('public:profiles')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, callback)
            .subscribe();
        this.channels['profiles'] = ch;
        return ch;
    },

    // Escuchar pagos (para admin)
    onPaymentsChange(callback) {
        const ch = getSB()
            .channel('public:payments')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, callback)
            .subscribe();
        this.channels['payments'] = ch;
        return ch;
    },

    // Escuchar config
    onConfigChange(callback) {
        const ch = getSB()
            .channel('public:config')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'config' }, callback)
            .subscribe();
        this.channels['config'] = ch;
        return ch;
    },

    // Desuscribirse de todo
    unsubscribeAll() {
        Object.values(this.channels).forEach(ch => getSB().removeChannel(ch));
        this.channels = {};
    }
};

// ============================================================
// HELPERS (compatibles con el código original)
// ============================================================
function getTeam(code) {
    return TEAMS[code] || { name: code, flag: '🏳️', group: '' };
}

function formatDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatDateTime(dateStr, timeStr) {
    const date = new Date(dateStr + 'T' + timeStr + ':00');
    return date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function generateId() {
    return crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).substr(2));
}

// ============================================================
// GUARD DE AUTENTICACIÓN
// ============================================================
async function checkAuth() {
    const session = await Auth.getSession();
    if (!session) {
        window.location.href = 'login.html';
        return null;
    }
    try {
        return await DB.getProfile(session.user.id);
    } catch (e) {
        // Perfil no existe - crearlo desde metadata de auth
        try {
            const user = await Auth.getUser();
            await getSB().from('profiles').insert({
                id: user.id,
                nombre: user.user_metadata?.nombre || user.email?.split('@')[0] || 'Usuario',
                email: user.email,
                telefono: user.user_metadata?.telefono || ''
            });
            return await DB.getProfile(session.user.id);
        } catch (e2) {
            console.error('Error creando perfil:', e2);
            window.location.href = 'login.html';
            return null;
        }
    }
}

async function checkAdmin() {
    const profile = await checkAuth();
    if (!profile || profile.role !== 'admin') {
        window.location.href = 'login.html';
        return null;
    }
    return profile;
}

async function logout() {
    await Auth.logout();
}

// Modal (compatible con código original)
function showModal(title, content) {
    const modal = document.getElementById('modal');
    const modalBody = document.getElementById('modal-body');
    if (!modal || !modalBody) return;
    modalBody.innerHTML = `<h3>${title}</h3><div>${content}</div>`;
    modal.style.display = 'flex';
}

function closeModal() {
    const modal = document.getElementById('modal');
    if (modal) modal.style.display = 'none';
}

// Mostrar error como toast o modal
function showError(msg) {
    showModal('Error', `<p style="color:#ef4444">${msg}</p>`);
}

function showSuccess(msg) {
    showModal('✅ Éxito', `<p>${msg}</p>`);
}
