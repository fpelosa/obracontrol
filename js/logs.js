// ══════════════════════════════════════════
// MÓDULO LOGS
// ══════════════════════════════════════════
let cacheLogs = [];

async function log(accion, entidadTipo, entidadId, entidadNombre, detalle={}){
  try {
    await sb.from('logs').insert({
      usuario_id: currentUser?.id,
      usuario_nombre: currentPerfil?.nombre || currentUser?.email || 'Sistema',
      accion,
      entidad_tipo: entidadTipo,
      entidad_id: entidadId || null,
      entidad_nombre: entidadNombre || null,
      detalle
    });
  } catch(e){ console.warn('Log error:', e); }
}

async function renderLogs(){
  if(!esAdmin()) return;
  document.getElementById('log-buscar').value='';
  document.getElementById('log-filtro-tipo').value='';
  const {data,error} = await sb.from('logs').select('*').order('created_at',{ascending:false}).limit(500);
  cacheLogs = data||[];
  renderTablaLogs();
}

function filtrarLogs(){
  renderTablaLogs();
}

function renderTablaLogs(){
  const q=(document.getElementById('log-buscar')?.value||'').toLowerCase();
  const tipo=document.getElementById('log-filtro-tipo')?.value||'';
  let lista=cacheLogs;
  if(q) lista=lista.filter(l=>(l.usuario_nombre||'').toLowerCase().includes(q)||(l.accion||'').toLowerCase().includes(q)||(l.entidad_nombre||'').toLowerCase().includes(q));
  if(tipo) lista=lista.filter(l=>l.entidad_tipo===tipo);

  const cont=document.getElementById('logs-cont');
  if(!cont) return;
  if(!lista.length){ cont.innerHTML='<div class="empty"><p>No hay logs registrados.</p></div>'; return; }

  const iconos={proyecto:'📁',gasto:'💰',partida:'📋',presupuesto:'📄',cliente:'👤',usuario:'👥',adjunto:'📎'};

  cont.innerHTML=`<div class="table-wrap"><table>
    <thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>Nombre</th><th>Detalle</th></tr></thead>
    <tbody>${lista.map(l=>{
      const fecha=new Date(l.created_at);
      const fechaStr=fecha.toLocaleDateString('es-AR')+' '+fecha.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
      const icon=iconos[l.entidad_tipo]||'⚙️';
      const detalle=l.detalle&&Object.keys(l.detalle).length?
        Object.entries(l.detalle).map(([k,v])=>`<span style="font-size:11px;color:var(--muted)">${k}: <span style="color:var(--text)">${v}</span></span>`).join(' · ')
        :'—';
      return `<tr>
        <td style="white-space:nowrap;font-size:12px;color:var(--muted)">${fechaStr}</td>
        <td style="font-weight:500;font-size:13px">${l.usuario_nombre||'—'}</td>
        <td><span class="badge badge-gray" style="font-size:11px">${l.accion}</span></td>
        <td style="font-size:12px">${icon} ${l.entidad_tipo||'—'}</td>
        <td style="font-size:13px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.entidad_nombre||'—'}</td>
        <td style="font-size:12px;color:var(--muted);max-width:250px">${detalle}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}
