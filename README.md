# Polla Mundialista 2026 — Migración a Supabase

## Cambios realizados

- **localStorage eliminado** completamente como backend principal
- **Supabase** como único motor de datos: auth, BD PostgreSQL, Realtime
- **Credenciales hardcodeadas eliminadas** (admin123, admin@polla.com local)
- **Tiempo real** en ranking, resultados, pagos y partidos sin refrescar

---

## Pasos para desplegar

### 1. Ejecutar el SQL en Supabase

1. Ve a [supabase.com](https://supabase.com) → tu proyecto `ocdmgaolgwzscsnjvjen`
2. Dashboard → **SQL Editor** → New Query
3. Copia y pega todo el contenido de `supabase_setup.sql`
4. Haz clic en **Run**

Esto crea:
- Tablas: `profiles`, `matches`, `bets`, `payments`, `config`
- 72 partidos de la fase de grupos del Mundial 2026
- Row Level Security completo
- Función `recalculate_match_points` para calcular puntos automáticamente
- Trigger para crear perfil al registrarse
- Publicaciones Realtime

### 2. Crear el primer administrador

1. Regístrate normalmente en la app con tu email de administrador
2. En Supabase → SQL Editor ejecuta:

```sql
UPDATE public.profiles SET role = 'admin' WHERE email = 'tu@email.com';
```

3. A partir de ahí, ese usuario accede a `admin.html` automáticamente al hacer login.

### 3. Subir los archivos

Sube la carpeta `polla-mundialista/` a Netlify, Vercel, o cualquier hosting estático.

**No necesitas backend propio** — todo corre en Supabase.

---

## Estructura de archivos

```
polla-mundialista/
├── index.html          — Landing page + registro
├── login.html          — Login con Supabase Auth
├── dashboard.html      — Panel del usuario
├── apuestas.html       — Hacer apuestas
├── posiciones.html     — Ranking en tiempo real
├── resultados.html     — Mis resultados
├── calendario.html     — Calendario de partidos
├── perfil.html         — Perfil + subir comprobante
├── admin.html          — Panel administrador
├── css/styles.css      — Estilos (sin cambios)
├── js/
│   ├── data.js         — Datos estáticos (equipos, config defaults)
│   ├── supabase.js     — Cliente Supabase + Auth + DB + Realtime
│   ├── app.js          — Landing page
│   ├── auth.js         — Login/logout
│   ├── dashboard.js    — Dashboard usuario
│   ├── apuestas.js     — Sistema de apuestas
│   ├── posiciones.js   — Tabla de posiciones
│   ├── resultados.js   — Resultados
│   ├── calendario.js   — Calendario
│   ├── perfil.js       — Perfil y comprobante
│   └── admin.js        — Panel admin
└── supabase_setup.sql  — SQL completo para Supabase
```

---

## Funcionalidades nuevas vs anteriores

| Funcionalidad | Antes | Ahora |
|---|---|---|
| Autenticación | localStorage + admin hardcodeado | Supabase Auth |
| Persistencia | localStorage (solo local) | PostgreSQL cloud |
| Multi-usuario | ❌ (cada uno ve solo sus datos) | ✅ compartido |
| Tiempo real | ❌ (requería recargar) | ✅ automático |
| Seguridad | Ninguna (todo en cliente) | RLS en BD |
| Recuperar contraseña | ❌ | ✅ email de reset |
| Comprobante de pago | ❌ | ✅ usuario lo envía, admin aprueba |
| Calcular puntos | Manual en cliente | Función SQL automática |

---

## Seguridad implementada

- **RLS (Row Level Security)** activo en todas las tablas
- Usuarios solo pueden leer/editar sus propias apuestas
- Solo admin puede editar partidos, aprobar pagos, ver todo
- Apuestas bloqueadas automáticamente cuando `betting_closed = true`
- No hay passwords ni credenciales en el código fuente

---

## Arquitectura Realtime

Supabase Realtime se activa automáticamente en:
- Cambios en `matches` → actualiza calendario y apuestas para todos
- Cambios en `profiles` → actualiza ranking en tiempo real
- Cambios en `bets` → actualiza apuestas del usuario
- Cambios en `payments` → notifica al admin de nuevos comprobantes
