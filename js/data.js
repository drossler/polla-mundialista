// ============================================================
// DATA.JS — Solo datos estáticos de equipos y configuración
// Sin localStorage. Toda la persistencia va a Supabase.
// ============================================================

const TEAMS = {
    'MEX': { name: 'México', flag: '🇲🇽', group: 'A' },
    'RSA': { name: 'Sudáfrica', flag: '🇿🇦', group: 'A' },
    'KOR': { name: 'Corea del Sur', flag: '🇰🇷', group: 'A' },
    'CZE': { name: 'Rep. Checa', flag: '🇨🇿', group: 'A' },
    'CAN': { name: 'Canadá', flag: '🇨🇦', group: 'B' },
    'BIH': { name: 'Bosnia', flag: '🇧🇦', group: 'B' },
    'QAT': { name: 'Qatar', flag: '🇶🇦', group: 'B' },
    'SUI': { name: 'Suiza', flag: '🇨🇭', group: 'B' },
    'BRA': { name: 'Brasil', flag: '🇧🇷', group: 'C' },
    'MAR': { name: 'Marruecos', flag: '🇲🇦', group: 'C' },
    'HAI': { name: 'Haití', flag: '🇭🇹', group: 'C' },
    'SCO': { name: 'Escocia', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', group: 'C' },
    'USA': { name: 'Estados Unidos', flag: '🇺🇸', group: 'D' },
    'PAR': { name: 'Paraguay', flag: '🇵🇾', group: 'D' },
    'AUS': { name: 'Australia', flag: '🇦🇺', group: 'D' },
    'TUR': { name: 'Turquía', flag: '🇹🇷', group: 'D' },
    'GER': { name: 'Alemania', flag: '🇩🇪', group: 'E' },
    'CIV': { name: 'Costa de Marfil', flag: '🇨🇮', group: 'E' },
    'ECU': { name: 'Ecuador', flag: '🇪🇨', group: 'E' },
    'CUW': { name: 'Curazao', flag: '🇨🇼', group: 'E' },
    'NED': { name: 'Países Bajos', flag: '🇳🇱', group: 'F' },
    'JPN': { name: 'Japón', flag: '🇯🇵', group: 'F' },
    'SWE': { name: 'Suecia', flag: '🇸🇪', group: 'F' },
    'TUN': { name: 'Túnez', flag: '🇹🇳', group: 'F' },
    'BEL': { name: 'Bélgica', flag: '🇧🇪', group: 'G' },
    'EGY': { name: 'Egipto', flag: '🇪🇬', group: 'G' },
    'IRN': { name: 'Irán', flag: '🇮🇷', group: 'G' },
    'NZL': { name: 'Nueva Zelanda', flag: '🇳🇿', group: 'G' },
    'ESP': { name: 'España', flag: '🇪🇸', group: 'H' },
    'CPV': { name: 'Cabo Verde', flag: '🇨🇻', group: 'H' },
    'KSA': { name: 'Arabia Saudita', flag: '🇸🇦', group: 'H' },
    'URU': { name: 'Uruguay', flag: '🇺🇾', group: 'H' },
    'FRA': { name: 'Francia', flag: '🇫🇷', group: 'I' },
    'SEN': { name: 'Senegal', flag: '🇸🇳', group: 'I' },
    'IRQ': { name: 'Irak', flag: '🇮🇶', group: 'I' },
    'NOR': { name: 'Noruega', flag: '🇳🇴', group: 'I' },
    'ARG': { name: 'Argentina', flag: '🇦🇷', group: 'J' },
    'ALG': { name: 'Argelia', flag: '🇩🇿', group: 'J' },
    'AUT': { name: 'Austria', flag: '🇦🇹', group: 'J' },
    'JOR': { name: 'Jordania', flag: '🇯🇴', group: 'J' },
    'POR': { name: 'Portugal', flag: '🇵🇹', group: 'K' },
    'COD': { name: 'RD Congo', flag: '🇨🇩', group: 'K' },
    'UZB': { name: 'Uzbekistán', flag: '🇺🇿', group: 'K' },
    'COL': { name: 'Colombia', flag: '🇨🇴', group: 'K' },
    'ENG': { name: 'Inglaterra', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', group: 'L' },
    'CRO': { name: 'Croacia', flag: '🇭🇷', group: 'L' },
    'GHA': { name: 'Ghana', flag: '🇬🇭', group: 'L' },
    'PAN': { name: 'Panamá', flag: '🇵🇦', group: 'L' }
};

// CONFIG por defecto (se sobreescribirá con datos de Supabase)
const CONFIG_DEFAULT = {
    costo_apuesta: 5000,
    moneda: 'COP',
    points_exact: 5,
    points_winner: 3,
    multiplier: 2,
    prize_first: 50,
    prize_second: 25,
    prize_third: 15,
    prize_last: 10,
    active: true,
    nombre_polla: 'Polla Mundialista 2026',
    nequi: '3218593047',
    banco: 'Bancolombia | Cuenta: 08585591247 | Titular: Polla Mundialista'
};

// Variable global de config (se carga desde Supabase al iniciar)
let CONFIG = { ...CONFIG_DEFAULT };

async function loadConfig() {
    try {
        const c = await DB.getConfig();
        CONFIG = { ...CONFIG_DEFAULT, ...c };
        // Compatibilidad: si la DB devuelve valor_apuesta pero no costo_apuesta
        if (!CONFIG.costo_apuesta && c.valor_apuesta) CONFIG.costo_apuesta = c.valor_apuesta;
    } catch (e) {
        CONFIG = { ...CONFIG_DEFAULT };
    }
}
