-- ============================================================
-- POLLA MUNDIALISTA 2026 - SETUP COMPLETO SUPABASE
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- ============================================================
-- 1. TABLA: profiles (extiende auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre      TEXT NOT NULL,
    email       TEXT NOT NULL,
    telefono    TEXT DEFAULT '',
    role        TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    paid        BOOLEAN DEFAULT FALSE,
    paid_date   DATE,
    points      INTEGER DEFAULT 0,
    exact_count INTEGER DEFAULT 0,
    winner_count INTEGER DEFAULT 0,
    wrong_count INTEGER DEFAULT 0,
    streak      INTEGER DEFAULT 0,
    favorite_team TEXT DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. TABLA: matches
-- ============================================================
CREATE TABLE IF NOT EXISTS public.matches (
    id              SERIAL PRIMARY KEY,
    team1           TEXT NOT NULL,
    team2           TEXT NOT NULL,
    match_date      DATE NOT NULL,
    match_time      TEXT NOT NULL,
    phase           TEXT DEFAULT 'group',
    group_name      TEXT DEFAULT '',
    stadium         TEXT DEFAULT '',
    status          TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming','live','finished')),
    score1          INTEGER,
    score2          INTEGER,
    betting_closed  BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. TABLA: bets
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    match_id        INTEGER NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    prediction1     INTEGER NOT NULL,
    prediction2     INTEGER NOT NULL,
    points_earned   INTEGER DEFAULT 0,
    result_type     TEXT DEFAULT 'pending' CHECK (result_type IN ('pending','exact','winner','wrong')),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, match_id)
);

-- ============================================================
-- 4. TABLA: payments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    comprobante_url TEXT DEFAULT '',
    comprobante_notes TEXT DEFAULT '',
    approved        BOOLEAN DEFAULT FALSE,
    approved_by     UUID REFERENCES public.profiles(id),
    approved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. TABLA: config
-- ============================================================
CREATE TABLE IF NOT EXISTS public.config (
    id              INTEGER PRIMARY KEY DEFAULT 1,
    valor_apuesta   NUMERIC DEFAULT 10,
    points_exact    INTEGER DEFAULT 5,
    points_winner   INTEGER DEFAULT 3,
    multiplier      NUMERIC DEFAULT 2,
    prize_first     NUMERIC DEFAULT 50,
    prize_second    NUMERIC DEFAULT 25,
    prize_third     NUMERIC DEFAULT 15,
    prize_last      NUMERIC DEFAULT 10,
    reglas          TEXT DEFAULT 'Predicción exacta: 5 pts. Ganador correcto: 3 pts.',
    premios         TEXT DEFAULT '1ro: 50% | 2do: 25% | 3ro: 15% | Último: 10%',
    active          BOOLEAN DEFAULT TRUE,
    nombre_polla    TEXT DEFAULT 'Polla Mundialista Familiar 2026',
    CONSTRAINT config_single_row CHECK (id = 1)
);

-- Fix: si la tabla fue creada antes con id UUID, migrar a INTEGER
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'config'
          AND column_name = 'id' AND data_type IN ('uuid', 'character varying')
    ) THEN
        ALTER TABLE public.config ALTER COLUMN id TYPE INTEGER USING 1;
        ALTER TABLE public.config ALTER COLUMN id SET DEFAULT 1;
        ALTER TABLE public.config DROP CONSTRAINT IF EXISTS config_single_row;
        ALTER TABLE public.config ADD CONSTRAINT config_single_row CHECK (id = 1);
    END IF;
END $$;

-- Insert default config row
INSERT INTO public.config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 6. HABILITAR ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config         ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. FUNCIÓN HELPER: verificar si el usuario actual es admin
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$;

-- ============================================================
-- 8. POLÍTICAS RLS - profiles
-- ============================================================
-- Cualquier usuario autenticado puede leer todos los perfiles (para rankings)
CREATE POLICY "profiles_read_all" ON public.profiles
    FOR SELECT TO authenticated USING (TRUE);

-- Usuario solo puede actualizar su propio perfil
CREATE POLICY "profiles_update_own" ON public.profiles
    FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Admin puede actualizar cualquier perfil
CREATE POLICY "profiles_admin_update" ON public.profiles
    FOR UPDATE TO authenticated USING (public.is_admin());

