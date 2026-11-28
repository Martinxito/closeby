# Dev3pack submission (draft)

Texts for the **Project** tab of the Dev3pack panel. Limits checked with a script (characters and words below each field). Fill the links and assets before submitting. Use the Spanish or English version depending on the form; if it accepts only one language, prefer **English** (the jury includes international reviewers and an AI that reads the README, which is in English).

## Fixed fields

| Field | Value |
| --- | --- |
| Hub | Dev3pack Build Station (Santiago) |
| Tracks | Solana: Best App Overall · Solana: Best DeFi App · Supabase |
| Repository | https://github.com/Martinxito/closeby |
| Live demo | _TBD: Vercel production URL_ |
| Video (under 3 min) | _TBD_ |
| Program (Devnet) | `4vaVcMbVh5czXPMw3w6FCp8AFjNNuVtaquppq6ZEzugT` |
| Screenshots | _TBD: home, /vender, share page with QR, deal page (buy), "✅ Trato hecho" with receipt_ |
| Logo and banner | _TBD (Diego)_ |

---

## Español

### Nombre (≤ 50 caracteres)

Closeby

> Alternativa más descriptiva: **Closeby: pago protegido para archivos** (37 caracteres).

### Frase corta (≤ 120 caracteres)

Vende archivos a desconocidos sin riesgo: el comprador paga primero y el vendedor cobra cuando él confirma.

### Descripción (≤ 300 palabras)

Quienes venden trabajo digital por Instagram o WhatsApp (beats, fotos, diseños, informes) enfrentan siempre el mismo dilema: si el comprador paga primero, arriesga no recibir nada; si el vendedor manda el archivo primero, arriesga que no le paguen.

Closeby lo resuelve con un link. El vendedor sube su archivo, que queda guardado en privado, y comparte el link o un QR. El comprador paga y la plata queda en una bóveda de un programa en Solana que nadie puede tocar. Recién entonces desbloquea el archivo, lo descarga y presiona "Recibí el archivo": el vendedor cobra al instante.

Las reglas están en la cadena, así que la plata nunca queda atrapada. Si el comprador cancela antes de desbloquear, recupera todo. Si nunca desbloquea, se le devuelve. Si desbloquea y no responde, se le paga al vendedor. Cualquiera puede ejecutar esos plazos, pero la plata solo va al comprador o al vendedor, nunca a quien la mueve.

El usuario no ve nada de blockchain: entra con email o Google, ve precios en pesos chilenos y no necesita wallet, frase semilla ni SOL. Privy le crea una wallet invisible que firma en segundo plano, y nuestro servidor paga todas las comisiones. El servidor solo firma transacciones que él mismo armó, verificadas con un ticket HMAC.

Lo construimos con un programa propio en Anchor desplegado en devnet (27 tests, incluidos todos los casos que deben fallar), Next.js y Supabase. El archivo queda privado y el servidor compara su SHA-256 con el que quedó registrado en la cadena antes de publicar; la descarga es un link de 5 minutos solo para quien pagó.

El flujo completo funciona hoy en devnet. Lo siguiente: compraventas presenciales con el mismo programa, mediación de disputas y USDC real con carga en pesos.

---

## English

### Name (≤ 50 characters)

Closeby

> More descriptive option: **Closeby: protected payments for files** (37 characters).

### Short phrase (≤ 120 characters)

Sell files to strangers safely: the buyer pays first, and the seller is paid when the buyer confirms with one tap.

### Description (≤ 300 words)

People who sell digital work on Instagram or WhatsApp (beats, photos, designs, reports) face the same standoff every time: if the buyer pays first, they risk getting nothing; if the seller sends the file first, they risk never being paid.

Closeby solves it with a link. The seller uploads the file, which stays private, and shares a link or QR code. The buyer pays, and the money waits in a vault owned by a Solana program that nobody can touch. Only then does the buyer unlock the file, download it and tap "Recibí el archivo": the seller is paid instantly.

The rules live on-chain, so money never gets stuck. If the buyer cancels before unlocking, they get everything back. If they never unlock, they are refunded. If they unlock and go silent, the seller is paid. Anyone can trigger those deadlines, but the money only ever goes to the buyer or the seller, never to the caller.

Users never see the blockchain: they log in with email or Google, see prices in Chilean pesos, and need no wallet, seed phrase or SOL. Privy gives them an invisible embedded wallet that signs in the background, and our server pays every fee. The server only co-signs transactions it built itself, checked with an HMAC ticket.

Built with our own Anchor program on Devnet (27 tests, including every case that must fail), Next.js and Supabase. The file stays in private storage, and the server compares its SHA-256 with the hash recorded on-chain before publishing; the download is a 5-minute link for the buyer only.

The full flow works today on Devnet. Next: in-person sales on the same program, dispute mediation, and real USDC with a peso on-ramp.

---

## Social post (when submitting)

**ES:** Enviamos Closeby a la #Dev3pack Hackathon 🇨🇱: vende archivos a desconocidos sin riesgo. El comprador paga primero, la plata espera en un programa de Solana y el vendedor cobra cuando el comprador confirma con un botón. Sin wallet, sin SOL, con login por email. @dev3pack @solana @TryNoahAI _[link demo] [link repo]_

**EN:** We just submitted Closeby to the #Dev3pack Hackathon 🇨🇱: sell files to strangers without trust. The buyer pays first, the money waits in a Solana program, and the seller is paid when the buyer confirms with one tap. No wallet, no SOL, email login. @dev3pack @solana @TryNoahAI _[demo link] [repo link]_

## Before submitting

- [ ] Live demo URL works in a private window, on a phone, with email login
- [ ] Repo, demo and video links open in a private window (public)
- [ ] README top table has the demo and video links
- [ ] Screenshots, logo and banner uploaded
- [ ] Tracks selected: Solana Best App Overall, Best DeFi App, Supabase
- [ ] Post published with the tags
