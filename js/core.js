// ══════════════════════════════════════════
// CONFIGURACIÓN — reemplazá con tus datos de Supabase
// ══════════════════════════════════════════
const SUPABASE_URL  = 'https://vhxsjdifmgvyvnwupspt.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoeHNqZGlmbWd2eXZud3Vwc3B0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NDY4MzEsImV4cCI6MjA5MDAyMjgzMX0.4VXNJ1dat-0QPwvGT0zAuSkOrAjXKPXsdBi4TXFYemQ';
// ══════════════════════════════════════════

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage: window.localStorage,
    storageKey: 'obracontrol-auth',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  },
  global: {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    }
  }
});
window.sb = sb;

// Limpiar sesiones viejas que puedan causar conflictos
const _authKey = 'obracontrol-auth';
try {
  const _stored = localStorage.getItem(_authKey);
  if(_stored) {
    const _parsed = JSON.parse(_stored);
    const _exp = _parsed?.expires_at;
    if(_exp && _exp < Math.floor(Date.now()/1000)) {
      localStorage.removeItem(_authKey);
      console.log('Sesión expirada limpiada');
    }
  }
} catch(e) {}
let currentUser = null;
let currentPerfil = null; // null = sin perfil = rol supervisor por defecto (más restrictivo)
let _perfilYaRenderizado = false;
let currentProyectoId = null;
let chartBarras = null, chartDona = null, chartCertificado = null, chartLineas = null, chartCateg = null;
let cache = { proyectos: [], gastos: [] };

// ── HELPERS ──────────────────────────────
const fmt = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(n||0);
const fmtN = n => new Intl.NumberFormat('es-AR',{maximumFractionDigits:0}).format(n||0);
const fmtMoneda = (n, moneda) => moneda==='USD'
  ? 'U$S '+Number(n||0).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})
  : fmt(n);
const pct = (a,b) => b>0?Math.round(a/b*100):0;
const colorPct = p => p>90?'var(--red)':p>70?'var(--orange)':p>50?'var(--accent)':'var(--green)';
const estadoBadge = e => {
  const m={'En curso':'badge-blue','Planificación':'badge-amber','Finalizado':'badge-green','Suspendido':'badge-red','Para Presupuesto':'badge-purple','Esperando aprobación':'badge-cyan'};
  return `<span class="badge ${m[e]||'badge-gray'}">${e}</span>`;
};
const rolLabel = r => ({admin:'Administrador',director:'Director',ingeniero:'Ingeniero',administrativo:'Administrativo',supervisor:'Supervisor',visor:'Visor'}[r]||r);
// Por seguridad: sin perfil cargado, asumir el rol más restrictivo (supervisor)
// Solo cuando el perfil confirme explícitamente 'admin' se habilitan funciones elevadas
const puedeEditar = () => currentPerfil && ['admin','director','ingeniero','administrativo'].includes(currentPerfil.rol);
const esAdmin = () => currentPerfil?.rol === 'admin';
const esSupervisor = () => !currentPerfil || currentPerfil.rol === 'supervisor';
const esAdministrativoOSuperior = () => currentPerfil && ['admin','director','ingeniero','administrativo'].includes(currentPerfil.rol);

function notify(msg, ok=true){
  const n=document.getElementById('notif');
  n.textContent=msg; n.style.background=ok?'var(--green)':'var(--red)';
  n.style.color=ok?'#000':'#fff'; n.style.display='block';
  setTimeout(()=>n.style.display='none',2800);
}

// ── AUTH ──────────────────────────────────
function usernameToEmail(u){ return u.toLowerCase().replace(/[^a-z0-9]/g,'_')+'@obracontrol.interno'; }

async function doLogin(){
  const usuario=document.getElementById('login-usuario').value.trim();
  const pass=document.getElementById('login-pass').value;
  const err=document.getElementById('login-err');
  err.textContent='';
  if(!usuario||!pass){err.textContent='Completá usuario y contraseña';return;}

  // Si tiene @ es un email directo, sino generamos el interno
  const email=usuario.includes('@') ? usuario : usernameToEmail(usuario);

  showLoading('Ingresando...');
  const {error}=await sb.auth.signInWithPassword({email,password:pass});
  if(error){
    hideLoading();
    err.textContent='Usuario o contraseña incorrectos';
  }
}

