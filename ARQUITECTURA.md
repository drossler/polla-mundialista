# Arquitectura Supabase — Polla Mundialista 2026

## 1. STACK TECNOLÓGICO

### Frontend (sin cambios)
- HTML5 + CSS3 (puro, sin frameworks)
- JavaScript vanilla
- Chart.js (gráficos)
- Font Awesome (iconos)

### Backend Cloud (nuevo)
- **Supabase** (BaaS)
  - PostgreSQL 14
  - Auth con JWT
  - Realtime (WebSocket)
  - Row Level Security
- **URL**: https://ocdmgaolgwzscsnjvjen.supabase.co
- **Anon Key**: para acceso público (sign-up, landing)

---

## 2. FLUJO DE DATOS

### LOGIN
```
usuario@email.com → Auth.login() 
  → Supabase.auth.signInWithPassword()
  → JWT token guardado en localStorage
  → DB.getProfile(user.id) → carga nombre, estado, puntos
  → redirect a dashboard o admin
```

### REGISTRO
```
nombre + email + pass → Auth.register()
  → Supabase.auth.signUp()
  → Trigger `on_auth_user_created` 
    → INSERT en profiles con datos de metadata
  → usuario recibe email de confirmación
  → redirect a login.html
```

### APUESTA
```
usuario selecciona score1, score2 → DB.placeBet()
  → INSERT en bets (upsert si ya existe)
  → RLS verifica: user_id = auth.uid() Y partido abierto
  → Realtime notifica otros clientes
  → match_id es la clave (un user = una apuesta por partido)
```

### RESULTADO (ADMIN)
```
admin ingresa score1, score2 → DB.saveMatchResult()
  → UPDATE matches SET score1, score2, status='finished'
  → Llama función SQL recalculate_match_points(match_id)
    → Para CADA apuesta en ese partido:
      → Calcula result_type (exact/winner/wrong) y points
      → UPDATE bets con resultado
    → Actualiza totales en profiles:
      → points = SUM(points_earned)
      → exact_count = COUNT(*) WHERE result_type='exact'
      → winner_count, wrong_count, streak
  → Realtime dispara cambios en bets → todos ven resultados
  → Realtime dispara cambios en profiles → ranking se actualiza
```

---

## 3. ESTRUCTURA DE BASE DE DATOS

### Tabla: `profiles` (extiende auth.users)
```sql
id              UUID PRIMARY KEY (FK → auth.users.id)
nombre          TEXT
email           TEXT
telefono        TEXT
role            TEXT ('user' | 'admin')
paid            BOOLEAN (¿pagó inscripción?)
paid_date       DATE (cuándo pagó)
points          INTEGER (puntos totales)
exact_count     INTEGER (apuestas exactas)
winner_count    INTEGER (ganador correcto)
wrong_count     INTEGER (incorrecto)
streak          INTEGER (racha de aciertos)
favorite_team   TEXT (código de equipo, ej: 'COL')
created_at      TIMESTAMPTZ
```

**RLS Policies:**
- Todos leen todos (para ranking)
- Usuario solo actualiza su propio perfil
- Admin actualiza cualquiera

### Tabla: `matches`
```sql
id              SERIAL PRIMARY KEY
team1           TEXT (código, ej: 'BRA')
team2           TEXT
match_date      DATE
match_time      TEXT (ej: '19:00')
phase           TEXT ('group'|'round32'|...|'final')
group_name      TEXT ('A'-'L' para grupos)
stadium         TEXT
status          TEXT ('upcoming'|'live'|'finished')
score1          INTEGER (NULL si no empieza)
score2          INTEGER
betting_closed  BOOLEAN (apuestas cerradas?)
created_at      TIMESTAMPTZ
```

**RLS Policies:**
- Todos leen
- Solo admin escribe

### Tabla: `bets`
```sql
id              UUID PRIMARY KEY
user_id         UUID (FK → profiles.id)
match_id        INTEGER (FK → matches.id)
prediction1     INTEGER (mi predicción equipo 1)
prediction2     INTEGER (mi predicción equipo 2)
points_earned   INTEGER (0-5, se calcula después)
result_type     TEXT ('pending'|'exact'|'winner'|'wrong')
created_at      TIMESTAMPTZ
UNIQUE(user_id, match_id)  ← Un usuario, una apuesta por partido
```

**RLS Policies:**
- Usuario lee SOLO sus apuestas
- Admin lee todas
- Usuario INSERT/UPDATE solo si:
  - auth.uid() = user_id
  - match.status = 'upcoming'
  - match.betting_closed = false

### Tabla: `payments`
```sql
id              UUID PRIMARY KEY
user_id         UUID (FK → profiles.id)
comprobante_url TEXT (URL de la foto del comprobante)
comprobante_notes TEXT (datos bancarios, número de cuenta, etc)
approved        BOOLEAN (¿admin lo aprobó?)
approved_by     UUID (FK → profiles.id, qué admin aprobó)
approved_at     TIMESTAMPTZ
created_at      TIMESTAMPTZ
```