-- Sistema puede insertar perfil nuevo (via trigger)
CREATE POLICY "profiles_insert_own" ON public.profiles
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Admin puede eliminar perfiles
CREATE POLICY "profiles_admin_delete" ON public.profiles
    FOR DELETE TO authenticated USING (public.is_admin());

-- ============================================================
-- 9. POLÍTICAS RLS - matches
-- ============================================================
-- Todos pueden leer partidos
CREATE POLICY "matches_read_all" ON public.matches
    FOR SELECT TO authenticated USING (TRUE);

-- Solo admin puede crear/modificar partidos
CREATE POLICY "matches_admin_write" ON public.matches
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Lectura pública (para la landing page)
CREATE POLICY "matches_public_read" ON public.matches
    FOR SELECT TO anon USING (TRUE);

-- ============================================================
-- 10. POLÍTICAS RLS - bets
-- ============================================================
-- Usuario puede leer sus propias apuestas
CREATE POLICY "bets_read_own" ON public.bets
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Admin puede leer todas las apuestas
CREATE POLICY "bets_admin_read" ON public.bets
    FOR SELECT TO authenticated USING (public.is_admin());

-- Usuario puede crear/editar sus propias apuestas (si partido está abierto)
CREATE POLICY "bets_insert_own" ON public.bets
    FOR INSERT TO authenticated WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.matches m
            WHERE m.id = match_id
              AND m.status = 'upcoming'
              AND m.betting_closed = FALSE
        )
    );

CREATE POLICY "bets_update_own" ON public.bets
    FOR UPDATE TO authenticated USING (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.matches m
            WHERE m.id = match_id
              AND m.status = 'upcoming'
              AND m.betting_closed = FALSE
        )
    );

-- Admin puede actualizar apuestas (para calcular puntos)
CREATE POLICY "bets_admin_update" ON public.bets
    FOR UPDATE TO authenticated USING (public.is_admin());

-- Admin puede eliminar apuestas
CREATE POLICY "bets_admin_delete" ON public.bets
    FOR DELETE TO authenticated USING (public.is_admin());

-- Usuario puede eliminar sus propias apuestas (si partido abierto)
CREATE POLICY "bets_delete_own" ON public.bets
    FOR DELETE TO authenticated USING (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.matches m
            WHERE m.id = match_id
              AND m.status = 'upcoming'
              AND m.betting_closed = FALSE
        )
    );

-- ============================================================
-- 11. POLÍTICAS RLS - payments
-- ============================================================
-- Usuario puede ver sus propios pagos
CREATE POLICY "payments_read_own" ON public.payments
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Admin puede ver todos
CREATE POLICY "payments_admin_read" ON public.payments
    FOR SELECT TO authenticated USING (public.is_admin());

-- Usuario puede subir comprobante
CREATE POLICY "payments_insert_own" ON public.payments
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Admin puede aprobar pagos
CREATE POLICY "payments_admin_update" ON public.payments
    FOR UPDATE TO authenticated USING (public.is_admin());

-- Admin puede eliminar pagos
CREATE POLICY "payments_admin_delete" ON public.payments
    FOR DELETE TO authenticated USING (public.is_admin());

-- Usuario puede eliminar sus propios pagos pendientes
CREATE POLICY "payments_delete_own" ON public.payments
    FOR DELETE TO authenticated USING (
        auth.uid() = user_id AND approved = FALSE
    );

-- ============================================================
-- 12. POLÍTICAS RLS - config
-- ============================================================
-- Todos los autenticados pueden leer
CREATE POLICY "config_read_all" ON public.config
    FOR SELECT TO authenticated USING (TRUE);

-- Lectura pública también
CREATE POLICY "config_public_read" ON public.config
    FOR SELECT TO anon USING (TRUE);

-- Solo admin puede modificar
CREATE POLICY "config_admin_write" ON public.config
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- 13. TRIGGER: crear perfil automáticamente al registrarse
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.profiles (id, nombre, email, telefono)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'telefono', '')
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 14. FUNCIÓN: calcular puntos de una apuesta
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_bet_result(
    p_prediction1 INTEGER,
    p_prediction2 INTEGER,
    p_score1 INTEGER,
    p_score2 INTEGER,
    p_points_exact INTEGER DEFAULT 5,
    p_points_winner INTEGER DEFAULT 3
)
RETURNS TABLE(result_type TEXT, points_earned INTEGER)
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_prediction1 = p_score1 AND p_prediction2 = p_score2 THEN
        RETURN QUERY SELECT 'exact'::TEXT, p_points_exact;
    ELSIF (p_prediction1 > p_prediction2 AND p_score1 > p_score2)
       OR (p_prediction1 < p_prediction2 AND p_score1 < p_score2)
       OR (p_prediction1 = p_prediction2 AND p_score1 = p_score2) THEN
        RETURN QUERY SELECT 'winner'::TEXT, p_points_winner;
    ELSE
        RETURN QUERY SELECT 'wrong'::TEXT, 0;
    END IF;
