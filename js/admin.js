async function renderAdmin(){
  if(!esAdmin()) return;
  const {data}=await sb.from('perfiles').select('*').order('created_at',{ascending:false});
  const t=document.getElementById('tabla-usuarios');
  if(!data?.length){t.innerHTML='<tr><td style="padding:20px;color:var(--muted)">Sin usuarios</td></tr>';return;}
  t.innerHTML=`<thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Desde</th><th></th></tr></thead><tbody>${data.map(u=>`<tr>
    <td>${u.nombre||'—'}</td><td style="color:var(--muted);font-family:monospace">${u.email?u.email.replace('@obracontrol.interno',''):'—'}</td>
    <td><span class="role-pill">${rolLabel(u.rol)}</span></td>
    <td><span class="badge ${u.activo?'badge-green':'badge-red'}">${u.activo?'Activo':'Inactivo'}</span></td>
    <td style="color:var(--muted)">${u.created_at?u.created_at.slice(0,10):'-'}</td>
    <td><button class="btn btn-ghost btn-sm" onclick="abrirModalRol('${u.id}','${u.rol}',${u.activo})">Editar</button></td>
  </tr>`).join('')}</tbody>`;
}

function abrirModalRol(uid,rol,activo){
  document.getElementById('rol-uid').value=uid;
  document.getElementById('rol-nuevo').value=rol;
  document.getElementById('rol-activo').value=String(activo);
  openModal('modal-rol');
}

async function guardarRol(){
  const uid=document.getElementById('rol-uid').value;
  const {error}=await sb.from('perfiles').update({rol:document.getElementById('rol-nuevo').value,activo:document.getElementById('rol-activo').value==='true'}).eq('id',uid);
  if(error){notify('Error: '+error.message,false);return;}
  notify('Usuario actualizado');
  closeModal('modal-rol');
  renderAdmin();
}


// ── CREAR USUARIO (admin) ──────────────────
async function crearUsuario(){
  if(!esAdmin()){notify('Solo el administrador puede crear usuarios',false);return;}
  const nombre=document.getElementById('cu-nombre').value.trim();
  const usuario=document.getElementById('cu-usuario').value.trim();
  const pass=document.getElementById('cu-pass').value;
  const rol=document.getElementById('cu-rol').value;
  if(!nombre||!usuario||!pass){notify('Completá nombre, usuario y contraseña',false);return;}
  if(pass.length<6){notify('Contraseña mínimo 6 caracteres',false);return;}
  if(!/^[a-z0-9._]+$/.test(usuario)){notify('Usuario: solo letras minúsculas, números y puntos',false);return;}

  // Convertimos username a email interno — el usuario nunca lo ve
  const emailInterno=usernameToEmail(usuario);

  const {data,error}=await sb.auth.signUp({
    email:emailInterno, password:pass,
    options:{data:{nombre, rol, username:usuario}}
  });
  if(error){
    if(error.message.includes('already registered')) notify('Ese nombre de usuario ya existe',false);
    else notify('Error: '+error.message,false);
    return;
  }

  if(data.user){
    await sb.from('perfiles').upsert({
      id:data.user.id, nombre,
      email:emailInterno,
      rol, activo:true
    },{onConflict:'id'});
  }

  notify('Usuario "'+nombre+'" creado correctamente');
  closeModal('modal-crear-usuario');
  ['cu-nombre','cu-usuario','cu-pass'].forEach(id=>document.getElementById(id).value='');
  renderAdmin();
}