**RLS Policies:**
- Usuario lee sus propios pagos
- Admin lee todos
- Usuario solo INSERT

### Tabla: `config`
```sql
id              INTEGER PRIMARY KEY (1)
valor_apuesta   NUMERIC (cuánto cuesta)
points_exact    INTEGER (puntos por resultado exacto)
points_winner   INTEGER (puntos por ganador correcto)
multiplier      NUMERIC (multiplicador futuro)
prize_first     NUMERIC (porcentaje al ganador)
prize_second    NUMERIC
prize_third     NUMERIC
prize_last      NUMERIC
reglas          TEXT (descripción de reglas)
premios         TEXT (descripción de premios)
active          BOOLEAN (¿polla abierta?)
nombre_polla    TEXT
```

**RLS Policies:**
- Todos leen
- Solo admin escribe

---

## 4. FUNCIONES SQL

### `is_admin()`
Verifica si el usuario actual es admin.

```sql
SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
)
```

### `calculate_bet_result(prediction1, prediction2, score1, score2, points_exact, points_winner)`
Determina el resultado de una apuesta (exacta, ganador, incorrecto) y retorna puntos.

```
SI prediction1 = score1 Y prediction2 = score2
  → 'exact', points_exact
SINO SI (pred1 > pred2 Y score1 > score2) 
  O (pred1 < pred2 Y score1 < score2)
  O (pred1 = pred2 Y score1 = score2)
  → 'winner', points_winner
SINO
  → 'wrong', 0
```

### `recalculate_match_points(match_id)`
**Función crítica**: se ejecuta cuando el admin ingresa un resultado.

1. Obtiene score1, score2 del partido
2. Para CADA apuesta en ese partido:
   - Calcula resultado con `calculate_bet_result()`
   - UPDATE apuesta con result_type y points_earned
3. Recalcula totales de todos los usuarios afectados:
   - points = SUM(points_earned)
   - exact_count = COUNT WHERE result_type='exact'
   - winner_count, wrong_count, streak

---

## 5. TRIGGERS

### `on_auth_user_created`
Se dispara cuando `auth.users` recibe INSERT (nuevo registro).

```sql
AFTER INSERT ON auth.users
→ INSERT INTO profiles (id, nombre, email, telefono)
  VALUES (NEW.id, metadata.nombre, NEW.email, metadata.telefono)
```

**Resultado:** Cada nuevo usuario autenticado automáticamente tiene perfil en la tabla.

---

## 6. REALTIME SUBSCRIPTIONS

En `supabase.js`:

### `Realtime.onMatchesChange(callback)`
Se suscribe a cambios en `matches`. Cuando admin ingresa resultado:
- Todos los clientes activos ven el score actualizado
- Apuestas se marcan como "finalizadas"
- El ranking se actualiza en la vista de posiciones

### `Realtime.onUserBetsChange(userId, callback)`
Usuario se suscribe a sus propias apuestas. Cuando:
- Él mismo coloca/edita una apuesta
- Admin recalcula puntos en un partido donde apostó
→ Dashboard se actualiza automáticamente

### `Realtime.onProfilesChange(callback)`
Admin se suscribe a cambios en perfiles. Cuando:
- Usuario paga (admin confirma)
- Se recalculan puntos de un usuario
→ Dashboard admin ve cambios en tiempo real

### `Realtime.onPaymentsChange(callback)`
Admin se suscribe a nuevos pagos. Cuando usuario envía comprobante:
→ Badge de notificaciones se actualiza sin refrescar

---

## 7. FLUJO DE PAGO

### Usuario
1. Se registra
2. Ve alerta de pago en dashboard
3. Puede:
   - Ir a Perfil → subir comprobante (notas, foto)
   - Transferir manualmente a la cuenta del banco
4. Envía comprobante por WhatsApp o en la app

### Admin
1. Recibe notificación en tiempo real si usuario envía comprobante
2. Va a Panel Admin → Pagos
3. Revisa el comprobante
4. Haz clic "Confirmar"
   → DB.approvePayment()
   → Marca payment.approved = true
   → Marca profile.paid = true
   → Marca profile.paid_date = hoy
5. Usuario ve "✅ Pago Confirmado" al refrescar (o por Realtime)

---

## 8. SEGURIDAD - ROW LEVEL SECURITY (RLS)

Todas las tablas tienen RLS habilitado. Ejemplos de políticas:

### Bets: Usuario solo lee sus apuestas
```sql
CREATE POLICY "bets_read_own" ON bets
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
```

### Bets: Usuario solo puede apostar si el partido está abierto
```sql
CREATE POLICY "bets_insert_own" ON bets
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM matches m
            WHERE m.id = match_id
              AND m.status = 'upcoming'
              AND m.betting_closed = FALSE
        )
    );
```

### Matches: Solo admin puede editar
```sql
CREATE POLICY "matches_admin_write" ON matches
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());
```

