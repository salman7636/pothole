const state = { token: localStorage.getItem('pv_token'), user: JSON.parse(localStorage.getItem('pv_user') || 'null') };
const $ = (selector) => document.querySelector(selector);
const api = async (path, options = {}) => {
  const headers = { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || 'Request failed');
  return body;
};

function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3000); }
function badge(value) { return `<span class="badge ${String(value).toLowerCase()}">${String(value).replaceAll('_', ' ')}</span>`; }
function setUser() { $('#user-name').textContent = state.user ? state.user.name : 'Guest access'; $('#open-auth').textContent = state.user ? 'Sign out' : 'Sign in'; }

async function loadOverview() {
  try {
    const data = await api('/analytics/summary');
    const status = data.potholes_by_status;
    $('#total-potholes').textContent = data.potholes_total;
    $('#open-potholes').textContent = (status.detected || 0) + (status.assigned || 0) + (status.in_progress || 0);
    $('#total-orders').textContent = data.work_orders_total;
    $('#verified-potholes').textContent = status.verified || 0;
    const values = data.potholes_by_severity; const max = Math.max(1, ...Object.values(values));
    $('#severity-chart').innerHTML = Object.keys(values).length ? Object.entries(values).map(([name, count]) => `<div class="bar-row"><span>${name}</span><div class="bar"><i style="width:${count / max * 100}%"></i></div><b>${count}</b></div>`).join('') : '<p class="muted">No severity data available.</p>';
  } catch { $('#connection-label').textContent = 'API unavailable'; }
}

async function loadPotholes() {
  const rows = await api('/potholes');
  $('#pothole-rows').innerHTML = rows.map(p => `<tr><td>#${p.id}</td><td>${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}</td><td>${badge(p.severity)}</td><td>${badge(p.priority)}</td><td>${badge(p.status)}</td></tr>`).join('');
  $('#pothole-empty').hidden = rows.length > 0;
}
async function loadOperations() {
  const [contractors, orders] = await Promise.all([api('/contractors'), api('/work-orders')]);
  $('#contractor-rows').innerHTML = contractors.map(c => `<tr><td>${c.name}</td><td>${c.company}</td><td>${c.email || c.phone || '-'}</td><td>${badge(c.active ? 'active' : 'inactive')}</td></tr>`).join('');
  $('#contractor-empty').hidden = contractors.length > 0;
  $('#order-rows').innerHTML = orders.map(o => `<tr><td>#${o.id}</td><td>#${o.pothole_id}</td><td>${badge(o.priority)}</td><td>${badge(o.status)}</td></tr>`).join('');
  $('#order-empty').hidden = orders.length > 0;
}
function refresh() { loadOverview(); loadPotholes().catch(() => {}); loadOperations().catch(() => {}); }

document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.nav-item,.view').forEach(el => el.classList.remove('active'));
  button.classList.add('active'); $(`#${button.dataset.view}`).classList.add('active');
  $('#page-title').textContent = button.textContent; $('#section-label').textContent = button.dataset.view === 'overview' ? 'Operations centre' : 'PotholeVision';
}));

$('#image-file').addEventListener('change', event => { $('#file-label').textContent = event.target.files[0]?.name || 'Choose an image'; });
$('#detect-button').addEventListener('click', async () => {
  const file = $('#image-file').files[0]; if (!file) return toast('Choose an image first.');
  const form = new FormData(); form.append('file', file); const result = $('#detection-result'); result.innerHTML = '<h3>Analysing image</h3><p>Running the road image through the detection model.</p>';
  try { const data = await api('/ai/detect', { method: 'POST', body: form }); result.innerHTML = `<span class="empty-mark">${data.detections_count}</span><h3>${data.detections_count} detection${data.detections_count === 1 ? '' : 's'}</h3><p>${data.detections.length ? data.detections.map(d => `${d.class} (${Math.round(d.confidence * 100)}%)`).join(', ') : 'No potholes found in this image.'}</p>`; } catch (error) { result.innerHTML = `<h3>Detection failed</h3><p>${error.message}</p>`; }
});

$('#open-auth').addEventListener('click', () => { if (state.user) { state.token = null; state.user = null; localStorage.removeItem('pv_token'); localStorage.removeItem('pv_user'); setUser(); toast('Signed out'); } else $('#auth-dialog').showModal(); });
$('#auth-form').addEventListener('submit', async event => { event.preventDefault(); $('#auth-message').textContent = ''; try { const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: $('#auth-email').value, password: $('#auth-password').value }) }); state.token = data.access_token; state.user = data.user; localStorage.setItem('pv_token', state.token); localStorage.setItem('pv_user', JSON.stringify(state.user)); $('#auth-dialog').close(); setUser(); toast('Signed in'); refresh(); } catch (error) { $('#auth-message').textContent = error.message; } });
$('#register-button').addEventListener('click', async () => { const email = $('#auth-email').value, password = $('#auth-password').value; if (!email || !password) return $('#auth-message').textContent = 'Enter your email and password first.'; try { await api('/auth/register', { method: 'POST', body: JSON.stringify({ name: email.split('@')[0], email, password }) }); $('#auth-message').textContent = 'Account created. You can now sign in.'; } catch (error) { $('#auth-message').textContent = error.message; } });

const forms = {
  pothole: { title: 'Add pothole report', fields: '<label>Latitude<input name="latitude" type="number" step="any" required></label><label>Longitude<input name="longitude" type="number" step="any" required></label><label>Severity<select name="severity"><option>medium</option><option>low</option><option>high</option><option>critical</option></select></label>', endpoint: '/potholes' },
  contractor: { title: 'Add contractor', fields: '<label>Name<input name="name" required></label><label>Company<input name="company" required></label><label>Email<input name="email" type="email"></label><label>Phone<input name="phone"></label>', endpoint: '/contractors' },
  order: { title: 'Create work order', fields: '<label>Pothole ID<input name="pothole_id" type="number" required></label><label>Contractor ID<input name="contractor_id" type="number"></label><label>Priority<select name="priority"><option>medium</option><option>low</option><option>high</option><option>critical</option></select></label>', endpoint: '/work-orders' }
};
let activeForm;
function openForm(type) { if (!state.token) return $('#auth-dialog').showModal(); activeForm = forms[type]; $('#form-title').textContent = activeForm.title; $('#form-fields').innerHTML = activeForm.fields; $('#create-message').textContent = ''; $('#create-dialog').showModal(); }
$('#new-pothole').addEventListener('click', () => openForm('pothole')); $('#new-contractor').addEventListener('click', () => openForm('contractor')); $('#new-order').addEventListener('click', () => openForm('order'));
$('#create-form').addEventListener('submit', async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.target).entries()); Object.keys(data).forEach(key => { if (data[key] === '') data[key] = null; if (['latitude','longitude','pothole_id','contractor_id'].includes(key) && data[key] !== null) data[key] = Number(data[key]); }); try { await api(activeForm.endpoint, { method: 'POST', body: JSON.stringify(data) }); $('#create-dialog').close(); toast('Saved successfully'); refresh(); } catch (error) { $('#create-message').textContent = error.message; } });

setUser(); refresh();