END;
$$;

-- ============================================================
-- 15. FUNCIÓN: calcular y actualizar puntos al registrar resultado
-- ============================================================
CREATE OR REPLACE FUNCTION public.recalculate_match_points(p_match_id INTEGER)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_score1        INTEGER;
    v_score2        INTEGER;
    v_points_exact  INTEGER;
    v_points_winner INTEGER;
    v_bet           RECORD;
    v_result        RECORD;
BEGIN
    -- Get match result
    SELECT score1, score2 INTO v_score1, v_score2
    FROM public.matches WHERE id = p_match_id;

    -- Get config
    SELECT points_exact, points_winner INTO v_points_exact, v_points_winner
    FROM public.config WHERE id = 1;

    -- Update each bet for this match
    FOR v_bet IN
        SELECT id, user_id, prediction1, prediction2
        FROM public.bets WHERE match_id = p_match_id
    LOOP
        SELECT * INTO v_result FROM public.calculate_bet_result(
            v_bet.prediction1, v_bet.prediction2,
            v_score1, v_score2,
            v_points_exact, v_points_winner
        );

        UPDATE public.bets
        SET result_type = v_result.result_type,
            points_earned = v_result.points_earned
        WHERE id = v_bet.id;
    END LOOP;

    -- Recalculate totals for all affected users
    UPDATE public.profiles p
    SET
        points = COALESCE((
            SELECT SUM(b.points_earned) FROM public.bets b WHERE b.user_id = p.id
        ), 0),
        exact_count = COALESCE((
            SELECT COUNT(*) FROM public.bets b WHERE b.user_id = p.id AND b.result_type = 'exact'
        ), 0),
        winner_count = COALESCE((
            SELECT COUNT(*) FROM public.bets b WHERE b.user_id = p.id AND b.result_type = 'winner'
        ), 0),
        wrong_count = COALESCE((
            SELECT COUNT(*) FROM public.bets b WHERE b.user_id = p.id AND b.result_type = 'wrong'
        ), 0),
        streak = COALESCE((
            -- Calcular racha actual de aciertos (exact + winner consecutivos desde la más reciente)
            WITH ordered AS (
                SELECT result_type, created_at
                FROM public.bets
                WHERE user_id = p.id AND result_type != 'pending'
                ORDER BY created_at DESC
            )
            SELECT COUNT(*) FROM ordered
            WHERE result_type IN ('exact', 'winner')
              AND created_at >= COALESCE(
                  (SELECT MAX(created_at) FROM ordered WHERE result_type = 'wrong'),
                  '1970-01-01'::timestamptz
              )
        ), 0)
    WHERE p.id IN (
        SELECT DISTINCT user_id FROM public.bets WHERE match_id = p_match_id
    );
END;
$$;

-- ============================================================
-- 15B. FUNCIÓN: eliminar usuario (admin)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Verificar que quien llama es admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Solo admin puede eliminar usuarios';
    END IF;

    -- Eliminar pagos, apuestas y perfil (cascade)
    DELETE FROM public.payments WHERE user_id = target_user_id;
    DELETE FROM public.bets    WHERE user_id = target_user_id;
    DELETE FROM public.profiles WHERE id = target_user_id;

    -- Eliminar usuario de auth (requiere ser superadmin o service_role)
    -- Nota: Esto solo funciona si la función es SECURITY DEFINER y el
    -- propietario tiene rol de superadmin en auth.users
    DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

-- ============================================================
-- 16. HABILITAR REALTIME en las tablas clave
-- ============================================================
-- Nota: En Supabase nuevo la publicación por defecto es 'supabase_realtime'
-- Estos comandos son idempotentes usando IF NOT EXISTS
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.matches;
        ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.bets;
        ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.profiles;
        ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.payments;
        ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.config;
    END IF;
END
$$;

