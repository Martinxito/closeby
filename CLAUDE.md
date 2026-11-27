# Trato Hecho — contexto del proyecto

Proyecto para la **Dev3pack Hackathon (Solana)**, 27–29 de noviembre de 2026. Equipo de 4 personas, hub Santiago.
Entrega: **sábado 23:00** (cierre real domingo 29, 04:00 hora de Chile).

## Qué es

Trato Hecho es un link para cerrar **compraventas presenciales** entre personas (Marketplace, Yapo, Instagram) con **la plata reservada y el encuentro agendado**:

1. El vendedor publica la venta y comparte un link.
2. El comprador elige día, hora y punto de encuentro, y **paga al agendar**. La plata queda en una bóveda del programa en Solana que nadie puede tocar fuera de las reglas.
3. El vendedor acepta el encuentro. Ambos quedan comprometidos.
4. En el encuentro, el comprador revisa el producto y confirma en su celular → la plata llega al vendedor al instante.
5. Si algo falla (el vendedor no acepta, alguien cancela, el producto no era lo prometido, nadie confirma), hay reglas automáticas y la plata vuelve al comprador. **La plata nunca queda atrapada.**

Resuelve: compradores que no llegan, vendedores que no van en serio, transferencias o comprobantes falsos, y andar con efectivo en un punto de encuentro.

**Fuera de alcance (fase 2):** compras a distancia con envío y disputas con mediador. No implementar salvo que el equipo lo pida.

## Requisitos de la hackathon (no olvidar)

- Programa propio en Rust desplegado al menos en **devnet**.
- Repo público en GitHub con README e instrucciones de instalación.
- **Direcciones del programa en el README.**
- Demo publicada (Vercel) y video de menos de 3 minutos.
- En la evaluación revisan el código: el equipo debe entender y poder explicar todo. Cuando generes código, explica las partes no obvias.

## Estructura del repo

```
programs/trato_hecho/     # Programa Anchor (P1)
tests/                    # Tests de Anchor (TypeScript)
app/                      # Frontend Next.js (P2)
app/api/agente/           # Agente de IA (P3)
CLAUDE.md / AGENTS.md     # Este contexto (mismo contenido)
```

Una rama por persona; se integra a `main` en los puntos de sincronización.

## Stack

- Programa: **Rust + Anchor**, Solana **devnet**.
- Frontend: **Next.js + TypeScript**, Solana Wallet Adapter (Phantom) en la primera versión; **Pollar** (`@pollar/react`) el sábado para login con Google y pago sin wallet.
- Cliente: `@solana/web3.js`, `@solana/spl-token`, cliente generado desde el IDL de Anchor.
- Datos fuera de la cadena: **Supabase** (o JSON local para la demo).
- Moneda: **USDC de prueba en devnet** (mint configurable; si no conseguimos USDC de devnet, crear un token SPL de prueba con 6 decimales).
- Hosting: Vercel.

Comandos:

```bash
anchor build
anchor test
anchor deploy --provider.cluster devnet
cd app && npm install && npm run dev
```

## Programa (Anchor)

La plata vive en una **bóveda**: token account de USDC cuya authority es la PDA de la orden. Nadie tiene su llave privada; solo el programa la mueve. **La plata siempre va al comprador o al vendedor según las reglas, nunca a quien llama la instrucción.**

### Cuentas

- `Config` — PDA `["config"]`: `admin`, `usdc_mint`, `accept_window_secs`, `grace_secs`.
- `Order` — PDA `["order", seller, order_id (u64 LE)]`:
  `buyer: Option<Pubkey>`, `seller`, `amount: u64`, `meeting_time: i64`, `place_hash: [u8; 32]`,
  `accept_deadline: i64`, `release_deadline: i64`, `late_cancel_secs: i64`, `late_cancel_fee_bps: u16`,
  `proposed_time: Option<i64>`, `proposed_place_hash: [u8; 32]`, `proposed_by: Option<Pubkey>`,
  `status`, `bump`.
- Bóveda: token account de USDC con authority = PDA de `Order`.

`status`: `Created`, `Funded` (pagó y propuso horario), `Scheduled` (vendedor aceptó), `Released`, `Refunded`.

`release_deadline = meeting_time + grace_secs` (producción: 1 hora).

### Instrucciones

Usar `require!` con errores personalizados (`#[error_code]`) para cada regla. Emitir un evento (`emit!`) en cada cambio de estado.

**MVP (viernes):**

| Instrucción | Firma | Requisitos | Efecto |
|---|---|---|---|
| `init_config` | admin | una sola vez | guarda admin, mint y ventanas |
| `create_order(order_id, amount, late_cancel_secs, late_cancel_fee_bps)` | vendedor | amount > 0; fee ≤ 2000 bps | estado `Created` |
| `fund_and_schedule(meeting_time, place_hash)` | comprador | `Created`; comprador ≠ vendedor; meeting_time > ahora | transfiere USDC a la bóveda; guarda horario y lugar; `accept_deadline = ahora + accept_window_secs`; `Funded` |
| `accept_meeting` | vendedor | `Funded`; ahora ≤ accept_deadline | calcula `release_deadline`; `Scheduled` |
| `decline_meeting` | vendedor | `Funded` | reembolso total; `Refunded` |
| `refund_unaccepted` | cualquiera | `Funded`; ahora > accept_deadline | reembolso total; `Refunded` |
| `confirm_handover` | comprador | `Scheduled` | paga al vendedor; `Released` |
| `reject_at_meeting` | comprador | `Scheduled`; ahora ≥ meeting_time − 1800 | reembolso total; `Refunded` |
| `seller_cancel` | vendedor | `Scheduled` | reembolso total; `Refunded` |
| `refund_after_deadline` | cualquiera | `Scheduled`; ahora > release_deadline | reembolso total; `Refunded` |

