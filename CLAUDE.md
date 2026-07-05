# ObraControl — Contexto del proyecto

## Qué es
App de gestión de obra civil para NorTel (Nordeste Telecomunicaciones), fibra óptica.
Single-file: todo vive en `index.html` (HTML + JS + CSS embebido). Sin build step, sin framework.
Backend: Supabase (Postgres + Auth). Hosting actual: GitHub Pages (`fpelosa.github.io/obracontrol`),
en migración a `gestionobras.nor-tel.com` (DonWeb/Ferozo).

Repo: `github.com/fpelosa/obracontrol` — local en `~/Desktop/obracontrol/`.
Versión actual: v12.4 (numerar +0.1 en cada cambio, en 4 lugares del HTML: meta tag, title, y dos spans en el body — buscar con grep antes de bump).

## Deploy
```bash
cp ~/Downloads/index.html ~/Desktop/obracontrol/index.html && cd ~/Desktop/obracontrol && git add index.html && git commit -m 'mensaje' && git push
```
Antes de cada deploy: chequear sintaxis. El archivo no es JS puro (tiene HTML), extraer los `<script>` inline primero:
```bash
python3 -c "
from html.parser import HTMLParser
class E(HTMLParser):
    def __init__(self): super().__init__(); self.f=False; self.s=[]; self.c=[]; self.a=None
    def handle_starttag(self,t,a):
        if t=='script': self.f=True; self.c=[]; self.a=dict(a)
    def handle_endtag(self,t):
        if t=='script' and self.f:
            self.f=False
            if 'src' not in (self.a or {}): self.s.append(''.join(self.c))
    def handle_data(self,d):
        if self.f: self.c.append(d)
h=open('index.html',encoding='utf-8').read(); p=E(); p.feed(h)
open('/tmp/check.js','w',encoding='utf-8').write('\n;\n'.join(p.s))
"
node --check /tmp/check.js && echo OK
```

## Nueva infraestructura (en migración)
- Subdominio: `gestionobras.nor-tel.com`, alojado en DonWeb/Ferozo, carpeta `/public_html/gestionobras`
  (¡ojo! en el panel Ferozo el tipo de subdominio debe ser "Redireccionar a una carpeta del sitio",
  NO "Sin redirección" — con "sin redirección" sirve la raíz de Joomla de la web corporativa en vez
  de la carpeta propia)
- Cuenta FTP aislada: `ftp_gestionobras@nor-tel.com`, con acceso limitado solo a esa carpeta
  (los webmasters de la web corporativa NO tienen esta cuenta)
- Host FTP: `c1830261.ferozo.com` — servidor **ProFTPD**, exige FTPS (TLS explícito) en el canal de control
- SSL del subdominio: certificado Sectigo, solicitado vía panel DonWeb (validación por Registro DNS,
  automática porque el dominio usa los DNS de DonWeb). El de `nor-tel.com` es tipo "single", NO cubre
  subdominios — cada subdominio necesita su propio certificado (como ya tenían con `gps.nor-tel.com`)
- Supabase Auth → Redirect URLs: se agregaron `https://gestionobras.nor-tel.com` y
  `https://gestionobras.nor-tel.com/*` sin tocar la URL de GitHub Pages (conviven ambas)

### Deploy automático a DonWeb (GitHub Actions)
Archivo: `.github/workflows/deploy-donweb.yml`. Se dispara con cada push a `main` que modifique
`index.html`. Usa `lftp` instalado al vuelo en el runner — **no usar `SamKirkland/FTP-Deploy-Action`**,
ver por qué abajo.

```yaml
name: Deploy a DonWeb (gestionobras.nor-tel.com)

on:
  push:
    branches: [main]
    paths: ['index.html']

jobs:
  ftp-deploy:
    name: Subir index.html por FTPS (lftp)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Instalar lftp
        run: sudo apt-get update -qq && sudo apt-get install -y lftp
      - name: Deploy por FTPS con lftp
        env:
          FTP_SERVER: ${{ secrets.DONWEB_FTP_SERVER }}
          FTP_USERNAME: ${{ secrets.DONWEB_FTP_USERNAME }}
          FTP_PASSWORD: ${{ secrets.DONWEB_FTP_PASSWORD }}
        run: |
          lftp -e "
            set ftp:ssl-force true;
            set ftp:ssl-protect-data true;
            set ssl:verify-certificate no;
            set ftp:passive-mode true;
            set net:timeout 15;
            set net:max-retries 1;
            open -u $FTP_USERNAME,$FTP_PASSWORD $FTP_SERVER;
            put index.html;
            bye
          "
```