-- ============================================================
-- 17. CARGAR PARTIDOS MUNDIALISTAS (72 partidos fase grupos)
-- ============================================================
INSERT INTO public.matches (team1, team2, match_date, match_time, phase, group_name, stadium, status) VALUES
-- Grupo A
('MEX','RSA','2026-06-11','13:00','group','A','Estadio Azteca, CDMX','upcoming'),
('KOR','CZE','2026-06-11','20:00','group','A','Estadio Akron, Guadalajara','upcoming'),
('CZE','RSA','2026-06-18','10:00','group','A','Mercedes-Benz Stadium, Atlanta','upcoming'),
('MEX','KOR','2026-06-18','19:00','group','A','Estadio Akron, Guadalajara','upcoming'),
('RSA','KOR','2026-06-24','19:00','group','A','Estadio BBVA, Monterrey','upcoming'),
('CZE','MEX','2026-06-24','19:00','group','A','Estadio Azteca, CDMX','upcoming'),
-- Grupo B
('CAN','BIH','2026-06-12','13:00','group','B','BMO Field, Toronto','upcoming'),
('QAT','SUI','2026-06-13','13:00','group','B','Levi''s Stadium, San Francisco','upcoming'),
('SUI','BIH','2026-06-18','13:00','group','B','SoFi Stadium, Los Ángeles','upcoming'),
('CAN','QAT','2026-06-18','16:00','group','B','BC Place, Vancouver','upcoming'),
('BIH','QAT','2026-06-24','13:00','group','B','Lumen Field, Seattle','upcoming'),
('SUI','CAN','2026-06-24','13:00','group','B','BC Place, Vancouver','upcoming'),
-- Grupo C
('BRA','MAR','2026-06-13','16:00','group','C','MetLife Stadium, NY/NJ','upcoming'),
('HAI','SCO','2026-06-13','19:00','group','C','Gillette Stadium, Boston','upcoming'),
('SCO','MAR','2026-06-19','16:00','group','C','Gillette Stadium, Boston','upcoming'),
('BRA','HAI','2026-06-19','19:00','group','C','Lincoln Financial Field, Philadelphia','upcoming'),
('SCO','BRA','2026-06-24','16:00','group','C','Hard Rock Stadium, Miami','upcoming'),
('MAR','HAI','2026-06-24','16:00','group','C','Mercedes-Benz Stadium, Atlanta','upcoming'),
-- Grupo D
('USA','PAR','2026-06-12','19:00','group','D','SoFi Stadium, Los Ángeles','upcoming'),
('AUS','TUR','2026-06-13','22:00','group','D','BC Place, Vancouver','upcoming'),
('TUR','PAR','2026-06-19','22:00','group','D','Levi''s Stadium, San Francisco','upcoming'),
('USA','AUS','2026-06-19','13:00','group','D','Lumen Field, Seattle','upcoming'),
('TUR','USA','2026-06-25','20:00','group','D','SoFi Stadium, Los Ángeles','upcoming'),
('PAR','AUS','2026-06-25','20:00','group','D','Levi''s Stadium, San Francisco','upcoming'),
-- Grupo E
('GER','CUW','2026-06-14','11:00','group','E','NRG Stadium, Houston','upcoming'),
('CIV','ECU','2026-06-14','17:00','group','E','Lincoln Financial Field, Philadelphia','upcoming'),
('GER','CIV','2026-06-20','14:00','group','E','BMO Field, Toronto','upcoming'),
('ECU','CUW','2026-06-20','18:00','group','E','Arrowhead Stadium, Kansas City','upcoming'),
('ECU','GER','2026-06-25','14:00','group','E','MetLife Stadium, NY/NJ','upcoming'),
('CUW','CIV','2026-06-25','14:00','group','E','Lincoln Financial Field, Philadelphia','upcoming'),
-- Grupo F
('NED','JPN','2026-06-14','14:00','group','F','AT&T Stadium, Dallas','upcoming'),
('SWE','TUN','2026-06-14','20:00','group','F','Estadio BBVA, Monterrey','upcoming'),
('NED','SWE','2026-06-20','11:00','group','F','NRG Stadium, Houston','upcoming'),
('TUN','JPN','2026-06-20','22:00','group','F','Estadio Akron, Guadalajara','upcoming'),
('JPN','SWE','2026-06-25','17:00','group','F','AT&T Stadium, Dallas','upcoming'),
('TUN','NED','2026-06-25','17:00','group','F','Arrowhead Stadium, Kansas City','upcoming'),
-- Grupo G
('IRN','NZL','2026-06-15','19:00','group','G','SoFi Stadium, Los Ángeles','upcoming'),
('BEL','EGY','2026-06-15','13:00','group','G','Lumen Field, Seattle','upcoming'),
('BEL','IRN','2026-06-21','13:00','group','G','SoFi Stadium, Los Ángeles','upcoming'),
('NZL','EGY','2026-06-21','19:00','group','G','BC Place, Vancouver','upcoming'),
('EGY','IRN','2026-06-26','21:00','group','G','Lumen Field, Seattle','upcoming'),
('NZL','BEL','2026-06-26','21:00','group','G','BC Place, Vancouver','upcoming'),
-- Grupo H
('ESP','CPV','2026-06-15','10:00','group','H','Mercedes-Benz Stadium, Atlanta','upcoming'),
('KSA','URU','2026-06-15','16:00','group','H','Hard Rock Stadium, Miami','upcoming'),
('ESP','KSA','2026-06-21','10:00','group','H','Mercedes-Benz Stadium, Atlanta','upcoming'),
('URU','CPV','2026-06-21','16:00','group','H','Hard Rock Stadium, Miami','upcoming'),
('CPV','KSA','2026-06-26','18:00','group','H','NRG Stadium, Houston','upcoming'),
('URU','ESP','2026-06-26','18:00','group','H','Estadio Akron, Guadalajara','upcoming'),
-- Grupo I
('FRA','SEN','2026-06-16','13:00','group','I','MetLife Stadium, NY/NJ','upcoming'),
('IRQ','NOR','2026-06-16','16:00','group','I','Gillette Stadium, Boston','upcoming'),
('FRA','IRQ','2026-06-22','15:00','group','I','Lincoln Financial Field, Philadelphia','upcoming'),
('NOR','SEN','2026-06-22','18:00','group','I','MetLife Stadium, NY/NJ','upcoming'),
('NOR','FRA','2026-06-26','13:00','group','I','Gillette Stadium, Boston','upcoming'),
('SEN','IRQ','2026-06-26','13:00','group','I','BMO Field, Toronto','upcoming'),
-- Grupo J
('ARG','ALG','2026-06-16','19:00','group','J','Arrowhead Stadium, Kansas City','upcoming'),
('AUT','JOR','2026-06-16','22:00','group','J','Levi''s Stadium, San Francisco','upcoming'),
('ARG','AUT','2026-06-22','11:00','group','J','AT&T Stadium, Dallas','upcoming'),
('JOR','ALG','2026-06-22','21:00','group','J','Levi''s Stadium, San Francisco','upcoming'),
('ALG','AUT','2026-06-27','20:00','group','J','Arrowhead Stadium, Kansas City','upcoming'),
('JOR','ARG','2026-06-27','20:00','group','J','AT&T Stadium, Dallas','upcoming'),
-- Grupo K
('POR','COD','2026-06-17','11:00','group','K','NRG Stadium, Houston','upcoming'),
('UZB','COL','2026-06-17','20:00','group','K','Estadio Azteca, CDMX','upcoming'),
('POR','UZB','2026-06-23','11:00','group','K','NRG Stadium, Houston','upcoming'),
('COL','COD','2026-06-23','20:00','group','K','Estadio Akron, Guadalajara','upcoming'),
('COL','POR','2026-06-27','17:30','group','K','Hard Rock Stadium, Miami','upcoming'),
('COD','UZB','2026-06-27','17:30','group','K','Mercedes-Benz Stadium, Atlanta','upcoming'),
-- Grupo L
('ENG','CRO','2026-06-17','14:00','group','L','AT&T Stadium, Dallas','upcoming'),
('GHA','PAN','2026-06-17','17:00','group','L','BMO Field, Toronto','upcoming'),
('ENG','GHA','2026-06-23','14:00','group','L','Gillette Stadium, Boston','upcoming'),
('PAN','CRO','2026-06-23','17:00','group','L','BMO Field, Toronto','upcoming'),
('PAN','ENG','2026-06-27','15:00','group','L','MetLife Stadium, NY/NJ','upcoming'),
('CRO','GHA','2026-06-27','15:00','group','L','Lincoln Financial Field, Philadelphia','upcoming')
ON CONFLICT DO NOTHING;

-- ============================================================
-- FIN DEL SETUP
-- ============================================================
-- NOTA: Para crear el primer admin, después de que te registres
-- con tu email de admin, ejecuta:
--
-- UPDATE public.profiles SET role = 'admin' WHERE email = 'tu@email.com';
--
-- ============================================================
