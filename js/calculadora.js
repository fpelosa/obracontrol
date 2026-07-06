// ── CALCULADORA ──────────────────────────────
let _calcExpr = '';
let _calcTargetId = '';

function abrirCalculadora(targetId){
  _calcTargetId = targetId;
  _calcExpr = '';
  document.getElementById('calc-display').textContent = '0';
  openModal('modal-calc');
}
function calcBtn(v){
  _calcExpr += v;
  document.getElementById('calc-display').textContent = _calcExpr;
}
function calcClear(){
  _calcExpr = '';
  document.getElementById('calc-display').textContent = '0';
}
function calcEqual(){
  try {
    const result = Function('"use strict"; return (' + _calcExpr + ')')();
    const rounded = Math.round(result * 100) / 100;
    _calcExpr = String(rounded);
    document.getElementById('calc-display').textContent = rounded.toLocaleString('es-AR');
  } catch(e) {
    document.getElementById('calc-display').textContent = 'Error';
    _calcExpr = '';
  }
}
function calcUsar(){
  if(!_calcTargetId) return;
  try {
    const result = _calcExpr ? Function('"use strict"; return (' + _calcExpr + ')')() : 0;
    const rounded = Math.round(result * 100) / 100;
    const el = document.getElementById(_calcTargetId);
    if(el){
      el.value = fmtInput(rounded);
      el.dispatchEvent(new Event('input'));
      el.dispatchEvent(new Event('blur'));
    }
  } catch(e){}
  closeModal('modal-calc');
}