Secrets cargados en GitHub (Settings → Secrets and variables → Actions):
`DONWEB_FTP_SERVER` (sin `ftp://` adelante, solo el host), `DONWEB_FTP_USERNAME`, `DONWEB_FTP_PASSWORD`.

**Por qué no usamos `FTP-Deploy-Action`:** su librería interna (`basic-ftp`) no reutiliza correctamente
la sesión TLS 1.3 en el canal de datos, y ProFTPD (el servidor de DonWeb) exige esa reutilización por
seguridad — resultado: `Error: Client is closed because read ECONNRESET (data socket)`. Es un problema
conocido de `basic-ftp` con TLS 1.3, no algo mal configurado de nuestro lado. `lftp` sí maneja esto bien.

**Trampa al armar el comando de `lftp`:** los `set` (ssl-force, passive-mode, etc.) tienen que ir
**antes** del `open`, nunca pasar el host como argumento final de `lftp` en la línea de comando —
eso dispara una conexión automática ANTES de que se apliquen los `set`, y como el servidor exige TLS
desde el inicio, esa conexión temprana en texto plano se cae silenciosamente (`Not connected` al hacer
`put`, sin más pistas). Tampoco escapar con `\"..\"` alrededor de `$FTP_SERVER`/`$FTP_USERNAME` dentro
del string de `-e` — como bash ya expande la variable antes de que `lftp` la vea, esas comillas quedan
pegadas como caracteres literales al valor y rompen la resolución del hostname
(`Name or service not known`).

**Nota de permisos de GitHub:** un Personal Access Token sin el scope `workflow` no puede crear/modificar
archivos dentro de `.github/workflows/` por `git push` (error: `refusing to allow a Personal Access
Token to create or update workflow ... without workflow scope`). Alternativas: agregar el scope
`workflow` al token, o editar el archivo directo en la web de GitHub cuando sea solo ese archivo.

**Nota sobre "Re-run":** si falla un workflow y se corrige el `.yml`, el botón "Re-run jobs" de GitHub
**no relee la versión actualizada** — vuelve a ejecutar exactamente la definición que tenía el commit
original. Para probar un fix del workflow hace falta un commit nuevo (aunque sea trivial, como un
comentario en `index.html`), no alcanza con re-ejecutar.

## Roles de usuario (tabla `perfiles`)
Roles activos hoy: `admin`, `supervisor`. (El código también contempla `director`, `ingeniero`,
`administrativo` en algunas funciones de permisos como `puedeEditar()`, pero ningún usuario real
tiene esos roles todavía.)

- **admin**: acceso total, incluye Finanzas, Cobranzas, Clientes, Logs, Rentabilidad, aprobar gastos,
  editar precio_venta/precio_cliente
- **supervisor**: Dashboard, Proyectos, Reportes. Puede cargar/editar gastos (quedan "por aprobar"),
  cargar/editar/borrar partidas (menos precio_venta), certificar avances, adjuntar comprobantes.
  NO ve Finanzas/Cobranzas/Clientes/Logs/Rentabilidad/Admin.

Funciones helper de rol en el código: `esAdmin()`, `esSupervisor()`, `puedeEditar()`,
`puedeVerPrecioCliente()`, `es_admin()` (esta última es función SQL en Supabase, no JS).

## Seguridad de base de datos (Supabase RLS)
**Las 19 tablas de `public` tienen RLS activado** (auditoría completa hecha en julio 2026).
Patrón general:
- Tablas financieras (`fin_*`, `obra_cobros`, `cobros`, `echeqs`, `ventas`, `venta_cuotas`,
  `presupuestos`, `presupuestos_items`, `documentos`, `proyecto_miembros`): solo admin (`es_admin()`)