function mostrarSetup(){
  document.getElementById('panel-login').style.display='none';
  document.getElementById('panel-setup').style.display='block';
}
function mostrarLogin(){
  document.getElementById('panel-setup').style.display='none';
  document.getElementById('panel-login').style.display='block';
}

async function doSetup(){
  const nombre=document.getElementById('setup-nombre').value.trim();
  const usuario=document.getElementById('setup-usuario').value.trim();
  const pass=document.getElementById('setup-pass').value;
  const err=document.getElementById('setup-err');
  err.textContent='';
  if(!nombre||!usuario||!pass){err.textContent='Completá todos los campos';return;}
  if(pass.length<6){err.textContent='Contraseña mínimo 6 caracteres';return;}

  const email=usernameToEmail(usuario);
  const {data,error}=await sb.auth.signUp({email,password:pass,options:{data:{nombre,rol:'admin'}}});
  if(error){err.textContent='Error: '+error.message;return;}
  if(data.user){
    await sb.from('perfiles').upsert({
      id:data.user.id, nombre, email, rol:'admin', activo:true
    },{onConflict:'id'});
    // Auto login
    await sb.auth.signInWithPassword({email,password:pass});
  }
}

async function doLogout(){
  showLoading('Cerrando sesión...');
  await sb.auth.signOut();
  document.getElementById('login-usuario').value='';
  document.getElementById('login-pass').value='';
  showLogin();
}

// ── PANTALLA DE CARGA ──
function showLoading(msg='Cargando...'){
  document.getElementById('loading-screen').style.display='flex';
  document.getElementById('loading-msg').textContent=msg;
}
function hideLoading(){
  document.getElementById('loading-screen').style.display='none';
}
function showApp(){
  hideLoading();
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('app').style.display='block';
}
function showLogin(){
  hideLoading();
  document.getElementById('app').style.display='none';
  document.getElementById('auth-screen').style.display='flex';
  currentUser=null; currentPerfil=null; _perfilYaRenderizado=false;
  // Resetear la vista activa a Dashboard para que ninguna pantalla restringida
  // (Cobranzas, Finanzas, etc.) quede visible al iniciar sesión el próximo usuario
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('active'));
  const viewDash=document.getElementById('view-dashboard');
  if(viewDash) viewDash.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  const primerNav=document.querySelectorAll('.nav-item')[0];
  if(primerNav) primerNav.classList.add('active');
}

// Auth state listener — con timeout para evitar cuelgues
let authInitialized = false;
let authTimeout = null;

let appLoaded = false;
// Mostrar login inmediatamente — sin esperar nada
showLogin();
authInitialized = false;

sb.auth.onAuthStateChange(async (event, session) => {
  console.log('Auth event:', event, 'user:', session?.user?.id);
  if(authTimeout) { clearTimeout(authTimeout); authTimeout=null; }

  if(event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    if(session?.user && !appLoaded) {
      appLoaded = true;
      currentUser = session.user;
      showLoading('Cargando datos...');
      await cargarPerfil();
      await initApp();
      showApp();
    } else if(session?.user && appLoaded) {
      currentUser = session.user;
    }
  } else if(event === 'INITIAL_SESSION') {
    authInitialized = true;
    if(session?.user) {
      if(!appLoaded) {
        appLoaded = true;
        currentUser = session.user;
        showLoading('Cargando datos...');
        await cargarPerfil();
        await initApp();
        showApp();
      }
    }
    // Si no hay sesión, ya estamos en login — no hacer nada
  } else if(event === 'SIGNED_OUT') {
    appLoaded = false;
    showLogin();
  }
});

// Timeout de seguridad: si en 8s no llegó INITIAL_SESSION, el login ya está visible
authTimeout = setTimeout(() => {
  if(!authInitialized) {
    console.warn('Auth timeout — login ya visible');
    authInitialized = true;
  }
}, 8000);