**Resultado:** Aunque el usuario tenga acceso a Supabase, no puede modificar datos de otros usuarios ni hacer queries incorrectas. La BD lo bloquea a nivel de SQL.

---

## 9. ESTADO EN EL CLIENTE (vs BD)

### localStorage (ELIMINADO)
```javascript
// ANTES (inseguro, local, no sincronizado):
localStorage.setItem('pm_current_user', JSON.stringify(user));
localStorage.setItem('pm_bets', JSON.stringify(bets));
```

### Variable en memoria (SOLO UI)
```javascript
// AHORA (temporal, para no recargar BD constantemente):
let currentUser = null;  // se actualiza cuando auth cambia

document.addEventListener('supabase:ready', async () => {
    currentUser = await DB.getCurrentProfile();
    // cada módulo lo reutiliza
});
```

### BD (FUENTE DE VERDAD)
```javascript
// Todos los datos en Supabase:
- Auth state → en auth.users
- Perfil → en profiles
- Apuestas → en bets (en tiempo real via Realtime)
- Resultados → en matches (en tiempo real)
```

---

## 10. COMPARATIVA: localStorage vs Supabase

| Aspecto | localStorage | Supabase |
|--------|---|---|
| Persistencia | Navegador local | BD PostgreSQL cloud |
| Multi-dispositivo | ❌ | ✅ (login en cualquier dispositivo) |
| Tiempo real | ❌ | ✅ (WebSocket Realtime) |
| Seguridad | ❌ (todo en cliente) | ✅ (RLS, JWT, HTTPS) |
| Privacidad | Todos ven todos (si hay admin local) | RLS: usuarios ven solo lo permitido |
| Admin | Hardcodeado (admin123) | Rol en BD, manejable |
| Escalabilidad | ❌ (limitado a size del navegador) | ✅ (ilimitado) |
| Sincronización | Manual (refrescar página) | Automática (Realtime) |

---

## 11. DIAGRAMA DE FLUJO

```
┌─────────────────────────────────────────────────────────────┐
│                    USUARIO / ADMIN                          │
│                   HTML + JS Vanilla                         │
└────────────────────┬────────────────────────────────────────┘
                     │ (HTTP REST API)
                     │ + WebSocket (Realtime)
         ┌───────────▼───────────┐
         │      Supabase         │
         │   (HTTPS + WSS)       │
         │                       │
         │  ┌─────────────────┐  │
         │  │ Auth            │  │
         │  │ (JWT)           │  │
         │  └─────────────────┘  │
         │                       │
         │  ┌─────────────────┐  │
         │  │ PostgreSQL 14   │  │
         │  │ - profiles      │  │
         │  │ - matches       │  │
         │  │ - bets          │  │
         │  │ - payments      │  │
         │  │ - config        │  │
         │  │ (RLS + Triggers)│  │
         │  └─────────────────┘  │
         │                       │
         │  ┌─────────────────┐  │
         │  │ Realtime        │  │
         │  │ (WebSocket)     │  │
         │  └─────────────────┘  │
         └───────────────────────┘
```

---

## 12. CHECKLIST: QUÉ PASÓ CON CADA PROBLEMA DE SEGURIDAD

- ✅ Passwords hardcodeados: ELIMINADOS
- ✅ Admin local: ELIMINADO (ahora es role en BD)
- ✅ localStorage como backend: ELIMINADO
- ✅ Sin autenticación: SUPABASE AUTH + JWT
- ✅ Sin encriptación: HTTPS + SUPABASE HTTPS
- ✅ Datos públicos: RLS ACTIVO
- ✅ Sin sincronización: REALTIME ACTIVO
- ✅ Admin omnipotente (conoce todos los datos): RLS BLOQUEA lecturas no autorizadas
- ✅ Sin recuperar contraseña: SUPABASE AUTH + EMAIL RESET

---

## 13. PRÓXIMOS PASOS OPCIONALES

1. **Subir fotos de comprobantes a Supabase Storage**
   ```javascript
   const { data, error } = await getSB().storage
       .from('payments')
       .upload(`user_${userId}/comprobante.jpg`, file);
   ```

2. **Enviar notificaciones por email**
   ```sql
   -- Usando Supabase Functions (serverless)
   CREATE FUNCTION public.send_payment_confirmation()
   RETURNS void LANGUAGE plpgsql
   AS $$
   BEGIN
       -- Llamar API externa (SendGrid, etc)
   END;
   $$;
   ```

3. **Exportar datos a CSV para admin**
   ```javascript
   const users = await DB.getAllProfiles();
   const csv = convertToCSV(users);
   downloadCSV(csv);
   ```

4. **Webhooks para eventos críticos**
   - Nuevo pago enviado
   - Resultado ingresado
   - Admin nuevo

---

**FIN DE LA ARQUITECTURA**

Cualquier pregunta sobre la implementación, revisar `supabase.js` (cliente) o `supabase_setup.sql` (servidor).
