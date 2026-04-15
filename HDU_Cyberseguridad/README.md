# Portal Global Seguros - MFA (Demo HDU)

Demo estática (HTML + CSS + JS vanilla) que simula el flujo de autenticación multifactor para el Portal Global Seguros, según la HDU de Ciberseguridad.

## Flujo

1. **Login** — usuario, contraseña y perfil (cliente / intermediario / funcionario).
2. **Setup MFA** — configurar y verificar al menos 2 métodos: SMS, correo electrónico o app Authenticator.
3. **Elegir método** — seleccionar el canal para recibir el OTP.
4. **Challenge OTP** — código de 6 dígitos, vigencia 60 s, 3 intentos.
5. **Bloqueo** — tras 3 intentos fallidos, cuenta bloqueada por 10 min.
6. **Dashboard** — portal simulado con sidebar corporativo y opciones de seguridad.

## Desarrollo local

```bash
python3 -m http.server 4173
# abrir http://localhost:4173
```

El panel DEV (esquina inferior izquierda) permite saltar entre pantallas sin recorrer el flujo. Está activo automáticamente en `localhost` o agregando `?dev=1` a la URL.

## Deploy en Vercel

1. Crear repositorio en GitHub y hacer push de esta carpeta.
2. En Vercel: **New Project** → importar el repo.
3. Framework Preset: **Other** (sitio estático).
4. Build & Output: dejar en blanco (no hay build).
5. Deploy.

`vercel.json` incluye headers de caché para assets y configuración de URLs limpias.

## Estructura

```
.
├── index.html
├── styles.css
├── app.js
├── source/
│   ├── Logo-GS-20253.svg     Logo original (navy + rojo)
│   ├── Logo-GS-white.svg     Logo con texto blanco para fondos navy
│   ├── grupo-63.png          Logo alternativo (chulo)
│   └── patter_menu.png       Pattern decorativo del sidebar
├── vercel.json
└── .gitignore
```