async function cargarPerfil(){
  try {
    // Timeout corto: 4s. Si falla, entrar con rol supervisor y recargar perfil en background
    const result = await Promise.race([
      sb.from('perfiles').select('*').eq('id',currentUser.id).single(),
      new Promise(resolve => setTimeout(() => resolve({data:null,error:{code:'TIMEOUT'}}), 4000))
    ]);
    let data = result.data;
    let error = result.error;

    if(error?.code === 'TIMEOUT'){
      // Entrar como supervisor inmediatamente, recargar perfil en background
      console.warn('cargarPerfil: timeout — entrando como supervisor, recargando en background...');
      const nombre = currentUser.email.split('@')[0];
      currentPerfil = { id:currentUser.id, nombre, email:currentUser.email, rol:'supervisor', activo:true };
      // Reintentar en background sin bloquear
      sb.from('perfiles').select('*').eq('id',currentUser.id).single().then(r=>{
        if(r.data){
          currentPerfil = r.data;
          // Actualizar UI con el rol real
          document.getElementById('user-name').textContent=currentPerfil.nombre||'—';
          document.getElementById('user-rol').textContent=rolLabel(currentPerfil.rol);
          document.getElementById('user-avatar').textContent=(currentPerfil.nombre||'?')[0].toUpperCase();
          if(esAdmin()){ document.getElementById('nav-admin').style.display='flex'; document.getElementById('nav-rentabilidad').style.display='flex'; document.getElementById('nav-clientes').style.display='flex'; document.getElementById('nav-logs').style.display='flex'; document.getElementById('nav-cobros').style.display='flex'; }
          actualizarVisibilidadAdmin();
        }
      });
    } else if(error?.code === 'PGRST116'){
      const nombre = currentUser.email.split('@')[0];
      currentPerfil = { id:currentUser.id, nombre, email:currentUser.email, rol:'visor', activo:true };
      sb.from('perfiles').insert(currentPerfil).then(()=>console.log('Perfil creado como visor'));
    } else {
      currentPerfil = data;
    }

    if(currentPerfil){
      document.getElementById('user-name').textContent=currentPerfil.nombre||'—';
      document.getElementById('user-rol').textContent=rolLabel(currentPerfil.rol);
      document.getElementById('user-avatar').textContent=(currentPerfil.nombre||'?')[0].toUpperCase();
      if(esAdmin()){ document.getElementById('nav-admin').style.display='flex'; document.getElementById('nav-rentabilidad').style.display='flex'; document.getElementById('nav-clientes').style.display='flex'; document.getElementById('nav-logs').style.display='flex'; document.getElementById('nav-cobros').style.display='flex'; }
      if(!puedeEditar() && !esSupervisor()){
        document.getElementById('btn-nueva-obra').style.display='none';
        document.getElementById('btn-nueva-obra2').style.display='none';
      }
      actualizarVisibilidadAdmin();
      if(!_perfilYaRenderizado){
        _perfilYaRenderizado = true;
        if(currentProyectoId && document.getElementById('detalle-proyecto')?.style.display !== 'none'){
          verDetalle(currentProyectoId);
        }
      }
    }
  } catch(e) {
    console.error('cargarPerfil error:', e);
    mostrarLogin();
    notify('Error al cargar tu perfil. Por favor recargá la página.', false);
  }
}

// ── VIEWS ──────────────────────────────────
function showView(v){
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  document.getElementById('view-'+v).classList.add('active');
  const map={dashboard:0,proyectos:1,gastos:2,reportes:3,presupuestos:4,finanzas:5,rentabilidad:6,admin:7};
  const items=document.querySelectorAll('.nav-item');
  if(map[v]!==undefined&&items[map[v]]) items[map[v]].classList.add('active');
  const fns={dashboard:renderDashboard,proyectos:renderProyectos,gastos:renderGastos,reportes:renderReportes,admin:renderAdmin,finanzas:renderFinanzas,rentabilidad:renderRentabilidadView,presupuestos:renderPresupuestos,clientes:renderClientes,logs:renderLogs,cobros:renderCobros};
  if(fns[v]) fns[v]();
}

function openModal(id){
  const el = document.getElementById(id);
  console.log('openModal:', id, 'found:', !!el);
  if(el){
    el.classList.add('open');
    console.log('modal classes after:', el.className, 'display:', window.getComputedStyle(el).display);
  }
}
function closeModal(id){ document.getElementById(id)?.classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open');}));

// ── INIT ──────────────────────────────────
async function withTimeout(promise, ms=8000, fallback=null){
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => { console.warn('Query timeout'); resolve(fallback); }, ms))
  ]);
}

async function initApp(){
  // Mostrar UI inmediatamente con loading state
  document.getElementById('dash-metrics').innerHTML='<div class="loading" style="color:var(--muted);font-size:13px">Cargando...</div>';
  try {
    await Promise.all([
      withTimeout(fetchProyectos(), 8000),
      withTimeout(fetchGastos(), 8000)
    ]);
  } catch(e){
    console.error('initApp error:', e);
  }
  renderDashboard();
  const viewActiva = document.querySelector('.view.active');
  if(viewActiva?.id === 'view-proyectos') renderProyectos();
}