**Sábado:**

| Instrucción | Firma | Requisitos | Efecto |
|---|---|---|---|
| `buyer_cancel` | comprador | `Funded`, o `Scheduled` antes de meeting_time | reembolso total si falta más de `late_cancel_secs`; si es tarde, `amount * late_cancel_fee_bps / 10000` al vendedor y el resto al comprador; `Refunded` |
| `propose_reschedule(new_time, new_place_hash)` | comprador o vendedor | `Scheduled`; new_time > ahora | guarda la propuesta y `proposed_by` |
| `accept_reschedule` | la otra parte | hay propuesta; quien firma ≠ `proposed_by` | actualiza meeting_time, place_hash, release_deadline; limpia la propuesta |

### Tests obligatorios (`anchor test`)

Flujo feliz completo, y estos casos **deben fallar**:

- Un tercero o el vendedor llama `confirm_handover`.
- El vendedor acepta después de `accept_deadline`.
- `refund_after_deadline` antes de tiempo.
- `reject_at_meeting` un día antes del encuentro.
- Quien propuso un reagendamiento intenta aceptarlo.
- Doble confirmación o doble reembolso.
- Comprador = vendedor.

Para tests y demo, las ventanas se configuran en segundos o minutos.

## Frontend

Reglas de UI:

- Español de Chile, **pensado para celular**.
- **Cero lenguaje cripto en pantalla**: decir "plata reservada", "encuentro agendado", "trato cerrado"; nunca "wallet", "SOL", "transacción", "token".
- Precios en **CLP**; conversión fija para la demo: **1 USDC = 950 CLP**.
- El lugar exacto, fotos y descripción van **fuera de la cadena**; en la cadena solo el hash (SHA-256) del lugar.
- Nunca guardar datos personales en la cadena.

Pantallas:

1. `/vender` — publicar venta: título, descripción, precio en CLP, foto, comunas, horarios disponibles → `create_order` → link `/t/[orderId]` con botón copiar.
2. `/t/[orderId]` (comprador) — ver producto, elegir horario y punto de encuentro sugerido (lista de estaciones de metro y malls por comuna) → "Reservar con mi pago" (`fund_and_schedule`).
3. `/t/[orderId]` (vendedor) — "Ana reservó con $300.000. Encuentro: sáb 28, 16:00, Metro Los Leones" → Aceptar / Rechazar.
4. Página del trato (ambos) — línea de tiempo Reservado → Agendado → Trato cerrado, cuenta regresiva, lugar con link a mapa, "Agregar a mi calendario" (descarga .ics), Cancelar, Reagendar.
5. Modo encuentro (comprador, desde 30 min antes) — botones grandes "Recibí el producto: cerrar trato" (`confirm_handover`) y "No es lo que me ofrecieron" (`reject_at_meeting`).
6. Trato cerrado — "✅ Trato hecho" + link "Ver en Solana" (Solana Explorer devnet).

Cuando un plazo venció, mostrar "Reclamar reembolso" a cualquiera.

Supabase, tabla `tratos`: `order_id`, `titulo`, `descripcion`, `precio_clp`, `fotos`, `comunas`, `horarios`, `lugar`.

## Agente (opcional, se decide el sábado 13:00)

Ruta `/api/agente` en Next.js con un modelo de IA con tool calling. Habla español de Chile. **Nunca tiene llaves ni firma**: prepara acciones y la persona confirma y firma en su wallet.

Herramientas:

- `leer_publicacion(url)` — Firecrawl → `{titulo, precio_clp, descripcion, fotos[]}` para prellenar `/vender`.
- `horarios_disponibles(orderId)` — desde Supabase.
- `puntos_seguros(comuna)` — lista estática.
- `preparar_reserva(orderId, meeting_time, lugar)` — transacción `fund_and_schedule` sin firmar + resumen en español.

Antes de reservar, dar señales de riesgo (precio muy bajo, patrones de estafa) como avisos, no veredictos. API keys solo en variables de entorno (`FIRECRAWL_API_KEY`, key del modelo).

## Cómo trabajar en este repo

- Antes de cambiar el programa, revisa los nombres de instrucciones y cuentas de este archivo: el frontend y el agente programan contra ellos.
- Cada instrucción nueva va con sus tests, incluidos los casos que deben fallar.
- Cambios chicos y commits frecuentes; no mezclar el programa y el frontend en el mismo commit.
- Nunca commitear llaves privadas, keypairs ni API keys (`.env*`, `*.json` de wallets → `.gitignore`).
- Si algo de este archivo choca con lo que pide alguien del equipo, pregunta antes de cambiar la especificación.