- `perfiles`: cada uno lee su fila, admin lee todas; nadie puede auto-cambiarse `rol`/`activo`
- `gastos`: todos leen, admin+supervisor insertan, solo admin puede pasar `estado_aprobacion` a 'aprobado'
- `partidas` y `proyectos`: todos leen/editan, pero `precio_venta` / `precio_cliente` solo los toca admin
  (patrón: `coalesce(campo,0) = coalesce(valor_anterior,0)` en el `with_check` del UPDATE)
- Función auxiliar `es_admin()` (SECURITY DEFINER) para evitar recursión infinita al chequear rol
  contra la propia tabla `perfiles` desde una política de `perfiles`

**Importante:** RLS protege filas, no columnas. Para "todos ven la fila pero un campo es admin-only"
se usa el truco del `with_check` comparando contra el valor previo — pero el FRONTEND también tiene
que cooperar (no autocompletar ni enviar el campo si el rol no debería tocarlo). Dos bugs reales
salieron de este desajuste, ver changelog abajo.

## Bugs de frontend encontrados y corregidos (patrón a vigilar)
1. **v12.2**: `calcularPrecioVentaPartida()` autocompletaba `precio_venta` en un campo oculto para
   supervisor, violando la política RLS al guardar. Fix: no calcular si `!puedeVerPrecioCliente()`,
   y en el insert/update, omitir o forzar en 0 el campo según corresponda si el rol no puede verlo
   (mejor omitir la key del objeto que mandar 0, así un UPDATE no pisa el valor real).
2. **v12.3**: ítems de nav (`nav-cobros`, `nav-clientes`, `nav-logs`) se mostraban con `display='flex'`
   solo en el `if(esAdmin())`, sin un `else` que los oculte — quedaban "pegados" visibles si hubo una
   sesión admin antes en la misma pestaña. Fix: agregarlos a la lista `navSupervisorOcultos` en
   `actualizarVisibilidadAdmin()`, que sí se recalcula en cada `cargarPerfil()`.
3. **v12.4**: pantallas completas (`.view` como Cobranzas/Finanzas, y el overlay de detalle de
   proyecto) quedaban con la clase `active` puesta de una sesión anterior — `showLogin()` nunca las
   reseteaba. Un supervisor podía ver (aunque no operar, gracias a RLS) datos financieros de la
   sesión admin anterior sin recargar la página. Fix: `showLogin()` ahora resetea `.view.active` a
   `view-dashboard` en cada logout.

**Lección general**: cualquier cosa "oculta con CSS" (`display:none`, quitar clase `active`) puede
seguir teniendo datos/valores viejos en el DOM o en variables JS que sobreviven a un cambio de sesión
en la misma pestaña sin recargar. Cuando se agregue una pantalla o campo nuevo restringido por rol,
revisar: (a) que el RLS lo cubra a nivel fila/columna, (b) que el frontend no autocomplete/filtre mal
el campo, (c) que el estado se resetee correctamente en logout/cambio de usuario.

## Pendientes conocidos
- PDF de Presupuestos: alinear al template de NorTel (header blanco con logo, franja naranja,
  bloque TOTAL FINAL distintivo, campos "Obra/Descripción" y "Plazo de entrega")
- Modularización del `index.html` (Opción A liviana, en veremos): separar CSS a archivo aparte,
  después JS por módulo (`clientes.js`, `gastos.js`, `partidas.js`, etc.) cargados como
  `<script type="module">`, dejando `proyectos.js` (el módulo más grande) para el final
- Cuando se confirme que `gestionobras.nor-tel.com` funciona bien de punta a punta (login con los
  distintos roles, todos los módulos), avisar al equipo para migrar de GitHub Pages a DonWeb como URL
  principal. Mientras tanto ambas conviven sin conflicto (mismo Supabase, hostings independientes)

## Convenciones de código
- Números: formato es-AR (punto miles, coma decimales) vía `parseInput(id)` / `fmtInput(val)`
- Modales: `openModal(id)` / `closeModal(id)`, clase `.open`
- Vistas: sistema de `.view` + `.view.active`, cambiadas con `showView(v)`
- Botones de guardado: envolver con `withLoading(this, fn)` para evitar doble-submit