async function fetchProyectos(){
  try {
    // Todas las queries en paralelo
    const [r1, r2, r3] = await Promise.all([
      sb.from('proyectos').select('*').order('created_at',{ascending:false}),
      sb.from('gastos').select('proyecto_id, monto, estado_aprobacion'),
      sb.from('partidas').select('proyecto_id, presupuesto, precio_venta')
    ]);
    const data = r1.data||[];
    const gastos = r2.data||[];
    const partidas = r3.data||[];

    const gastosPorProy={}, gastosPendientesPorProy={};
    gastos.forEach(g=>{
      if(g.estado_aprobacion==='aprobado'||!g.estado_aprobacion)
        gastosPorProy[g.proyecto_id]=(gastosPorProy[g.proyecto_id]||0)+Number(g.monto);
      if(g.estado_aprobacion==='por_aprobar')
        gastosPendientesPorProy[g.proyecto_id]=(gastosPendientesPorProy[g.proyecto_id]||0)+1;
    });

    const partidasPorProy={}, pptoPorProy={};
    partidas.forEach(p=>{
      partidasPorProy[p.proyecto_id]=(partidasPorProy[p.proyecto_id]||0)+1;
      pptoPorProy[p.proyecto_id]=(pptoPorProy[p.proyecto_id]||0)+Number(p.presupuesto||0);
    });

    cache.proyectos=data.map(p=>{
      const pptoCalculado = pptoPorProy[p.id]||0;
      return {
        ...p,
        presupuesto_total: pptoCalculado,
        total_gastado: gastosPorProy[p.id]||0,
        saldo: pptoCalculado-(gastosPorProy[p.id]||0),
        pct_ejecutado: pptoCalculado>0?Math.round((gastosPorProy[p.id]||0)*100/pptoCalculado):0,
        total_partidas: partidasPorProy[p.id]||0,
        total_gastos: 0,
        gastos_pendientes: gastosPendientesPorProy[p.id]||0,
        responsable_nombre: ''
      };
    });
  } catch(e){ console.error('fetchProyectos error:',e); cache.proyectos=[]; }
}

async function fetchGastos(){
  try {
    // Solo traer campos necesarios, sin joins pesados
    const {data}=await sb.from('gastos').select('id,proyecto_id,partida_id,fecha,descripcion,monto,categoria,comprobante_nro,estado_aprobacion,observaciones,cuenta_id,created_by,created_at').order('fecha',{ascending:false});
    cache.gastos=data||[];
  } catch(e){
    console.error('fetchGastos error:', e);
    cache.gastos=[];
  }
}

async function fetchPartidas(proyId){
  const {data:partidas, error}=await sb.from('partidas').select('*').eq('proyecto_id',proyId).order('orden');
  console.log('fetchPartidas:', partidas?.length, error);
  if(!partidas) return [];
  const {data:gastos}=await sb.from('gastos').select('partida_id, monto, estado_aprobacion, tipo_cambio').eq('proyecto_id',proyId);
  const monedaPorPart={};
  partidas.forEach(p=>{ monedaPorPart[p.id]=p.moneda||'ARS'; });
  const gastosPorPart={};
  (gastos||[]).forEach(g=>{
    if(g.partida_id && (g.estado_aprobacion==='aprobado' || !g.estado_aprobacion)){
      // El monto del gasto siempre se carga en pesos; si la partida es en USD, se
      // convierte con el tipo de cambio registrado en ese gasto puntual para poder
      // comparar gastado vs. presupuesto en la misma moneda.
      const esUsd = monedaPorPart[g.partida_id]==='USD';
      const monto = esUsd && Number(g.tipo_cambio)>0 ? Number(g.monto)/Number(g.tipo_cambio) : Number(g.monto);
      gastosPorPart[g.partida_id]=(gastosPorPart[g.partida_id]||0)+monto;
    }
  });
  return partidas.map(p=>({
    ...p,
    total_gastado: gastosPorPart[p.id]||0,
    saldo: p.presupuesto-(gastosPorPart[p.id]||0),
    pct_ejecutado: p.presupuesto>0?Math.round((gastosPorPart[p.id]||0)*100/p.presupuesto):0
  }));
}

