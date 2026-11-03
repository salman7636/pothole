import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import {

  Activity, ArrowRight, BarChart3, Bell, Camera, Check, ChevronDown,

  ClipboardList, Clock3, FileText, Info, KeyRound, LayoutDashboard, LogOut,

  MapPin, MapPinned, MessageCircle, Monitor, Moon, Plus, Search, Settings,

  Send, ShieldCheck, Star, Sun, TriangleAlert, Upload, UserRound, Wrench, X, Pencil,

} from 'lucide-react';

import './style.css';
import './citizen.css';
import './visual-refresh.css';
import './mobile-ux.css';



const API_ORIGIN = 'https://potholevision.onrender.com';

const API = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '' : API_ORIGIN)).replace(/\/$/, '');

const API_DOCS = `${API || API_ORIGIN}/docs`;

const MAP_TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

const pageItems = [

  { id: 'home', label: 'Home', icon: LayoutDashboard, citizenOnly: true },

  { id: 'overview', label: 'Overview', icon: LayoutDashboard, adminOnly: true },

  { id: 'reports', label: 'Road reports', icon: FileText },

  { id: 'detect', label: 'AI detection', icon: Camera },

  { id: 'map', label: 'Live map', icon: MapPinned },

  { id: 'progress', label: 'Repair progress', icon: Activity },
  { id: 'messages', label: 'Messages', icon: MessageCircle, adminOnly: true },

  { id: 'analytics', label: 'Analytics', icon: BarChart3, adminOnly: true },

  { id: 'complaints', label: 'Your complaints', icon: ClipboardList },

  { id: 'inspections', label: 'Inspections', icon: Search, adminOnly: true },

  { id: 'work-orders', label: 'Repairs', icon: Wrench, adminOnly: true },

  { id: 'settings', label: 'Settings', icon: Settings },

  { id: 'about', label: 'About us', icon: Info },

];

const severityOptions = ['low', 'medium', 'high', 'critical'];

const statusOptions = ['reported', 'under_review', 'inspection_scheduled', 'inspection_completed', 'repair_required', 'work_order_created', 'in_progress', 'resolved', 'rejected', 'duplicate'];

const statusLabels = { reported: 'Reported', under_review: 'In review', inspection_scheduled: 'Scheduled', inspection_completed: 'Inspected', repair_required: 'Repair required', work_order_created: 'Assigned', in_progress: 'In progress', resolved: 'Resolved', rejected: 'Rejected', duplicate: 'Duplicate' };

const googleMapsUrl = point => point?.latitude != null && point?.longitude != null ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${point.latitude},${point.longitude}`)}` : null;



async function request(path, options = {}) {

  const token = sessionStorage.getItem('pv_token');

  const headers = new Headers(options.headers || {});

  if (token) headers.set('Authorization', `Bearer ${token}`);

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  let response;

  try { response = await fetch(`${API}${path}`, { ...options, headers }); }

  catch { throw new Error(`Could not reach ${API || API_ORIGIN}. Start the backend and check the API URL.`); }

  const text = await response.text();

  let data = {};

  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }

  if (!response.ok) {

    const detail = Array.isArray(data.detail) ? data.detail.map(item => item.msg || JSON.stringify(item)).join('; ') : data.detail;

    throw new Error(`${data.message || detail || 'Request failed'} (HTTP ${response.status} · ${path})`);

  }

  return data;

}



function Brand({ light = false, showName = false }) { return <div className={`brand ${light ? 'brand-light' : ''}`}><img className="brand-logo" src="/potholevision-logo.png" alt="PotholeVision logo"/><span className={`brand-wordmark ${showName ? 'show-name' : ''}`}>Pothole<span className="brand-accent">Vision</span><small>ROAD INTELLIGENCE</small></span></div>; }

async function readPhotoGps(file) {

  if(!file?.type?.startsWith('image/'))return null;

  try {

    const buffer=await file.arrayBuffer();const bytes=new Uint8Array(buffer);const view=new DataView(buffer);

    if(bytes[0]!==0xff||bytes[1]!==0xd8)return null;

    let offset=2,tiff=null;

    while(offset+4<bytes.length){if(bytes[offset]!==0xff)break;const marker=bytes[offset+1];offset+=2;if(marker===0xd9||marker===0xda)break;const length=view.getUint16(offset,false);if(length<2||offset+length>bytes.length)break;const payload=offset+2;if(marker===0xe1&&bytes[payload]===0x45&&bytes[payload+1]===0x78&&bytes[payload+2]===0x69&&bytes[payload+3]===0x66&&bytes[payload+4]===0&&bytes[payload+5]===0){tiff=payload+6;break;}offset+=length;}

    if(tiff==null)return null;

    const little=bytes[tiff]===0x49&&bytes[tiff+1]===0x49;if(!little&&!(bytes[tiff]===0x4d&&bytes[tiff+1]===0x4d))return null;

    const u16=pos=>view.getUint16(pos,little),u32=pos=>view.getUint32(pos,little);if(u16(tiff+2)!==42)return null;

    const ifd0=tiff+u32(tiff+4);if(ifd0+2>bytes.length)return null;let gpsOffset=null;

    for(let i=0;i<u16(ifd0);i++){const entry=ifd0+2+i*12;if(entry+12>bytes.length)break;if(u16(entry)===0x8825)gpsOffset=tiff+u32(entry+8);}

    if(gpsOffset==null||gpsOffset+2>bytes.length)return null;

    const tags=new Map();

    for(let i=0;i<u16(gpsOffset);i++){

      const entry=gpsOffset+2+i*12;if(entry+12>bytes.length)break;

      const tag=u16(entry),type=u16(entry+2),count=u32(entry+4),dataBytes=count*(type===2?1:type===5?8:0);if(!dataBytes||count>16)continue;

      const data=dataBytes<=4?entry+8:tiff+u32(entry+8);if(data<0||data+dataBytes>bytes.length)continue;

      if(type===2){let value='';for(let j=0;j<count;j++)value+=String.fromCharCode(bytes[data+j]);tags.set(tag,value.replace(/\0/g,'').trim());}

      if(type===5){const values=[];for(let j=0;j<count;j++){const numerator=u32(data+j*8),denominator=u32(data+j*8+4);values.push(denominator?numerator/denominator:0);}tags.set(tag,values);}

    }

    const lat=tags.get(2),lon=tags.get(4);if(!Array.isArray(lat)||lat.length<3||!Array.isArray(lon)||lon.length<3)return null;

    const decimal=value=>value[0]+value[1]/60+value[2]/3600;let latitude=decimal(lat),longitude=decimal(lon);

    if((tags.get(1)||'').toUpperCase().startsWith('S'))latitude=-latitude;if((tags.get(3)||'').toUpperCase().startsWith('W'))longitude=-longitude;

    return Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180?{latitude,longitude}:null;

  } catch { return null; }

}



function Login({ onLogin }) {

  const [mode, setMode] = useState('login'); const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [showPassword, setShowPassword] = useState(false);

  async function submit(event) {

    event.preventDefault(); setBusy(true); setError('');

    const registering = mode === 'register'; const path = registering ? '/auth/register' : '/auth/login';

    try {

      const data = await request(path, { method: 'POST', body: JSON.stringify(registering ? { name, email, password } : { email, password }) });

      const token = data.access_token || data.token || data.accessToken;

      if (token) sessionStorage.setItem('pv_token', token);

      sessionStorage.setItem('pv_dashboard_mode', 'citizen');

      const authenticatedUser = data.user || { name, email };

      sessionStorage.setItem('pv_user', JSON.stringify(authenticatedUser)); onLogin(authenticatedUser);

    } catch (err) { setError(err.message.includes('HTTP 401') ? 'Email or password is incorrect. If you are new, create an account first.' : err.message); }

    finally { setBusy(false); }

  }

  const registering = mode === 'register';

  return <main className="login-page"><section className="login-visual"><div className="visual-top"><Brand light/><span className="live-pill"><i/> ROAD SAFETY PORTAL</span></div><div className="visual-copy"><div className="eyebrow"><span/> SAFER STREETS START WITH YOU</div><h1>Every road.<br/>A little <em>safer.</em></h1><p>Report road hazards, review live detections, and help your community plan safer repairs.</p><div className="visual-stats"><div><b>AI powered</b><span>YOLO pothole detection</span></div><div className="stat-divider"/><div><b>Live data</b><span>Reports from your backend</span></div></div></div><div className="road-art" aria-hidden="true"><div className="road-glow"/><div className="road-line"/><div className="road-dash"/><span className="pin pin-one"><MapPin size={17}/></span><span className="pin pin-two"><MapPin size={17}/></span><span className="pin pin-three"><MapPin size={17}/></span></div><div className="visual-foot"><span>BUILT FOR BETTER CITIES</span><span>01 â€” 04</span></div></section><section className="login-panel"><div className="mobile-brand"><Brand showName/></div><div className="login-card"><div className="login-heading"><div className="login-icon"><ShieldCheck size={21}/></div><div className="eyebrow dark-eyebrow">POTHOLEVISION USER PORTAL</div><h2>{registering ? 'Create your account' : 'Welcome back'}</h2><p>{registering ? 'Join your community and report road hazards.' : 'Sign in to your road safety dashboard.'}</p></div><form onSubmit={submit}>{registering&&<><label htmlFor="name">Your name</label><div className="input-wrap"><input id="name" autoComplete="name" placeholder="Full name" value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={150} required/></div></>}<label htmlFor="email">Email address</label><div className="input-wrap"><span className="input-icon">@</span><input id="email" type="email" autoComplete="username" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} minLength={5} maxLength={255} required/></div><div className="password-label"><label htmlFor="password">Password</label></div><div className="input-wrap"><span className="input-icon lock"><KeyRound size={15}/></span><input id="password" type={showPassword?'text':'password'} autoComplete={registering?'new-password':'current-password'} placeholder={registering?'Create a password':'Enter your password'} value={password} onChange={e=>setPassword(e.target.value)} minLength={8} maxLength={72} required/><button className="show-password" type="button" onClick={()=>setShowPassword(!showPassword)}>{showPassword?'Hide':'Show'}</button></div>{error&&<div className={error.startsWith('Account created')?'form-success':'form-error'} role="status">{error.startsWith('Account created')?<Check size={16}/>:<TriangleAlert size={16}/>} {error}</div>}<button className="sign-in" disabled={busy}>{busy?(registering?'Creating accountâ€¦':'Signing inâ€¦'):<>{registering?'Create account':'Sign in'} <ArrowRight size={17}/></>}</button></form><div className="login-note"><ShieldCheck size={16}/> Your account and reports are protected.</div><div className="login-help">{registering?'Already have an account?':'New to PotholeVision?'} <button className="mode-switch" onClick={()=>{setMode(registering?'login':'register');setError('')}}>{registering?'Sign in':'Create an account'} <ArrowRight size={13}/></button></div></div><div className="login-legal"><span>Â© 2026 PotholeVision</span><span><Info size={14}/> Help center</span></div></section></main>;

}



function Dashboard({ user, onLogout, onUserUpdate, theme, themePreference, onThemeChange }) {

  const isCitizenMode = sessionStorage.getItem('pv_dashboard_mode') === 'citizen';

  const isAdmin = !isCitizenMode && ['ADMIN', 'AUTHORITY'].includes(String(user?.role || '').toUpperCase());

  const [view, setView] = useState(isAdmin ? 'overview' : 'home'); const [menu, setMenu] = useState(false); const [menuAnchor, setMenuAnchor] = useState('side'); const [notificationOpen, setNotificationOpen] = useState(false); const [officialModal, setOfficialModal] = useState(false); const [officialCode, setOfficialCode] = useState(''); const [citizenSwitchModal, setCitizenSwitchModal] = useState(false); const [citizenSwitchEmail, setCitizenSwitchEmail] = useState(user?.email||''); const [citizenSwitchPassword, setCitizenSwitchPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');

  const [activityAlerts, setActivityAlerts] = useState(() => localStorage.getItem('pv_activity_alerts') !== 'off');
  const [profilePhoto, setProfilePhoto] = useState('');
  const profilePhotoKey = `pv_profile_photo:${String(user?.email || 'local').toLowerCase()}`;

  

  const [summary, setSummary] = useState(null); const [reports, setReports] = useState([]); const [analytics, setAnalytics] = useState(null); const [mapPoints, setMapPoints] = useState([]); const [progressReports,setProgressReports]=useState([]); const [mapSummary, setMapSummary] = useState({ total: 0, open: 0, repairing: 0, resolved: 0, completion_percent: 0 }); const [mapUpdatedAt, setMapUpdatedAt] = useState(null); const [progressUpdates,setProgressUpdates]=useState([]); const [complaints, setComplaints] = useState([]); const [inspections, setInspections] = useState([]); const [workOrders, setWorkOrders] = useState([]); const [detection, setDetection] = useState(null); const [preview, setPreview] = useState(''); const [pendingCapture,setPendingCapture]=useState(null); const [analysisCoordinates,setAnalysisCoordinates]=useState(null); const [importing, setImporting] = useState(false); const [cameraActive,setCameraActive]=useState(false); const [cameraStream,setCameraStream]=useState(null); const cameraVideoRef=useRef(null); const cameraFallbackRef=useRef(null);

  const visiblePages = isAdmin ? pageItems.filter(item => ['overview','reports','map','analytics','complaints','inspections','work-orders','messages','settings'].includes(item.id)) : pageItems.filter(item => !item.adminOnly);

  const name = (user?.name || user?.email?.split('@')[0] || 'Operator').split(/[ ._-]/)[0];

  useEffect(() => { setProfilePhoto(localStorage.getItem(profilePhotoKey) || ''); }, [profilePhotoKey]);

  async function loadPage(page = view) {

    setBusy(true); setError('');

    try {

      if (page === 'overview' && isAdmin) { const [s, r, c, m, ms, pu] = await Promise.all([request('/dashboard/summary'), request('/potholes'), request('/complaints'), request('/map/potholes'), request('/map/summary'), request('/progress/updates')]); setSummary(s); setReports(Array.isArray(r) ? r : []); setComplaints(Array.isArray(c) ? c : []); setMapPoints(Array.isArray(m) ? m : []); setMapSummary(ms); setProgressUpdates(Array.isArray(pu)?pu:[]); setMapUpdatedAt(new Date()); }

      if (page === 'home' && !isAdmin) { const [m, ms, c] = await Promise.all([request('/map/potholes'), request('/map/summary'), request('/complaints/mine')]); setMapPoints(Array.isArray(m) ? m : []); setMapSummary(ms); setComplaints(Array.isArray(c) ? c : []); setMapUpdatedAt(new Date()); }

      if (page === 'reports' && isAdmin) { const r = await request('/potholes'); setReports(Array.isArray(r) ? r : []); }

      if (page === 'map') { const [p, ms] = await Promise.all([request('/map/potholes'), request('/map/summary')]); setMapPoints(Array.isArray(p) ? p : []); setMapSummary(ms); setMapUpdatedAt(new Date()); }

      if (page === 'progress') { const [p, ms, pu] = await Promise.all([request('/progress/reports'), request('/progress/summary'), request('/progress/updates')]); setProgressReports(Array.isArray(p) ? p : []); setMapSummary(ms); setProgressUpdates(Array.isArray(pu)?pu:[]); setMapUpdatedAt(new Date()); }

      if (page === 'analytics') setAnalytics(await request('/analytics'));

      if (page === 'complaints') { const c = await request(isAdmin ? '/complaints' : '/complaints/mine'); setComplaints(Array.isArray(c) ? c : []); }

      if (page === 'inspections') { const i = await request('/inspections'); setInspections(Array.isArray(i) ? i : []); }

      if (page === 'work-orders') { const [w, r, pu] = await Promise.all([request('/work-orders'), request('/potholes'), request('/progress/updates')]); setWorkOrders(Array.isArray(w) ? w : []); setReports(Array.isArray(r) ? r : []); setProgressUpdates(Array.isArray(pu) ? pu : []); }

    } catch (err) { setError(err.message); }

    finally { setBusy(false); }

  }

  useEffect(() => { loadPage(view); }, [view]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  useEffect(() => { if(cameraVideoRef.current&&cameraStream) cameraVideoRef.current.srcObject=cameraStream; return () => { if(cameraStream) cameraStream.getTracks().forEach(track=>track.stop()); }; }, [cameraStream]);

  useEffect(() => { if (isAdmin) setView('overview'); }, [isAdmin]);

  useEffect(() => { if(view!=='detect'&&cameraActive)closeRoadCamera(); }, [view,cameraActive]);

  useEffect(() => {

    const refreshMs = ['overview', 'map', 'progress'].includes(view) ? 10000 : 30000;

    const timer = window.setInterval(() => {

      if (document.visibilityState === 'visible' && ['home','overview','map','progress','reports','complaints','inspections','work-orders'].includes(view)) loadPage(view);

    }, refreshMs);

    return () => window.clearInterval(timer);

  }, [view, isAdmin]);

  function go(page) { if (!isAdmin && ['overview','analytics','inspections','work-orders'].includes(page)) return; setView(page); setError(''); setNotice(''); }

  function toggleProfileMenu(anchor) {

    setNotificationOpen(false);

    if (menu && menuAnchor === anchor) setMenu(false);

    else { setMenuAnchor(anchor); setMenu(true); }

  }

  function handleProfilePhotoChange(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Choose an image file for your profile photo.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Profile photos must be 5 MB or smaller.'); return; }
    const image = new Image(); const source = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(1, 512 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(source);
      try { const photo = canvas.toDataURL('image/jpeg', 0.84); localStorage.setItem(profilePhotoKey, photo); setProfilePhoto(photo); setNotice('Profile photo updated.'); }
      catch { setError('Could not save this photo in the browser. Choose a smaller image and try again.'); }
    };
    image.onerror = () => { URL.revokeObjectURL(source); setError('Could not open that image. Choose another photo.'); };
    image.src = source;
  }

  function removeProfilePhoto() { localStorage.removeItem(profilePhotoKey); setProfilePhoto(''); setNotice('Profile photo removed.'); }

  function openOfficialDashboard() {

    setMenu(false);

    if (isAdmin) go('overview');

    else {

      const token=sessionStorage.getItem('pv_official_token');

      const savedUser=sessionStorage.getItem('pv_official_user');

      if(token&&savedUser){sessionStorage.setItem('pv_token',token);sessionStorage.setItem('pv_user',savedUser);sessionStorage.setItem('pv_dashboard_mode','official');onUserUpdate(JSON.parse(savedUser));setView('overview');setError('');setNotice('Switched to the official dashboard.');}

      else { setError(''); setOfficialModal(true); }

    }

  }

  function switchToCitizenDashboard() {

    const token=sessionStorage.getItem('pv_citizen_token');

    const savedUser=sessionStorage.getItem('pv_citizen_user');

    if(!token||!savedUser){setMenu(false);setError('');setCitizenSwitchEmail(user?.email||'');setCitizenSwitchPassword('');setCitizenSwitchModal(true);return;}

    let citizenUser;

    try { citizenUser=JSON.parse(savedUser); } catch { citizenUser={email:user?.email,name:user?.name}; }

    citizenUser={...citizenUser,role:'CITIZEN'};

    sessionStorage.setItem('pv_citizen_user',JSON.stringify(citizenUser));

    sessionStorage.setItem('pv_token',token);

    sessionStorage.setItem('pv_user',JSON.stringify(citizenUser));

    sessionStorage.setItem('pv_dashboard_mode','citizen');

    onUserUpdate(citizenUser);

    setView('home');setMenu(false);setError('');setNotice('Switched to the citizen dashboard.');

  }

  async function reauthenticateCitizen(event) {

    event.preventDefault();setBusy(true);setError('');

    try {

      const data=await request('/auth/login',{method:'POST',body:JSON.stringify({email:citizenSwitchEmail,password:citizenSwitchPassword})});

      const token=data.access_token||data.token||data.accessToken;

      const citizenUser={...(data.user||{email:citizenSwitchEmail}),role:'CITIZEN'};

      if(!token)throw new Error('The backend did not return a citizen sign-in session.');

      sessionStorage.setItem('pv_official_token',sessionStorage.getItem('pv_token')||'');

      sessionStorage.setItem('pv_official_user',sessionStorage.getItem('pv_user')||JSON.stringify(user));

      sessionStorage.setItem('pv_citizen_token',token);sessionStorage.setItem('pv_citizen_user',JSON.stringify(citizenUser));

      sessionStorage.setItem('pv_token',token);sessionStorage.setItem('pv_user',JSON.stringify(citizenUser));

      sessionStorage.setItem('pv_dashboard_mode','citizen');

      onUserUpdate(citizenUser);setCitizenSwitchModal(false);setCitizenSwitchPassword('');setView('home');setNotice('Signed in to the citizen dashboard. Your official session is still available from the profile menu.');

    } catch(err) {setError(err.message.includes('HTTP 401')?'Email or password is incorrect. Please use the same credentials as your citizen account.':err.message);}

    finally {setBusy(false);}

  }

  async function verifyOfficialAccess(event) {

    event.preventDefault(); setBusy(true); setError('');

    try {

      const submittedCode = officialCode.trim().replace(/^UID-/i, '');
      const data = await request('/auth/official-access', { method: 'POST', body: JSON.stringify({ code: submittedCode }) });

      if (!isAdmin) {

        sessionStorage.setItem('pv_citizen_token',sessionStorage.getItem('pv_token')||'');

        sessionStorage.setItem('pv_citizen_user',sessionStorage.getItem('pv_user')||JSON.stringify(user));

      }

      sessionStorage.setItem('pv_official_token',data.access_token);sessionStorage.setItem('pv_official_user',JSON.stringify(data.user));

      sessionStorage.setItem('pv_token', data.access_token); sessionStorage.setItem('pv_user', JSON.stringify(data.user));

      sessionStorage.setItem('pv_dashboard_mode','official');

      onUserUpdate(data.user); setOfficialModal(false); setMenu(false); setOfficialCode(''); setView('overview');

      setNotice('Official access verified. Operations records are available in this dashboard.');

    } catch (err) { setError((err.message.includes('HTTP 403') && err.message.includes('/auth/official-access')) ? 'Access denied. Check that this signed-in email is allowed and the code matches the backend official access settings.' : err.message); }

    finally { setBusy(false); }

  }

  async function openRoadCamera() {

    setError('');

    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){setNotice('Opening your device camera. If browser GPS is blocked, enable location tags in your camera app.');cameraFallbackRef.current?.click();return;}

    try { const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false}); setCameraStream(stream);setCameraActive(true); }

    catch(err){if(err.name==='NotAllowedError')setError('Camera permission was blocked. Allow camera access in your browser settings and try again.');else{setError(`Live camera unavailable${!window.isSecureContext?' on this HTTP address':''}. Opening your device camera instead.`);cameraFallbackRef.current?.click();}}

  }

  function handleNativeCameraCapture(event){const file=event.target.files?.[0];event.target.value='';if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setError('Choose a JPG, PNG, or WEBP road photo.');return;}if(file.size>15*1024*1024){setError('Road photos must be 15 MB or smaller.');return;}setError('');setNotice('Analyzing the selected road image...');setDetection(null);setAnalysisCoordinates(null);setPendingCapture(file);setPreview(URL.createObjectURL(file));uploadMedia(file,true);}

  function closeRoadCamera(){ if(cameraStream)cameraStream.getTracks().forEach(track=>track.stop());setCameraStream(null);setCameraActive(false); }

  function captureRoadPhoto(){

    const video=cameraVideoRef.current;if(!video||!video.videoWidth){setError('Wait for the camera preview to become ready, then capture again.');return;}

    const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);

    canvas.toBlob(blob=>{if(!blob){setError('Could not capture the camera image. Try again.');return;}const file=new File([blob],`road-capture-${Date.now()}.jpg`,{type:'image/jpeg'});setError('');setNotice('Analyzing the captured road image...');setDetection(null);setAnalysisCoordinates(null);setPendingCapture(file);setPreview(URL.createObjectURL(file));closeRoadCamera();uploadMedia(file,true);},'image/jpeg',0.92);

  }

  async function uploadMedia(file, analysisOnly = false) {

    if (!file) return;

    setBusy(true); setError(''); if(analysisOnly)setDetection(null);

    try {

      const form = new FormData(); form.append('file', file);

      let coordinates = analysisOnly ? null : analysisCoordinates;

      // Prefer the photo's embedded capture location for gallery uploads; if
      // the image has no GPS tags, use this device's current GPS position.
      if(!coordinates)coordinates=await readPhotoGps(file);

      if(window.isSecureContext&&navigator.geolocation){

        try { if(!coordinates){const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(value=>resolve(value.coords),error=>reject(error),{enableHighAccuracy:true,timeout:12000,maximumAge:0}));coordinates={latitude:position.latitude,longitude:position.longitude};} }

        catch { /* Keep embedded photo GPS if browser location is unavailable. */ }

      }

      setAnalysisCoordinates(coordinates);

      const params = new URLSearchParams({ submit: String(!analysisOnly) });

      if(coordinates){params.set('latitude',String(coordinates.latitude));params.set('longitude',String(coordinates.longitude));}

      const path = '/detect/image';

      const result = await request(`${path}?${params}`, { method: 'POST', body: form });

      if(analysisOnly){setDetection({...result,analysis_only:true});setNotice(result.potholes_detected?`Analysis complete: ${result.potholes_detected} pothole(s) found. Review the image, then submit the report.`:'Analysis complete: no potholes detected. Capture another road image.');return;}

      setDetection(result); setPendingCapture(null); setNotice('');

      const caseNumbers=(result.saved_potholes||[]).map(item=>item.case_number).filter(Boolean);

      setNotice(`${result.database_records_created ?? 0} pothole report(s) submitted${coordinates?' with GPS location':' without GPS; officials will see that the location is unavailable'}${caseNumbers.length?`. Case ID${caseNumbers.length===1?'':'s'}: ${caseNumbers.slice(0,3).join(', ')}${caseNumbers.length>3?`, +${caseNumbers.length-3} more`:''}`:''}.`);

      if (isAdmin) { const updated = await request('/potholes'); setReports(Array.isArray(updated) ? updated : []); }

      else { const [allReports, progressStatus, myComplaints] = await Promise.all([request('/progress/reports'), request('/progress/summary'), request('/complaints/mine')]); setProgressReports(Array.isArray(allReports) ? allReports : []); setMapSummary(progressStatus); setComplaints(Array.isArray(myComplaints)?myComplaints:[]); setMapUpdatedAt(new Date()); }

    } catch (err) { setError(err.message); }

    finally { setBusy(false); }

  }

  async function createReport(event) {

    event.preventDefault(); const formElement = event.currentTarget; const f = new FormData(formElement); const query = new URLSearchParams({ latitude: f.get('latitude'), longitude: f.get('longitude'), severity: f.get('severity'), description: f.get('description') });

    setBusy(true); setError('');

    try { const result = await request(`/potholes?${query}`, { method: 'POST' }); formElement.reset(); setNotice(result.duplicate ? `A nearby report already exists as PV-${result.pothole_id}. We linked you to that case.` : `Road report PV-${result.pothole_id} was created and is visible on the community map.`); await loadPage(isAdmin ? 'reports' : 'map'); }

    catch (err) { setError(err.message); } finally { setBusy(false); }

  }

  async function submitCitizenComplaint(event) {

    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); const description = String(form.get('description') || '').trim(); const linkedReport = String(form.get('pothole_id') || '').trim();

    setBusy(true); setError(''); setNotice('');

    try {
      const result = await request('/complaints', { method: 'POST', body: JSON.stringify({ description, pothole_id: linkedReport ? Number(linkedReport) : null }) });
      formElement.reset(); setNotice(`Complaint ${result.case_number || ''} submitted to the road authority.`.trim());
      const updated = await request('/complaints/mine'); setComplaints(Array.isArray(updated) ? updated : []);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }

  }

  async function importReportFile(file) {

    if (!file) return;

    let processed = 0;

    setImporting(true); setError(''); setNotice('');

    try {

      const rows = parseReportCsv(await file.text());

      if (!rows.length) throw new Error('The CSV has no data rows. Add rows beneath the header and try again.');

      if (rows.length > 500) throw new Error('Import is limited to 500 rows per file. Split the CSV into smaller files.');

      rows.forEach((row,index)=>{

        if (!Number.isFinite(row.latitude) || row.latitude < -90 || row.latitude > 90 || !Number.isFinite(row.longitude) || row.longitude < -180 || row.longitude > 180) throw new Error(`Row ${index + 2}: latitude or longitude is invalid.`);

        if (!severityOptions.includes(row.severity)) throw new Error(`Row ${index + 2}: severity must be low, medium, high, or critical.`);

      });

      let imported = 0; let duplicates = 0;

      for (let index = 0; index < rows.length; index++) {

        const row = rows[index];

        const query = new URLSearchParams({ latitude: String(row.latitude), longitude: String(row.longitude), severity: row.severity, description: row.description });

        const result = await request(`/potholes?${query}`, { method: 'POST' });

        processed++;

        if (result.duplicate) duplicates++;

        else imported++;

      }

      setNotice(`Import complete: ${imported} report(s) added${duplicates ? `, ${duplicates} nearby duplicate(s) skipped` : ''}.`);

      await loadPage('overview');

    } catch (err) {

      if (processed) await loadPage('overview');

      setError(processed ? `Import stopped after ${processed} row(s) reached the backend. ${err.message}` : err.message);

    }

    finally { setImporting(false); }

  }

  async function updateStatus(resource, id, status) {

    setBusy(true); setError('');

    try { await request(`/${resource}/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }); setNotice('Status updated.'); await loadPage(); }

    catch (err) { setError(err.message); } finally { setBusy(false); }

  }

  async function createJson(event, path, after) {

    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); const body = Object.fromEntries(form.entries());

    for (const key of ['pothole_id','complaint_id','inspection_id','estimated_cost']) if (body[key] === '') delete body[key]; else if (body[key] !== undefined) body[key] = Number(body[key]);

    if (!body.scheduled_date) delete body.scheduled_date;

    setBusy(true); setError('');

    try { await request(path, { method: 'POST', body: JSON.stringify(body) }); formElement.reset(); setNotice('Saved successfully.'); await loadPage(after); }

    catch (err) { setError(err.message); } finally { setBusy(false); }

  }

  async function publishProgress(event) {

    event.preventDefault(); const formElement=event.currentTarget; const form=new FormData(formElement);

    const body={pothole_id:Number(form.get('pothole_id')),stage:String(form.get('stage')),progress_percent:Number(form.get('progress_percent')),message:String(form.get('message'))};

    setBusy(true);setError('');

    try { await request('/progress/updates',{method:'POST',body:JSON.stringify(body)});formElement.reset();setNotice(`Live repair update posted for report PV-${body.pothole_id}.`);await loadPage('work-orders'); }

    catch(err){setError(err.message)}finally{setBusy(false)}

  }

  async function editProgress(event, updateId) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const body = { stage: String(form.get('stage')), progress_percent: Number(form.get('progress_percent')), message: String(form.get('message')) };
    setBusy(true); setError('');
    try { await request(`/progress/updates/${updateId}`, { method: 'PUT', body: JSON.stringify(body) }); setNotice('Repair update edited and published to citizens.'); await loadPage('work-orders'); return true; }
    catch (err) { setError(err.message); return false; }
    finally { setBusy(false); }
  }

  function saveSetting(key, value, setter) { localStorage.setItem(key, value ? 'on' : 'off'); setter(value); }

  const title = view === 'overview' ? 'Official operations dashboard' : view === 'map' && !isAdmin ? 'Community pothole map' : view === 'home' && !isAdmin ? 'Community home' : view === 'reports' && isAdmin ? 'Official report register' : view === 'reports' && !isAdmin ? 'Submit a road report' : view === 'complaints' && isAdmin ? 'Complaint queue' : view === 'complaints' && !isAdmin ? 'Your complaints' : pageItems.find(item => item.id === view)?.label || 'Overview';

  const summaryPotholes = summary?.potholes || {};

  const activityItems = (isAdmin && reports.length ? reports : mapPoints).slice().sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,6);

  const renderProfileMenu = () => <div className={`profile-menu ${menuAnchor==='top'?'top-profile-menu':''}`}><div className="profile-menu-heading"><b>{user?.name||'Your account'}</b><small>{user?.email}</small></div><button type="button" onClick={()=>{go('settings');setMenu(false)}}><Settings size={15}/> Settings &amp; appearance</button>{isAdmin?<button type="button" onClick={switchToCitizenDashboard}><UserRound size={15}/> Switch to citizen dashboard</button>:<button type="button" onClick={openOfficialDashboard}><ShieldCheck size={15}/>{sessionStorage.getItem('pv_official_token')?' Switch to official dashboard':' Official dashboard'}</button>}{isAdmin&&<button type="button" onClick={()=>{go('map');setMenu(false)}}><MapPinned size={15}/> Community pothole map</button>}<button type="button" onClick={()=>{setMenu(false);onLogout()}}><LogOut size={15}/> Sign out</button></div>;

  return <div className="app-shell" data-theme={theme}><aside className="sidebar"><Brand light/><div className="workspace-label">{isAdmin?'OFFICIAL OPERATIONS':'PUBLIC COMMUNITY'}</div>{visiblePages.map(({ id, label, icon: Icon })=><button key={id} title={label} className={`nav-item ${view===id?'active':''}`} onClick={()=>go(id)}><Icon size={18}/>{id==='reports'?(isAdmin?'All reports':'Submit a report'):id==='map'?(isAdmin?'Live map':'Pothole map'):id==='complaints'?(isAdmin?'Complaint queue':'Your complaints'):label}{id==='reports'&&isAdmin&&<span className="nav-count">{reports.length}</span>}</button>)}<div className="side-spacer"/><div className="sidebar-weather"><div className="weather-icon">{isAdmin?<ShieldCheck size={20}/>:<UserRound size={20}/>}</div><div><b>{isAdmin?'OFFICIAL':'PUBLIC'} <span>{user?.role||'CITIZEN'}</span></b><small>{isAdmin?'Restricted operations access':'Community map and reporting'}</small></div></div><div className="profile-area"><button type="button" className="profile" aria-expanded={menu&&menuAnchor==='side'} onClick={()=>toggleProfileMenu('side')}><div className="avatar">{profilePhoto?<img src={profilePhoto} alt="Profile"/>:name[0].toUpperCase()}</div><div className="profile-text"><b>{name}</b><span>{isAdmin?'Authorized official':'Community member'}</span></div><ChevronDown size={16}/></button>{menu&&menuAnchor==='side'&&renderProfileMenu()}</div></aside>

    {citizenSwitchModal&&<div className="official-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget){setCitizenSwitchModal(false);setError('')}}}><section className="official-modal" role="dialog" aria-modal="true" aria-labelledby="citizen-switch-title"><button className="official-modal-close" type="button" onClick={()=>{setCitizenSwitchModal(false);setError('')}} aria-label="Close"><X size={17}/></button><div className="login-icon"><UserRound size={21}/></div><span className="eyebrow dark-eyebrow">CITIZEN ACCOUNT</span><h2 id="citizen-switch-title">Return to citizen dashboard</h2><p>Sign in with your citizen account. Your official session will stay available so you can switch back anytime.</p><form onSubmit={reauthenticateCitizen}><label htmlFor="citizen-switch-email">Email address</label><input id="citizen-switch-email" type="email" autoComplete="username" value={citizenSwitchEmail} onChange={event=>setCitizenSwitchEmail(event.target.value)} required/><label htmlFor="citizen-switch-password">Password</label><input id="citizen-switch-password" type="password" autoComplete="current-password" value={citizenSwitchPassword} onChange={event=>setCitizenSwitchPassword(event.target.value)} required/>{error&&<div className="form-error" role="alert"><TriangleAlert size={15}/>{error}</div>}<button className="primary-button" disabled={busy}>{busy?'Signing in...':'Sign in to citizen dashboard'} <ArrowRight size={15}/></button></form><small>Your password is sent to your backend for sign-in and is not saved in this browser session.</small></section></div>}

    {officialModal&&<div className="official-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setOfficialModal(false)}}><section className="official-modal" role="dialog" aria-modal="true" aria-labelledby="official-modal-title"><button className="official-modal-close" type="button" onClick={()=>setOfficialModal(false)} aria-label="Close"><X size={17}/></button><div className="login-icon"><ShieldCheck size={21}/></div><span className="eyebrow dark-eyebrow">AUTHORIZED STAFF ONLY</span><h2 id="official-modal-title">Open official dashboard</h2><p>Enter your official UID to continue. Your signed-in email must also be approved for official access.</p><form onSubmit={verifyOfficialAccess}><label htmlFor="official-code">Official UID</label><input id="official-code" type="password" autoComplete="new-password" autoCapitalize="characters" spellCheck="false" value={officialCode} onChange={event=>setOfficialCode(event.target.value)} minLength={6} maxLength={10} inputMode="text" pattern="([Uu][Ii][Dd]-)?[0-9]{6}" placeholder="Enter your 6-digit UID" required/>{error&&<div className="form-error" role="alert"><TriangleAlert size={15}/>{error}</div>}<button className="primary-button" disabled={busy}>{busy?'Verifyingâ€¦':'Verify and open dashboard'} <ArrowRight size={15}/></button></form><small>Access is verified by the backend for approved official accounts.</small></section></div>}

    <main className="main-area"><header className="topbar"><div className="mobile-top-brand"><Brand light showName/></div><div className="breadcrumb"><b>{title}</b></div><div className="top-actions"><span className="today">LIVE ROAD UPDATES</span><div className="notification-wrap"><button type="button" className="icon-button notification" aria-label="Recent road notifications" aria-expanded={notificationOpen} onClick={()=>{setMenu(false);setNotificationOpen(!notificationOpen)}}><Bell size={18}/>{activityAlerts&&activityItems.length>0&&<i/>}</button>{notificationOpen&&<section className="notification-panel" aria-label="Recent road activity"><div className="notification-panel-heading"><div><b>Recent road activity</b><small>Latest updates from the pothole map</small></div><button type="button" onClick={()=>{setNotificationOpen(false);go('map')}}>View map</button></div>{activityItems.length?activityItems.map(item=><article className="notification-item" key={item.id}><span className="notification-pin"><MapPin size={15}/></span><div><b>Report PV-{item.id}</b><small>{statusText(item.status)} Â· {item.latitude!=null&&item.longitude!=null?`${Number(item.latitude).toFixed(4)}, ${Number(item.longitude).toFixed(4)}`:'Location unavailable'}</small></div><time>{item.created_at?new Date(item.created_at).toLocaleDateString():''}</time></article>):<div className="notification-empty">No road reports yet. New map activity will appear here.</div>}</section>}</div><div className="top-profile-wrap"><button type="button" className="top-avatar" aria-label="Open profile options" aria-expanded={menu&&menuAnchor==='top'} onClick={()=>toggleProfileMenu('top')}>{profilePhoto?<img src={profilePhoto} alt="Profile"/>:name[0].toUpperCase()}</button>{menu&&menuAnchor==='top'&&renderProfileMenu()}</div></div></header>

      <div className="content"><section className={`welcome-row ${view==='map'&&!isAdmin?'home-welcome':''}`}><div><div className="eyebrow dark-eyebrow">{isAdmin?'OFFICIAL OPERATIONS':'PUBLIC COMMUNITY'} <span className="welcome-dot"/> {title.toUpperCase()}</div><h1>{view==='overview'?`Welcome, ${name}`:title}</h1><p>{isAdmin?(view==='overview'?'Reports, public complaints, inspections, and repair work in one operations workspace.':'Authorized road maintenance operations.'):view==='map'?'Explore public pothole locations and follow the repair progress in your area.':pageDescription(view)}</p></div>{isAdmin&&view==='overview'&&<button className="primary-button" onClick={()=>go('detect')}><Plus size={17}/> Run AI detection</button>}</section>

        {error&&<div className="feature-error"><TriangleAlert size={17}/><span>{error}</span><button onClick={()=>setError('')} aria-label="Dismiss"><X size={15}/></button></div>}{notice&&<div className="feature-success"><Check size={17}/>{notice}<button onClick={()=>setNotice('')} aria-label="Dismiss"><X size={15}/></button></div>}

        {view==='home'&&!isAdmin&&<CitizenHome name={name} summary={mapSummary} points={mapPoints} complaints={complaints} onGo={go}/>}

        {view==='overview'&&isAdmin&&<OfficialDashboard summary={summary} reports={reports} complaints={complaints} updatedAt={mapUpdatedAt} onStatus={updateStatus} busy={busy} onGo={go}/> }

        {view==='reports'&&<>{!isAdmin&&<form className="feature-form report-create" onSubmit={createReport}><h2><Plus size={18}/> Report a road hazard</h2><p className="privacy-copy">Your report location will appear on the public map. Detailed records and repair operations are visible to authorized officials only.</p><div className="form-grid"><label>Latitude<input name="latitude" type="number" step="any" min="-90" max="90" placeholder="12.9716" required/></label><label>Longitude<input name="longitude" type="number" step="any" min="-180" max="180" placeholder="77.5946" required/></label><label>Severity<select name="severity" defaultValue="medium">{severityOptions.map(s=><option key={s}>{s}</option>)}</select></label><label className="wide-field">Description<input name="description" placeholder="Describe the road hazard" /></label></div><div className="form-actions"><button className="primary-button" disabled={busy}>Save report <ArrowRight size={15}/></button><button type="button" className="secondary-button" onClick={()=>navigator.geolocation?.getCurrentPosition(p=>{document.querySelector('[name=latitude]').value=p.coords.latitude;document.querySelector('[name=longitude]').value=p.coords.longitude},()=>setError('Location permission was not available.'))}><MapPin size={15}/> Use my location</button></div></form>}{isAdmin&&<><section className="official-import-panel"><div><span className="eyebrow dark-eyebrow">RECORDS INTAKE</span><h2>Import road reports</h2><p>Load a CSV file into the official report register. Required columns: latitude, longitude, and severity. Description is optional.</p><a href="/templates/pothole-import-template.csv" download>Download CSV template <ArrowRight size={13}/></a></div><label className={`official-import-button ${importing?'is-importing':''}`}><input type="file" accept=".csv,text/csv" disabled={importing||busy} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)importReportFile(file)}}/><Upload size={17}/>{importing?'Importing records?':'Choose CSV file'}</label></section><div className="section-heading"><div><div className="eyebrow dark-eyebrow">OFFICIAL RECORDS</div><h2>All road reports <span className="count-pill">{reports.length}</span></h2></div></div><ReportTable rows={reports} onStatus={updateStatus} busy={busy} editable/></>}</>}

        {view==='detect'&&<section className="feature-panel detector-panel"><div className="detection-intro"><div className="detection-visual"><Camera size={24}/><span>AI</span></div><div><span className="eyebrow dark-eyebrow">ROAD SAFETY AI</span><h2>Analyze road media</h2><p>Capture a road photo or choose one from your device. JPG, PNG, or WEBP up to 15 MB. Review the result before submitting it to officials.</p></div></div>{cameraActive&&<div className="road-camera-panel"><video ref={cameraVideoRef} autoPlay playsInline muted aria-label="Live road camera preview"/><div className="road-camera-actions"><span><i/> Live camera &middot; GPS is requested when you capture</span><button type="button" className="secondary-button" onClick={closeRoadCamera}><X size={15}/> Cancel</button><button type="button" className="primary-button" onClick={captureRoadPhoto}><Camera size={16}/> Capture photo</button></div></div>}<input ref={cameraFallbackRef} className="native-camera-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleNativeCameraCapture} aria-label="Capture road photo with device camera"/><div className="camera-start-actions">{!cameraActive&&<><button type="button" className="primary-button" onClick={openRoadCamera} disabled={busy}><Camera size={16}/> Open camera</button><button type="button" className="secondary-button" onClick={()=>cameraFallbackRef.current?.click()} disabled={busy}><Upload size={15}/> Choose road photo</button></>}</div>{preview&&<div className="camera-captured-preview">{detection?.type==='image'&&detection.detections?.length?<AnnotatedImagePreview src={preview} detections={detection.detections}/>:<img src={preview} alt="Captured road image"/>}<div><b>{detection?.filename||'Captured road photo'}</b><small>{busy&&!detection?'Analyzing imageâ€¦':detection?.analysis_only?'AI analysis result':detection?'Report submitted':'Preparing image for analysis'}</small></div><button type="button" className="secondary-button" onClick={openRoadCamera} disabled={busy}><Camera size={15}/> Capture another</button></div>}{pendingCapture&&detection?.analysis_only&&detection.potholes_detected>0&&!cameraActive&&<button type="button" className="primary-button submit-report-3d submit-captured-report" onClick={()=>uploadMedia(pendingCapture)} disabled={busy}><ShieldCheck size={17}/>{busy?"Submitting report...":"Submit report"}</button>}<p className="gps-auto-note"><MapPin size={14}/> Uses device GPS when available, with camera photo GPS tags as a fallback. Enable location access or camera location tags so officials can find the pothole in Maps.</p>{detection&&<div className="result-card"><div><span className="eyebrow dark-eyebrow">ANALYSIS COMPLETE</span><h3>{detection.potholes_detected ?? detection.unique_potholes ?? 0} pothole(s) detected</h3><p>{detection.analysis_only?'Review the detected image, then submit the report when ready.':`${detection.database_records_created ?? 0} picture report(s) submitted for official review.`}</p></div></div>}{detection?.saved_potholes?.length>0&&<><div className="detection-results">{detection.saved_potholes.map((item,i)=><div key={item.pothole_id||i}><span>{item.case_number||`PV-${item.pothole_id}`}</span><b>{item.detections_count||1} detection(s) Â· {item.severity}</b><span>{Math.round((item.confidence||0)*100)}% confidence</span></div>)}</div>{!isAdmin&&<button type="button" className="primary-button scan-cases-link" onClick={()=>go('progress')}><Activity size={15}/> Track live repair progress <ArrowRight size={14}/></button>}</>}</section>}

        {view==='map'&&<>
          <section className="map-status-board">
            <div className="map-status-heading"><div><span className="eyebrow dark-eyebrow">COMMUNITY ROAD STATUS</span><h2>Live pothole map</h2><p>GPS-tagged reports and official repair changes refresh automatically.</p></div><span className="map-live-badge"><i/> LIVE <small>Updates every 10 sec</small></span></div>
            <div className="map-status-cards">
              <article className="map-status-card"><span className="map-status-icon active-status"><MapPin size={18}/></span><div><small>Awaiting repair</small><b>{mapSummary.open}</b></div></article>
              <article className="map-status-card"><span className="map-status-icon repair-status"><Wrench size={18}/></span><div><small>Being repaired</small><b>{mapSummary.repairing}</b></div></article>
              <article className="map-status-card progress-status-card"><span className="map-status-icon done-status"><Check size={18}/></span><div className="progress-stat-copy"><small>Repairs completed</small><b>{mapSummary.resolved}</b><div className="map-progress-track"><i style={{width:`${mapSummary.completion_percent}%`}}/></div><span>{mapSummary.completion_percent}% Â· {mapSummary.resolved} of {mapSummary.total} GPS reports resolved</span></div></article>
            </div>
          </section>
          <section className="feature-panel live-map-panel"><div className="panel-title"><div className="feature-icon"><MapPinned size={20}/></div><div><h2>Nearby road reports</h2><p>Red pins need attention, amber pins are being repaired, and green pins are complete. Select a pin to see its case and open the location in Google Maps.</p></div></div><LiveMap points={mapPoints}/><div className="map-updated-at">{mapUpdatedAt?`Last updated ${mapUpdatedAt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}`:'Loading latest road reportsâ€¦'} Â· refreshes automatically every 10 seconds</div></section>
        </>}

        {view==='progress'&&<ProgressPanel summary={mapSummary} points={progressReports} updates={progressUpdates} updatedAt={mapUpdatedAt} onReport={()=>go('reports')}/>}
        {view==='messages'&&isAdmin&&<OfficialChat reports={reports}/>}

        {view==='analytics'&&isAdmin&&<><section className="metric-grid"><Metric title="Total records" value={analytics?.total_potholes ?? 'â€”'} sub="stored potholes" icon={<MapPin size={18}/>} color="yellow"/><Metric title="Mean AI confidence" value={analytics?`${Math.round((analytics.average_ai_confidence||0)*100)}%`:'â€”'} sub="model detections" icon={<Activity size={18}/>} color="purple"/><Metric title="Severity levels" value={analytics?Object.keys(analytics.severity_distribution||{}).length:'â€”'} sub="available categories" icon={<TriangleAlert size={18}/>} color="orange"/><Metric title="Statuses" value={analytics?Object.keys(analytics.status_distribution||{}).length:'â€”'} sub="workflow states" icon={<Check size={18}/>} color="green"/></section><section className="feature-grid"><Distribution title="Severity distribution" data={analytics?.severity_distribution}/><Distribution title="Report status" data={analytics?.status_distribution}/></section></>}

        {view==='complaints'&&isAdmin&&<><section className="official-queue-heading"><div><span className="eyebrow dark-eyebrow">ALL CITIZEN SUBMISSIONS</span><h2>Official complaint desk</h2><p>One authority queue for complaints submitted by every citizen account. Review, track, and update each case.</p></div><span className="count-pill">{complaints.length} total cases</span></section><EntityTable title="Complaints from all citizens" rows={complaints} fields={['case_number','pothole_id','citizen_name','citizen_email','description','status','created_at']} statusOptions={['submitted','under_review','inspection_scheduled','work_order_created','in_progress','resolved','rejected']} resource="complaints" onStatus={updateStatus} busy={busy} editable mapReports={reports}/></>}

        {view==='complaints'&&!isAdmin&&<><form className="feature-panel complaint-form" onSubmit={submitCitizenComplaint}><div className="complaint-heading"><span className="feature-icon"><Send size={20}/></span><div><span className="eyebrow dark-eyebrow">SEND TO ROAD AUTHORITY</span><h2>Submit a complaint</h2><p>Describe a road hazard or repair concern. Your identity is attached securely to your signed-in account.</p></div></div><div className="form-grid"><label>Related report ID <small>Optional, if this complaint is about an existing map report</small><input name="pothole_id" type="number" min="1" placeholder="For example, 124"/></label><label className="wide-field">Issue details<textarea name="description" rows="4" minLength="5" maxLength="2000" placeholder="Describe the road issue and where it is locatedâ€¦" required/></label></div><div className="complaint-actions"><small>Your complaint is sent to the official dashboard for review. You can track its status below.</small><button className="primary-button" type="submit" disabled={busy}><Send size={15}/>{busy?'Submittingâ€¦':'Submit to authority'}</button></div></form><CitizenComplaintList rows={complaints}/></>}

        {view==='inspections'&&isAdmin&&<><form className="feature-form" onSubmit={e=>createJson(e,'/inspections','inspections')}><h2><Search size={18}/> Schedule an inspection</h2><div className="form-grid"><label>Report ID<input name="pothole_id" type="number" min="1" placeholder="Required report ID" required/></label><label>Complaint ID (optional)<input name="complaint_id" type="number" min="1" placeholder="Complaint ID"/></label><label>Inspector name<input name="inspector_name" placeholder="Inspector" required/></label><label>Confirmed severity<select name="confirmed_severity" defaultValue=""><option value="">Not set</option>{severityOptions.map(s=><option key={s}>{s}</option>)}</select></label><label className="wide-field">Inspection notes<textarea name="inspection_notes" rows="3" placeholder="Inspection notes"/></label></div><button className="primary-button" disabled={busy}>Create inspection <ArrowRight size={15}/></button></form><EntityTable title="Inspection schedule" rows={inspections} fields={['id','pothole_id','inspector_name','confirmed_severity','status','created_at']} statusOptions={['scheduled','in_progress','completed','cancelled']} resource="inspections" onStatus={updateStatus} busy={busy} editable/></>}

        {view==='work-orders'&&isAdmin&&<><OfficialProgressManager reports={reports} updates={progressUpdates} onPublish={publishProgress} onEdit={editProgress} busy={busy}/><form className="feature-form" onSubmit={e=>createJson(e,'/work-orders','work-orders')}><h2><Wrench size={18}/> Assign repair work</h2><div className="form-grid"><label>Report ID<input name="pothole_id" type="number" min="1" placeholder="Required report ID" required/></label><label>Inspection ID (optional)<input name="inspection_id" type="number" min="1" placeholder="Inspection ID"/></label><label>Contractor<input name="contractor_name" placeholder="Contractor name" required/></label><label>Priority<select name="priority" defaultValue="medium">{severityOptions.map(s=><option key={s}>{s}</option>)}</select></label><label>Estimated cost<input name="estimated_cost" type="number" min="0" step="0.01" placeholder="Optional"/></label><label>Scheduled date<input name="scheduled_date" type="datetime-local"/></label><label className="wide-field">Work description<textarea name="work_description" rows="3" placeholder="Describe repair work" required/></label></div><button className="primary-button" disabled={busy}>Create work order <ArrowRight size={15}/></button></form><EntityTable title="Work orders" rows={workOrders} fields={['id','pothole_id','contractor_name','priority','status','estimated_cost']} statusOptions={['assigned','accepted','in_progress','completed','cancelled']} resource="work-orders" onStatus={updateStatus} busy={busy} editable/></>}

        {view==='settings'&&<SettingsPanel preference={themePreference} onChange={onThemeChange} user={user} isAdmin={isAdmin} activityAlerts={activityAlerts} onActivityAlerts={value=>saveSetting('pv_activity_alerts',value,setActivityAlerts)} profilePhoto={profilePhoto} onProfilePhotoChange={handleProfilePhotoChange} onRemoveProfilePhoto={removeProfilePhoto}/>}

        {view==='about'&&<AboutPanel/>}

        <footer className="dashboard-footer"><span>Â© 2026 PotholeVision <i/> Safer roads, together</span><span><span className="api-status"/> Community road updates</span></footer>

      </div></main><nav className="mobile-nav" aria-label="Main navigation">{(isAdmin?[['overview','Home',LayoutDashboard],['reports','Reports',FileText],['map','Map',MapPinned],['messages','Chat',MessageCircle],['complaints','Queue',ClipboardList],['work-orders','Repairs',Wrench]]:[['home','Home',LayoutDashboard],['map','Map',MapPinned],['progress','Progress',Activity],['detect','AI Scan',Camera],['complaints','Complaints',ClipboardList],['settings','Settings',Settings],['about','About us',Info]]).map(([id,label,Icon])=>visiblePages.some(item=>item.id===id)&&<button type="button" key={id} className={view===id?'active':''} aria-current={view===id?'page':undefined} onClick={()=>go(id)}><Icon size={17}/><span>{label}</span></button>)}</nav></div>;

}



function pageDescription(view) { return ({ home:'Your neighborhood road updates, repair progress, and quick actions.', overview:'A live view of incoming reports, complaints, and official operations.', reports:'Create, filter, and update road hazard reports from your database.', detect:'Capture road photos with your camera and track AI detections.', map:'Explore reports that include GPS coordinates.', progress:'Follow active repairs and see the latest public road report status.', analytics:'Severity, workflow, and AI confidence metrics from the backend.', complaints:'Follow your submitted road reports and authority updates.', inspections:'Schedule field inspections and update their progress.', 'work-orders':'Assign repair work and publish live progress updates for citizens.', settings:'Manage your appearance and account preferences.', about:'Learn about PotholeVision and how the platform works.' })[view] || ''; }

function CitizenHome({name,summary={},points=[],complaints=[],onGo}) {
  const recent=[...points].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,4);
  return <div className="citizen-home">
    <section className="citizen-home-hero">
      <div className="citizen-home-copy"><span className="citizen-home-kicker"><i/> COMMUNITY ROAD WATCH</span><h2>Hi {name}, let’s make your streets safer.</h2><p>Report a road issue, check nearby hazards, or follow repair work happening in your community.</p><div className="citizen-home-actions"><button type="button" className="citizen-action-primary" onClick={()=>onGo('reports')}><Plus size={17}/> Report a hazard</button><button type="button" className="citizen-action-secondary" onClick={()=>onGo('detect')}><Camera size={16}/> Scan a road photo</button></div></div>
      <div className="citizen-home-illustration" aria-hidden="true"><span className="citizen-road-pin pin-a"><MapPin size={18}/></span><span className="citizen-road-pin pin-b"><MapPin size={18}/></span><i/><b/></div>
    </section>
    <section className="citizen-home-section"><div className="citizen-section-heading"><div><span className="eyebrow dark-eyebrow">YOUR COMMUNITY</span><h2>Road status at a glance</h2></div><button type="button" className="citizen-text-link" onClick={()=>onGo('map')}>Open live map <ArrowRight size={15}/></button></div>
      <div className="citizen-stat-grid"><article><span className="citizen-stat-icon yellow"><MapPin size={18}/></span><small>Reported hazards</small><b>{summary.total??0}</b><span>GPS reports in the community</span></article><article><span className="citizen-stat-icon amber"><Wrench size={18}/></span><small>Repairs underway</small><b>{summary.repairing??0}</b><span>Cases being worked on</span></article><article><span className="citizen-stat-icon green"><Check size={18}/></span><small>Repairs completed</small><b>{summary.resolved??0}</b><span>{summary.completion_percent??0}% of mapped cases resolved</span></article><article><span className="citizen-stat-icon purple"><ClipboardList size={18}/></span><small>Your complaints</small><b>{complaints.length}</b><span>Updates from the road authority</span></article></div>
    </section>
    <div className="citizen-home-columns"><section className="citizen-home-card"><div className="citizen-card-heading"><div><span className="eyebrow dark-eyebrow">LATEST ACTIVITY</span><h2>Nearby road reports</h2></div><button type="button" className="citizen-round-link" onClick={()=>onGo('map')} aria-label="Open community map"><ArrowRight size={16}/></button></div>{recent.length?<div className="citizen-recent-list">{recent.map(point=><button type="button" key={point.id} onClick={()=>onGo('map')}><span className={`citizen-recent-icon ${point.status==='resolved'?'resolved':''}`}><MapPin size={16}/></span><span className="citizen-recent-copy"><b>Report PV-{point.id}</b><small>{point.latitude!=null&&point.longitude!=null?`${Number(point.latitude).toFixed(4)}, ${Number(point.longitude).toFixed(4)}`:'Location not tagged'} · {(point.severity||'unrated').toUpperCase()}</small></span><span className="citizen-recent-status">{statusText(point.status)}</span></button>)}</div>:<div className="citizen-home-empty"><MapPinned size={20}/><b>No reports to show yet</b><span>Community road reports will appear here.</span></div>}</section>
      <section className="citizen-home-card citizen-next-card"><span className="citizen-next-icon"><Activity size={19}/></span><span className="eyebrow dark-eyebrow">KEEP TRACK</span><h2>Stay up to date on repairs</h2><p>Follow public repair stages and read the latest updates from officials.</p><button type="button" className="citizen-next-link" onClick={()=>onGo('progress')}>View repair progress <ArrowRight size={15}/></button><div className="citizen-next-divider"/><div className="citizen-next-foot"><Clock3 size={15}/><span>Community updates refresh automatically</span></div></section></div>
  </div>;
}

function Metric({title,value,sub,icon,color}) { return <article className="metric-card"><div className={`metric-icon ${color}`}>{icon}</div><span className="metric-title">{title}</span><div className="metric-value">{value}</div><div className="metric-change"><span>{sub}</span></div><div className="metric-spark"/></article>; }

function FeatureLink({icon,title,body,onClick}) { return <button className="feature-link" onClick={onClick}><span className="feature-icon">{icon}</span><span><b>{title}</b><small>{body}</small></span><ArrowRight size={16}/></button>; }

function Empty({text}) { return <div className="empty-state">{text}</div>; }

function statusText(status) { return statusLabels[status] || (status||'â€”').replaceAll('_',' '); }

function CitizenComplaintList({rows=[]}) {

  return <section className="citizen-complaints-panel"><div className="citizen-complaints-heading"><div><span className="eyebrow dark-eyebrow">YOUR SUBMISSIONS</span><h2>Your complaints <span className="count-pill">{rows.length}</span></h2><p>Track the reports you submitted and follow their repair status.</p></div><span className="map-live-badge"><i/> LIVE <small>Updates every 30 sec</small></span></div>{rows.length?<div className="citizen-complaint-list">{rows.map(row=><article className="citizen-complaint-row" key={row.id}><span className="citizen-complaint-icon"><ClipboardList size={17}/></span><div className="citizen-complaint-main"><b>{row.case_number||`PV-C-${String(row.id).padStart(6,'0')}`}{row.pothole_id?` Â· Report PV-${row.pothole_id}`:''}</b><p>{row.description}</p><small>{row.created_at?`Submitted ${new Date(row.created_at).toLocaleString()}`:'Submitted recently'}</small></div><span className={`citizen-complaint-status status-${(row.status||'submitted').toLowerCase()}`}>{statusText(row.status)}</span></article>)}</div>:<div className="citizen-complaints-empty"><ClipboardList size={20}/><div><b>No complaints submitted yet</b><small>Reports created through AI Scan will appear here as soon as they are submitted.</small></div></div>}</section>;

}

function AnnotatedImagePreview({src,detections=[]}) {

  const [dimensions,setDimensions]=useState(null);

  return <div className="annotated-image-preview"><img src={src} alt="AI scan with detected potholes outlined" onLoad={event=>setDimensions({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight})}/>{dimensions&&<svg viewBox={`0 0 ${dimensions.width} ${dimensions.height}`} preserveAspectRatio="none" aria-label={`${detections.length} pothole detections outlined`}>{detections.map((detection,index)=>{const box=detection.bounding_box||{};const x=Number(box.x1),y=Number(box.y1),width=Number(box.x2)-x,height=Number(box.y2)-y;if(![x,y,width,height].every(Number.isFinite)||width<=0||height<=0)return null;const labelY=Math.max(20,y-6);return <g key={`${index}-${x}-${y}`}><rect className="detection-outline" x={x} y={y} width={width} height={height} rx={Math.max(2,dimensions.width*.003)}/><rect className="detection-label-bg" x={x} y={labelY-20} width={Math.min(width,dimensions.width*.31)} height={22} rx={3}/><text className="detection-label-text" x={x+5} y={labelY-5}>POTHOLE {Math.round((detection.confidence||0)*100)}%</text></g>})}</svg>}<span className="annotated-image-badge"><Check size={12}/> {detections.length} detected</span></div>;

}

function parseReportCsv(text) {

  const records=[]; let record=[]; let cell=''; let quoted=false;

  for(let i=0;i<text.length;i++){const char=text[i];if(quoted){if(char==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(char==='"')quoted=false;else cell+=char;}else if(char==='"')quoted=true;else if(char===','){record.push(cell.trim());cell='';}else if(char==='\n'||char==='\r'){if(char==='\r'&&text[i+1]==='\n')i++;record.push(cell.trim());if(record.some(value=>value!==''))records.push(record);record=[];cell='';}else cell+=char;}

  record.push(cell.trim());if(record.some(value=>value!==''))records.push(record);

  if(records.length<2)throw new Error('CSV needs a header row and at least one data row.');

  const headers=records[0].map(value=>value.replace(/^\uFEFF/,'').toLowerCase());

  for(const required of ['latitude','longitude','severity'])if(!headers.includes(required))throw new Error(`CSV is missing the required â€œ${required}â€ column.`);

  const column=name=>headers.indexOf(name);

  return records.slice(1).map(row=>({latitude:Number(row[column('latitude')]),longitude:Number(row[column('longitude')]),severity:(row[column('severity')]||'').toLowerCase(),description:row[column('description')]||''}));

}

function ReportTable({rows,onStatus,busy,editable=false}) { const [query,setQuery]=useState(''); const [status,setStatus]=useState('all'); const visible=rows.filter(r=>(status==='all'||r.status===status)&&`${r.id} ${r.description||''} ${r.latitude||''} ${r.longitude||''}`.toLowerCase().includes(query.toLowerCase())); return <div className="reports-section"><div className="report-tools"><label><Search size={14}/><input placeholder="Search reports" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="Filter reports by status" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option>{statusOptions.map(s=><option key={s} value={s}>{statusText(s)}</option>)}</select></div><div className="table-wrap"><table><thead><tr><th>REPORT</th><th>LOCATION / DETAILS</th><th>SEVERITY</th><th>STATUS</th><th>CONFIDENCE</th><th>REPORTED</th></tr></thead><tbody>{visible.map(r=><tr key={r.id}><td><b className="report-id">PV-{r.id}</b></td><td><div className="loc-name">{r.latitude!=null&&r.longitude!=null?`${Number(r.latitude).toFixed(5)}, ${Number(r.longitude).toFixed(5)}`:'Location not tagged'}</div><div className="loc-zone">{r.description||'Road issue'}</div>{editable&&googleMapsUrl(r)&&<a className="go-now-link" href={googleMapsUrl(r)} target="_blank" rel="noreferrer"><MapPinned size={12}/> Go now</a>}</td><td><span className={`severity ${(r.severity||'medium').toLowerCase()}`}>{r.severity||'â€”'}</span></td><td>{editable?<select className="status-select" value={r.status||'reported'} disabled={busy} onChange={e=>onStatus('potholes',r.id,e.target.value)}>{statusOptions.map(s=><option key={s} value={s}>{statusText(s)}</option>)}</select>:statusText(r.status)}</td><td>{r.confidence==null?'â€”':`${Math.round(r.confidence*100)}%`}</td><td>{r.created_at?new Date(r.created_at).toLocaleDateString():'â€”'}</td></tr>)}</tbody></table>{visible.length===0&&<Empty text={rows.length?'No reports match these filters.':'No reports have been saved yet.'}/>}</div><div className="table-footer">Showing <b>{visible.length}</b> of <b>{rows.length}</b> report(s)</div></div>; }

function EntityTable({title,rows,fields,statusOptions,resource,onStatus,busy,editable=false,mapReports=[]}) {

  const labels={id:'ID',case_number:'CASE ID',pothole_id:'REPORT',complaint_id:'COMPLAINT',citizen_name:'CITIZEN',citizen_email:'CITIZEN EMAIL',description:'DETAILS',status:'STATUS',created_at:'CREATED',inspector_name:'INSPECTOR',confirmed_severity:'SEVERITY',contractor_name:'CONTRACTOR',priority:'PRIORITY',estimated_cost:'COST'};

  return <section className="reports-section entity-section"><div className="section-heading"><div><div className="eyebrow dark-eyebrow">BACKEND RECORDS</div><h2>{title} <span className="count-pill">{rows.length}</span></h2></div></div><div className="table-wrap"><table><thead><tr>{fields.map(field=><th key={field}>{labels[field]||field.toUpperCase()}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={row.id||index}>{fields.map(field=><td key={field}>{field==='status'&&statusOptions&&editable?<select className="status-select" value={row[field]||statusOptions[0]} disabled={busy} onChange={event=>onStatus(resource,row.id,event.target.value)}>{statusOptions.map(status=><option key={status} value={status}>{statusText(status)}</option>)}</select>:field==='status'?statusText(row[field]):field==='created_at'&&row[field]?new Date(row[field]).toLocaleString():field==='pothole_id'&&row[field]?<span className="case-location-cell">PV-{row[field]}{(()=>{const point=mapReports.find(item=>Number(item.id)===Number(row[field]));const href=googleMapsUrl(point);return href?<a className="go-now-link" href={href} target="_blank" rel="noreferrer"><MapPinned size={12}/> Go now</a>:<small>GPS unavailable</small>})()}</span>:row[field]??'?'}</td>)}</tr>)}</tbody></table>{rows.length===0&&<Empty text="No records yet."/>}</div><div className="table-footer">Showing <b>{rows.length}</b> record(s)</div></section>;

}



function Distribution({title,data={}}) { const entries=Object.entries(data||{}); const max=Math.max(1,...entries.map(([,v])=>Number(v)||0)); return <section className="feature-panel distribution"><h2>{title}</h2>{entries.length?entries.map(([key,value])=><div className="distribution-row" key={key}><div><span>{statusText(key)}</span><b>{value}</b></div><i><span style={{width:`${Math.max(3,(Number(value)/max)*100)}%`}}/></i></div>):<Empty text="No analytics data available yet."/>}</section>; }

function geoToWorld(latitude, longitude, zoom) {

  const scale = 256 * (2 ** zoom);

  const lat = Math.max(-85.05112878, Math.min(85.05112878, Number(latitude))) * Math.PI / 180;

  return { x: ((Number(longitude) + 180) / 360) * scale, y: (0.5 - Math.log((1 + Math.sin(lat)) / (1 - Math.sin(lat))) / (4 * Math.PI)) * scale };

}

function worldToGeo(x, y, zoom) {

  const scale = 256 * (2 ** zoom);

  const longitude = (x / scale) * 360 - 180;

  const n = Math.PI - 2 * Math.PI * y / scale;

  const latitude = 180 / Math.PI * Math.atan(Math.sinh(n));

  return { latitude, longitude };

}

function loadGoogleMapsApi(){
  if(window.google?.maps)return Promise.resolve(window.google);
  if(!window.__pvGoogleMapsPromise){window.__pvGoogleMapsPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&v=weekly`;script.async=true;script.onload=()=>window.google?.maps?resolve(window.google):reject(new Error('Google Maps did not initialize. Check the API key and Maps JavaScript API settings.'));script.onerror=()=>reject(new Error('Google Maps could not load. Check the API key and network connection.'));document.head.appendChild(script)});}
  return window.__pvGoogleMapsPromise;
}

function GoogleMapsLiveMap({points}){
  const elementRef=useRef(null);const mapRef=useRef(null);const markersRef=useRef([]);const infoRef=useRef(null);const [ready,setReady]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{let active=true;loadGoogleMapsApi().then(google=>{if(!active)return;mapRef.current=new google.maps.Map(elementRef.current,{center:{lat:12.9716,lng:77.5946},zoom:12,mapTypeId:'roadmap',mapTypeControl:true,streetViewControl:false,fullscreenControl:true,clickableIcons:false});infoRef.current=new google.maps.InfoWindow();setReady(true)}).catch(err=>{if(active)setError(err.message)});return()=>{active=false;markersRef.current.forEach(marker=>marker.setMap(null))}},[]);
  useEffect(()=>{if(!ready||!mapRef.current)return;const google=window.google;markersRef.current.forEach(marker=>marker.setMap(null));markersRef.current=[];const bounds=new google.maps.LatLngBounds();points.forEach(point=>{const position={lat:Number(point.latitude),lng:Number(point.longitude)};const color=point.status==='resolved'?'#4e9a55':['work_order_created','in_progress'].includes(point.status)?'#dfa51d':'#df2929';const marker=new google.maps.Marker({position,map:mapRef.current,title:`PV-${point.id} · ${statusText(point.status)}`,icon:{path:google.maps.SymbolPath.CIRCLE,scale:9,fillColor:color,fillOpacity:1,strokeColor:'#fff',strokeWeight:2}});marker.addListener('click',()=>{const content=document.createElement('div');content.className='google-map-popup';const title=document.createElement('b');title.textContent=`PV-${point.id} · ${statusText(point.status)}`;const detail=document.createElement('p');detail.textContent=`${(point.severity||'Unrated').toUpperCase()} · ${Number(point.latitude).toFixed(6)}, ${Number(point.longitude).toFixed(6)}`;const link=document.createElement('a');link.href=`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${point.latitude},${point.longitude}`)}`;link.target='_blank';link.rel='noreferrer';link.textContent='Open directions';content.append(title,detail,link);infoRef.current.setContent(content);infoRef.current.open({map:mapRef.current,anchor:marker})});markersRef.current.push(marker);bounds.extend(position)});if(points.length>1)mapRef.current.fitBounds(bounds);else if(points.length===1){mapRef.current.setCenter(bounds.getCenter());mapRef.current.setZoom(16)}},[points,ready]);
  return <div className="google-live-map-wrap"><div className="google-live-map-canvas" ref={elementRef}/>{error&&<div className="google-map-error">{error} <a href="https://developers.google.com/maps/documentation/javascript/get-api-key" target="_blank" rel="noreferrer">Configure Google Maps</a></div>}{!points.length&&!error&&<div className="google-map-empty">No GPS-tagged reports yet. Reports without location still appear in Live repair progress.</div>}<div className="google-map-key-note">Google Maps · Red: awaiting · Amber: repairing · Green: complete</div></div>;
}

function LiveMap({points}) {

  const [center,setCenter]=useState({latitude:12.9716,longitude:77.5946});

  const [zoom,setZoom]=useState(12); const [size,setSize]=useState({width:900,height:420});

  const [mapElement,setMapElement]=useState(null); const [selectedId,setSelectedId]=useState(null);

  const [drag,setDrag]=useState(null); const [search,setSearch]=useState('');

  const validPoints=points.filter(point=>Number.isFinite(Number(point.latitude))&&Number.isFinite(Number(point.longitude))&&Math.abs(Number(point.latitude))<=90&&Math.abs(Number(point.longitude))<=180);

  useEffect(()=>{if(!mapElement)return;const update=()=>{const box=mapElement.getBoundingClientRect();setSize(old=>old.width===box.width&&old.height===box.height?old:{width:box.width,height:box.height})};update();const observer=new ResizeObserver(update);observer.observe(mapElement);return()=>observer.disconnect()},[mapElement]);

  useEffect(()=>{if(!validPoints.length)return;const latitude=validPoints.reduce((sum,p)=>sum+Number(p.latitude),0)/validPoints.length;const longitude=validPoints.reduce((sum,p)=>sum+Number(p.longitude),0)/validPoints.length;let fitZoom=16;for(let level=16;level>=3;level--){const projected=validPoints.map(p=>geoToWorld(p.latitude,p.longitude,level));const spanX=Math.max(...projected.map(p=>p.x))-Math.min(...projected.map(p=>p.x));const spanY=Math.max(...projected.map(p=>p.y))-Math.min(...projected.map(p=>p.y));if(spanX<=Math.max(120,size.width-120)&&spanY<=Math.max(120,size.height-120)){fitZoom=level;break}}setCenter({latitude,longitude});setZoom(fitZoom);setSelectedId(null)},[points,size.width,size.height]);

  if(GOOGLE_MAPS_API_KEY)return <GoogleMapsLiveMap points={validPoints}/>;

  const centerWorld=geoToWorld(center.latitude,center.longitude,zoom);const originX=centerWorld.x-size.width/2;const originY=centerWorld.y-size.height/2;const tileCount=2**zoom;const firstTileX=Math.floor(originX/256);const lastTileX=Math.floor((originX+size.width)/256);const firstTileY=Math.floor(originY/256);const lastTileY=Math.floor((originY+size.height)/256);const tiles=[];

  for(let x=firstTileX;x<=lastTileX;x++)for(let y=firstTileY;y<=lastTileY;y++){if(y<0||y>=tileCount)continue;const wrappedX=((x%tileCount)+tileCount)%tileCount;const src=MAP_TILE_URL.replace('{z}',zoom).replace('{x}',wrappedX).replace('{y}',y);tiles.push({key:`${zoom}-${x}-${y}`,src,left:x*256-originX,top:y*256-originY})}

  function markerPosition(point){const world=geoToWorld(point.latitude,point.longitude,zoom);return {left:world.x-originX,top:world.y-originY}}

  const groupMap=new Map();validPoints.forEach(point=>{const key=`${Number(point.latitude).toFixed(5)}:${Number(point.longitude).toFixed(5)}`;const group=groupMap.get(key)||{key,latitude:0,longitude:0,items:[]};group.latitude+=Number(point.latitude);group.longitude+=Number(point.longitude);group.items.push(point);groupMap.set(key,group)});const markerGroups=Array.from(groupMap.values()).map(group=>({...group,latitude:group.latitude/group.items.length,longitude:group.longitude/group.items.length}));const selected=markerGroups.find(group=>group.key===selectedId);const visiblePoints=validPoints.filter(point=>`${point.id} ${point.severity||''} ${point.status||''} ${point.latitude} ${point.longitude} ${point.description||''}`.toLowerCase().includes(search.toLowerCase()));

  function startDrag(event){if(event.target.closest('button,a,input'))return;event.currentTarget.setPointerCapture(event.pointerId);setDrag({x:event.clientX,y:event.clientY,center})}

  function moveDrag(event){if(!drag)return;const origin=geoToWorld(drag.center.latitude,drag.center.longitude,zoom);setCenter(worldToGeo(origin.x-(event.clientX-drag.x),origin.y-(event.clientY-drag.y),zoom))}

  function stopDrag(){setDrag(null)}

  function focusPoint(point){setCenter({latitude:Number(point.latitude),longitude:Number(point.longitude)});setZoom(Math.max(zoom,16));setSelectedId(`${Number(point.latitude).toFixed(5)}:${Number(point.longitude).toFixed(5)}`)}

  return <div className="live-map-wrap"><div className="live-map-canvas" ref={setMapElement} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag} style={{cursor:drag?'grabbing':'grab'}}>{tiles.map(tile=><img key={tile.key} className="map-tile" src={tile.src} alt="" draggable="false" style={{left:tile.left,top:tile.top}}/>)}{markerGroups.map(group=>{const pos=markerPosition(group);const markerStatus=group.items.every(point=>point.status==='resolved')?'resolved':group.items.some(point=>['work_order_created','in_progress'].includes(point.status))?'in_progress':'reported';const markerColor=markerStatus==='resolved'?'#4e9a55':markerStatus==='in_progress'?'#dfa51d':'#df2929';if(pos.left< -20||pos.top< -32||pos.left>size.width+20||pos.top>size.height+20)return null;return <button key={group.key} className={`map-marker ${markerStatus}`} style={{left:pos.left,top:pos.top}} title={`${group.items.length} report(s) Â· ${statusText(markerStatus)}`} aria-label={`Show ${group.items.length} report(s) at this location, ${statusText(markerStatus)}`} onPointerDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();setSelectedId(group.key)}}><MapPin size={34} fill={markerColor} stroke="white" strokeWidth={1.8}/>{group.items.length>1&&<span className="marker-count">{group.items.length}</span>}</button>})}{selected&&(()=>{const pos=markerPosition(selected);const googleMapsUrl=`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${selected.latitude},${selected.longitude}`)}`;return <article className="map-popup" style={{left:Math.max(145,Math.min(size.width-145,pos.left)),top:Math.max(75,pos.top-10)}}><button className="popup-close" onPointerDown={event=>event.stopPropagation()} onClick={()=>setSelectedId(null)} aria-label="Close report details"><X size={14}/></button><b>{selected.items.length>1?`${selected.items.length} reports at this location`:`Road report PV-${selected.items[0].id}`}</b>{selected.items.map(item=><span className="popup-report" key={item.id}>PV-{item.id} Â· {(item.severity||'Unrated').toUpperCase()} Â· {statusLabels[item.status]||item.status||'Reported'}</span>)}<small>{selected.latitude.toFixed(6)}, {selected.longitude.toFixed(6)}</small>{selected.items[0].description&&<small className="popup-description">{selected.items[0].description}</small>}<a href={googleMapsUrl} target="_blank" rel="noreferrer">Open in Google Maps <ArrowRight size={13}/></a></article>})()}<div className="map-zoom-controls"><button onPointerDown={event=>event.stopPropagation()} onClick={()=>setZoom(value=>Math.min(19,value+1))} aria-label="Zoom in">+</button><button onPointerDown={event=>event.stopPropagation()} onClick={()=>setZoom(value=>Math.max(3,value-1))} aria-label="Zoom out">-</button></div><div className="map-attribution">Â© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></div>{validPoints.length===0&&<div className="map-empty-note"><MapPin size={17}/> No GPS-tagged potholes yet. Enable location when capturing a road image or submitting a report.</div>}</div><div className="map-legend"><span><i className="awaiting"/> Awaiting <b>{validPoints.filter(point=>['reported','under_review','inspection_scheduled','inspection_completed','repair_required'].includes(point.status)).length}</b></span><span><i className="repairing"/> Being repaired <b>{validPoints.filter(point=>['work_order_created','in_progress'].includes(point.status)).length}</b></span><span><i className="resolved"/> Completed <b>{validPoints.filter(point=>point.status==='resolved').length}</b></span></div><div className="map-report-list"><div className="map-list-heading"><b>GPS reports</b><label><Search size={14}/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search coordinates or report"/></label></div>{visiblePoints.length?visiblePoints.map(point=><button className={`map-report-row ${point.status==='resolved'?'resolved': ['work_order_created','in_progress'].includes(point.status)?'repairing':'awaiting'} ${String(selectedId)===`${Number(point.latitude).toFixed(5)}:${Number(point.longitude).toFixed(5)}`?'selected':''}`} key={point.id} onClick={()=>focusPoint(point)}><MapPin size={18}/><span><b>Report PV-{point.id} Â· {(point.severity||'unrated').toUpperCase()}</b><small>{Number(point.latitude).toFixed(6)}, {Number(point.longitude).toFixed(6)} Â· {statusLabels[point.status]||point.status||'Reported'}</small></span><ArrowRight size={15}/></button>):<Empty text={validPoints.length?'No GPS reports match that search.':'No saved reports include GPS coordinates yet.'}/>}</div></div>;

}

function OfficialDashboard({summary,reports,complaints:complaintRows,updatedAt,onStatus,busy,onGo}) {

  const operations=summary||{};

  const potholes=operations.potholes||{};

  const complaints=operations.complaints||{};

  const inspections=operations.inspections||{};

  const workOrders=operations.work_orders||{};

  return <div className="official-dashboard"><section className="official-summary-grid"><Metric title="Community reports" value={potholes.total??'?'} sub={`${potholes.reported??0} awaiting review`} icon={<MapPin size={18}/>} color="yellow"/><Metric title="Open complaints" value={complaints.submitted??'?'} sub={`${complaints.total??0} received`} icon={<ClipboardList size={18}/>} color="orange"/><Metric title="Scheduled inspections" value={inspections.scheduled??'?'} sub={`${inspections.completed??0} completed`} icon={<Search size={18}/>} color="purple"/><Metric title="Active repair orders" value={(workOrders.assigned||0)+(workOrders.in_progress||0)} sub={`${workOrders.completed??0} completed`} icon={<Wrench size={18}/>} color="green"/></section><OfficialLiveQueue reports={reports} complaints={complaintRows||[]} updatedAt={updatedAt} onStatus={onStatus} busy={busy} onGo={onGo}/><section className="official-actions-panel"><div className="official-section-heading"><div><span className="eyebrow dark-eyebrow">OPERATIONS QUEUE</span><h2>Work areas</h2><p>Schedule inspections, assign repairs, and monitor completed work.</p></div></div><div className="official-action-grid"><button type="button" onClick={()=>onGo('complaints')}><span className="feature-icon"><ClipboardList size={19}/></span><span><b>Complaint queue</b><small>{complaints.submitted??0} awaiting review</small></span><ArrowRight size={16}/></button><button type="button" onClick={()=>onGo('inspections')}><span className="feature-icon"><Search size={19}/></span><span><b>Field inspections</b><small>{inspections.scheduled??0} scheduled</small></span><ArrowRight size={16}/></button><button type="button" onClick={()=>onGo('work-orders')}><span className="feature-icon"><Wrench size={19}/></span><span><b>Repair work orders</b><small>{workOrders.assigned??0} assigned Â· {workOrders.in_progress??0} active</small></span><ArrowRight size={16}/></button><button type="button" onClick={()=>onGo('analytics')}><span className="feature-icon"><BarChart3 size={19}/></span><span><b>Performance data</b><small>Severity and repair outcomes</small></span><ArrowRight size={16}/></button></div></section></div>;

}



function OfficialChat({reports}) {

  const [users,setUsers]=useState([]);const [otherId,setOtherId]=useState('');const [messages,setMessages]=useState([]);const [text,setText]=useState('');const [important,setImportant]=useState(false);const [potholeId,setPotholeId]=useState('');const [attachment,setAttachment]=useState(null);const attachmentInput=useRef(null);const [loading,setLoading]=useState(true);const [sending,setSending]=useState(false);const [error,setError]=useState('');

  async function loadMessages(id=otherId){if(!id)return;try{const rows=await request(`/official/chat/messages?with_user_id=${id}`);setMessages(Array.isArray(rows)?rows:[]);setError('')}catch(err){setError(err.message)}}

  useEffect(()=>{request('/official/chat/users').then(rows=>{const list=Array.isArray(rows)?rows:[];setUsers(list);if(list.length)setOtherId(String(list[0].id))}).catch(err=>setError(err.message)).finally(()=>setLoading(false))},[]);

  useEffect(()=>{if(!otherId)return;loadMessages(otherId);const timer=window.setInterval(()=>loadMessages(otherId),5000);return()=>window.clearInterval(timer)},[otherId]);

  async function send(event){event.preventDefault();if((!text.trim()&&!attachment)||!otherId)return;setSending(true);setError('');try{if(attachment){const form=new FormData();form.append('recipient_id',otherId);form.append('message',text.trim());form.append('important',String(important));if(potholeId)form.append('pothole_id',potholeId);form.append('file',attachment);await request('/official/chat/attachments',{method:'POST',body:form})}else{await request('/official/chat/messages',{method:'POST',body:JSON.stringify({recipient_id:Number(otherId),message:text.trim(),important,pothole_id:potholeId?Number(potholeId):null})})}setText('');setImportant(false);setPotholeId('');setAttachment(null);await loadMessages(otherId)}catch(err){setError(err.message)}finally{setSending(false)}}

  return <section className="official-chat-panel"><header className="official-chat-heading"><div><span className="eyebrow dark-eyebrow">OFFICIAL MESSAGING</span><h2><MessageCircle size={21}/> Team chat</h2><p>Send messages, photos, videos, urgent notes, and report locations.</p></div><span className="official-live-pill"><i/> Private Â· refreshes live</span></header>{error&&<div className="chat-error">{error}</div>}{loading?<div className="chat-empty">Loading contactsâ€¦</div>:users.length===0?<div className="chat-empty"><b>No other accounts yet</b><span>Other user accounts will appear here for direct messages.</span></div>:<><label className="chat-contact-select">Chat with<select value={otherId} onChange={event=>setOtherId(event.target.value)}>{users.map(user=><option key={user.id} value={user.id}>{user.is_self_test?'My test chat (send a test message)':`${user.name} Â· ${user.email}`}</option>)}</select></label><div className="official-chat-messages">{messages.length?messages.map(message=><article key={message.id} className={`official-chat-bubble ${String(message.sender_id)===String(otherId)&&users.find(user=>String(user.id)===String(otherId))?.is_self_test?'sent':String(message.sender_id)===String(otherId)?'received':'sent'} ${message.important?'important':''}`}><div className="chat-bubble-meta"><b>{String(message.sender_id)===String(otherId)&&users.find(user=>String(user.id)===String(otherId))?.is_self_test?'You':String(message.sender_id)===String(otherId)?users.find(user=>String(user.id)===String(otherId))?.name||'User':'You'}</b><time>{message.created_at?new Date(message.created_at).toLocaleString():''}</time></div>{message.important&&<strong className="important-label"><Star size={12} fill="currentColor"/> Important</strong>}{message.message&&<p>{message.message}</p>}{message.has_attachment&&<ChatAttachment message={message}/ >}{message.pothole_id&&message.latitude&&message.longitude&&<a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${message.latitude},${message.longitude}`)}`} target="_blank" rel="noreferrer" className="chat-location-link"><MapPinned size={15}/><span><b>Report PV-{message.pothole_id} location</b><small>{Number(message.latitude).toFixed(5)}, {Number(message.longitude).toFixed(5)} Â· Open in Google Maps</small></span><ArrowRight size={14}/></a>}</article>):<div className="chat-empty">No messages yet. Start the conversation below.</div>}</div><form className="official-chat-compose" onSubmit={send}><label className="chat-share-location"><MapPinned size={16}/><span>Attach report location</span><select aria-label="Attach report location" value={potholeId} onChange={event=>setPotholeId(event.target.value)}><option value="">None</option>{reports.filter(report=>report.latitude!=null&&report.longitude!=null).map(report=><option key={report.id} value={report.id}>PV-{report.id} Â· {Number(report.latitude).toFixed(4)}, {Number(report.longitude).toFixed(4)}</option>)}</select></label><input ref={attachmentInput} className="chat-file-input" type="file" accept="image/*,video/*" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file&&file.size>25*1024*1024){setError('Images and videos must be 25 MB or smaller.');return;}if(file){setError('');setAttachment(file);}}}/>{attachment&&<div className="chat-selected-file"><span>{attachment.type.startsWith('video/')?'Video':'Photo'} Â· {attachment.name}</span><button type="button" onClick={()=>setAttachment(null)}>Remove</button></div>}<div className="chat-compose-row"><textarea value={text} onChange={event=>setText(event.target.value)} rows="2" maxLength="2000" placeholder="Write a message or add a photo/videoâ€¦"/><button type="button" className="chat-attach-button" onClick={()=>attachmentInput.current?.click()}><Upload size={16}/><span>Photo/video</span></button><button type="button" className={`chat-important-toggle ${important?'active':''}`} aria-pressed={important} onClick={()=>setImportant(value=>!value)} title="Mark message important"><Star size={16}/><span>Important</span></button><button className="primary-button chat-send" disabled={sending||(!text.trim()&&!attachment)}><Send size={16}/>{sending?'Sendingâ€¦':'Send'}</button></div></form></>}</section>;

}



function ChatAttachment({message}) {
  const [url,setUrl]=useState(''); const [failed,setFailed]=useState(false);
  useEffect(()=>{
    let active=true; let objectUrl='';
    const token=sessionStorage.getItem('pv_token');
    fetch(`${API}/official/chat/attachments/${message.id}`,{headers:token?{Authorization:`Bearer ${token}`}:{}})
      .then(response=>{if(!response.ok)throw new Error('Attachment unavailable');return response.blob()})
      .then(blob=>{objectUrl=URL.createObjectURL(blob);if(active)setUrl(objectUrl);else URL.revokeObjectURL(objectUrl)})
      .catch(()=>{if(active)setFailed(true)});
    return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl)};
  },[message.id]);
  if(failed)return <div className="chat-media-fallback">Could not load {message.attachment_name||'attachment'}.</div>;
  if(!url)return <div className="chat-media-fallback">Loading {message.attachment_name||'attachment'}â€¦</div>;
  return <div className="chat-media-preview">{message.attachment_type?.startsWith('video/')?<video src={url} controls playsInline preload="metadata"/>:<a href={url} download={message.attachment_name||'image'}><img src={url} alt={message.attachment_name||'Shared image'}/></a>}<a className="chat-download-link" href={url} download={message.attachment_name||'attachment'}>Download {message.attachment_name||'attachment'}</a></div>;
}

function OfficialProgressManager({reports,updates,onPublish,onEdit,busy}) {

  const [editingId,setEditingId]=useState(null);
  const presets=[['Awaiting repair','0'],['Inspection scheduled','10'],['Repair scheduled','25'],['Work underway','60'],['Quality check','90'],['Repair completed','100'],['Work done','100']];
  function selectStage(event){const preset=presets.find(([stage])=>stage===event.target.value);if(preset)event.currentTarget.form.elements.progress_percent.value=preset[1];}
  async function saveEdit(event,id){const saved=await onEdit(event,id);if(saved)setEditingId(null);}

  return <section className="official-progress-manager"><div className="official-section-heading"><div><span className="eyebrow dark-eyebrow">LIVE REPAIR CONTROL</span><h2>Update repair status for citizens</h2><p>Choose a road report, set its current repair stage, and post a note. Edit a published update any time to correct the status or mark the work complete.</p></div><span className="official-live-pill"><i/> Citizen feed Â· live</span></div>{reports.length?<form className="feature-form progress-update-form" onSubmit={onPublish}><div className="form-grid"><label>Road report<select name="pothole_id" required defaultValue=""><option value="" disabled>Select report</option>{reports.filter(report=>report.status!=='resolved').map(report=><option key={report.id} value={report.id}>PV-{report.id} Â· {(report.severity||'unrated').toUpperCase()} Â· {statusText(report.status||'reported')}</option>)}</select></label><label>Official repair status<select name="stage" defaultValue="Awaiting repair" onChange={selectStage}>{presets.map(([stage])=><option key={stage}>{stage}</option>)}</select></label><label>Progress percentage<input name="progress_percent" type="number" min="0" max="100" defaultValue="0" required/></label><label className="wide-field">Update visible to citizens<textarea name="message" rows="3" minLength="3" maxLength="1000" placeholder="Example: The inspection is complete; the repair crew is scheduled for Thursday." required/></label></div><button className="primary-button" disabled={busy}><Activity size={16}/>{busy?'Posting updateâ€¦':'Publish live update'}</button></form>:<Empty text="A road report is needed before you can post a repair update."/>}{updates.length>0&&<div className="official-progress-recent"><div className="official-progress-recent-heading"><div><b>Published repair updates</b><small>Change a stage or note and citizens will see the corrected update.</small></div><span>{updates.length} updates</span></div>{updates.map(update=><article key={update.id} className="official-progress-entry"><div className="official-progress-entry-top"><span className={`progress-status-tag ${update.progress_percent>=100?'resolved':'repairing'}`}>{update.progress_percent}% Â· {update.stage}</span><button type="button" className="progress-edit-button" onClick={()=>setEditingId(editingId===update.id?null:update.id)}><Pencil size={14}/>{editingId===update.id?'Cancel':'Edit update'}</button></div>{editingId===update.id?<form className="progress-inline-edit" onSubmit={event=>saveEdit(event,update.id)}><label>Official repair status<select name="stage" defaultValue={update.stage} onChange={selectStage}>{presets.map(([stage])=><option key={stage}>{stage}</option>)}</select></label><label>Progress percentage<input name="progress_percent" type="number" min="0" max="100" defaultValue={update.progress_percent} required/></label><label className="wide-field">Citizen update<textarea name="message" rows="3" minLength="3" maxLength="1000" defaultValue={update.message} required/></label><button className="primary-button" disabled={busy}><Check size={15}/>{busy?'Savingâ€¦':'Save and publish'}</button></form>:<><p>{update.message}</p><small>Report PV-{update.pothole_id} Â· {update.created_at?new Date(update.created_at).toLocaleString():'Just now'}{update.updated_by?` Â· ${update.updated_by}`:''}</small></>}</article>)}</div>}</section>;

}



function OfficialLiveQueue({reports,complaints,updatedAt,onStatus,busy,onGo}) {

  const openReports=reports.filter(row=>!['resolved','rejected','duplicate'].includes(row.status)).slice(0,5);

  const openComplaints=complaints.filter(row=>!['resolved','rejected'].includes(row.status)).slice(0,5);

  const complaintStatuses=['submitted','under_review','inspection_scheduled','work_order_created','in_progress','resolved','rejected'];

  return <section className="official-live-queue"><header className="official-live-heading"><div><span className="eyebrow dark-eyebrow">LIVE OPERATIONS</span><h2>Incoming work</h2><p>Review new public reports and complaints, then change their status here.</p></div><span className="official-live-pill"><i/> Live Â· 10 sec{updatedAt?` Â· ${updatedAt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`:''}</span></header><div className="official-live-grid"><article className="official-live-card"><div className="official-live-card-heading"><div><b>Road reports</b><small>{openReports.length} open shown Â· {reports.length} total</small></div><button type="button" onClick={()=>onGo('reports')}>All reports <ArrowRight size={13}/></button></div>{openReports.length?openReports.map(report=><div className="official-live-row" key={`report-${report.id}`}><span className="official-live-record-icon"><MapPin size={16}/></span><span className="official-live-copy"><b>PV-{report.id} Â· {(report.severity||'unrated').toUpperCase()}</b><small>{report.latitude!=null&&report.longitude!=null?Number(report.latitude).toFixed(6)+', '+Number(report.longitude).toFixed(6)+' / ':'GPS unavailable / '}{report.description||'Road hazard report'}{report.created_at?` Â· ${new Date(report.created_at).toLocaleDateString()}`:''}</small></span><select aria-label={`Update report PV-${report.id}`} className="status-select" value={report.status||'reported'} disabled={busy} onChange={event=>onStatus('potholes',report.id,event.target.value)}>{statusOptions.map(status=><option key={status} value={status}>{statusText(status)}</option>)}</select>{googleMapsUrl(report)&&<a className="go-now-link" href={googleMapsUrl(report)} target="_blank" rel="noreferrer"><MapPinned size={12}/> Go now</a>}</div>):<Empty text="No open road reports. New citizen reports will appear here."/>}</article><article className="official-live-card"><div className="official-live-card-heading"><div><b>Citizen complaints</b><small>{openComplaints.length} open shown Â· {complaints.length} total</small></div><button type="button" onClick={()=>onGo('complaints')}>Complaint queue <ArrowRight size={13}/></button></div>{openComplaints.length?openComplaints.map(complaint=><div className="official-live-row" key={`complaint-${complaint.id}`}><span className="official-live-record-icon complaint"><ClipboardList size={16}/></span><span className="official-live-copy"><b>{complaint.case_number||`PV-C-${String(complaint.id).padStart(6,'0')}`}{complaint.pothole_id?` Â· PV-${complaint.pothole_id}`:''}</b><small>{complaint.citizen_name?`${complaint.citizen_name} Â· `:''}{complaint.description||'Citizen complaint'}{complaint.created_at?` Â· ${new Date(complaint.created_at).toLocaleDateString()}`:''}</small></span><select aria-label={`Update complaint ${complaint.id}`} className="status-select" value={complaint.status||'submitted'} disabled={busy} onChange={event=>onStatus('complaints',complaint.id,event.target.value)}>{complaintStatuses.map(status=><option key={status} value={status}>{statusText(status)}</option>)}</select>{(()=>{const linked=reports.find(item=>Number(item.id)===Number(complaint.pothole_id));const href=googleMapsUrl(linked);return href?<a className="go-now-link" href={href} target="_blank" rel="noreferrer"><MapPinned size={12}/> Go now</a>:null})()}</div>):<Empty text="No open complaints. New citizen complaints will appear here."/>}</article></div></section>;

}

function ProgressPanel({summary,points,updates,updatedAt,onReport}) {

  const sorted=[...points].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));

  const ongoing=sorted.filter(point=>['work_order_created','in_progress'].includes(String(point.status||'').toLowerCase()));

  const recent=sorted.slice(0,7);

  const updatedLabel=updatedAt?`Updated ${updatedAt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}`:'Waiting for first update';

  return <div className="progress-page"><section className="map-status-board progress-hero"><div className="map-status-heading"><div><span className="eyebrow dark-eyebrow">COMMUNITY REPAIR TRACKER</span><h2>Live repair progress</h2><p>Each submitted picture has one case ID. Follow official repair updates from report to completion.</p></div><div className="progress-live-state"><span className="map-live-badge"><i/> LIVE <small>Auto-updates every 10 sec</small></span><small className="progress-updated">{updatedLabel}</small></div></div><div className="map-status-cards"><article className="map-status-card"><span className="map-status-icon active-status"><MapPin size={18}/></span><div><small>Awaiting repair</small><b>{summary.open}</b><span className="progress-card-note">Waiting for official action</span></div></article><article className="map-status-card"><span className="map-status-icon repair-status"><Wrench size={18}/></span><div><small>Work underway</small><b>{summary.repairing}</b><span className="progress-card-note">Assigned or being repaired</span></div></article><article className="map-status-card progress-status-card"><span className="map-status-icon done-status"><Check size={18}/></span><div className="progress-stat-copy"><small>Completion rate</small><b>{summary.completion_percent}%</b><div className="map-progress-track"><i style={{width:`${summary.completion_percent}%`}}/></div><span>{summary.resolved} of {summary.total} active and completed reports resolved</span></div></article></div><div className="progress-flow"><span className="flow-step"><i>1</i> Reported</span><span className="flow-line"/><span className="flow-step"><i>2</i> Assigned</span><span className="flow-line"/><span className="flow-step active"><i><Activity size={12}/></i> Repairing</span><span className="flow-line"/><span className="flow-step"><i>4</i> Resolved</span></div></section>{updates?.length>0&&<section className="reports-section citizen-live-updates"><div className="section-heading"><div><div className="eyebrow dark-eyebrow">OFFICIAL LIVE UPDATES</div><h2>Repair activity</h2></div><span className="map-live-badge"><i/> LIVE</span></div><div className="citizen-update-list">{updates.map(update=><article key={update.id}><span className="citizen-update-progress">{update.progress_percent}%</span><div className="citizen-update-body"><div><b>Report PV-{update.pothole_id} Â· {update.stage}</b><time>{update.created_at?new Date(update.created_at).toLocaleString():'Just now'}</time></div><div className="map-progress-track"><i style={{width:`${update.progress_percent}%`}}/></div><p>{update.message}</p>{update.updated_by&&<small>Updated by {update.updated_by}</small>}</div></article>)}</div></section>}<section className="reports-section progress-reports"><div className="section-heading"><div><div className="eyebrow dark-eyebrow">LIVE WORK QUEUE</div><h2>Work underway <span className="count-pill">{ongoing.length}</span></h2></div><button type="button" className="secondary-button" onClick={onReport}><Plus size={15}/> Submit a report</button></div>{ongoing.length?<div className="progress-list">{ongoing.map(point=><article className="progress-list-row active-work-row" key={point.id}><span className="progress-list-icon repairing"><Wrench size={17}/></span><div className="progress-list-info"><b>{point.case_number||`PV-${point.id}`}</b><small>{point.latitude!=null&&point.longitude!=null?`${Number(point.latitude).toFixed(5)}, ${Number(point.longitude).toFixed(5)}`:'Location not tagged'} Â· {(point.severity||'unrated').toUpperCase()}</small></div><span className={`progress-status-tag ${point.status==='in_progress'?'repairing':'assigned'}`}>{statusText(point.status)}</span></article>)}</div>:<div className="progress-empty"><span className="progress-empty-icon"><Wrench size={19}/></span><div><b>No active repairs right now</b><small>New work appears here when an official schedules or starts a repair.</small></div></div>}</section><section className="reports-section progress-reports progress-activity"><div className="section-heading"><div><div className="eyebrow dark-eyebrow">RECENT ROAD ACTIVITY</div><h2>All recent report statuses</h2></div><span className="progress-activity-count">{recent.length} reports</span></div>{recent.length?<div className="progress-list">{recent.map(point=><article className="progress-list-row" key={point.id}><span className={`progress-list-icon ${(point.status||'reported')==='resolved'?'resolved':''}`}><MapPin size={17}/></span><div className="progress-list-info"><b>{point.case_number||`PV-${point.id}`}</b><small>{(point.severity||'unrated').toUpperCase()} Â· {point.created_at?new Date(point.created_at).toLocaleString(): 'Recently reported'}</small></div><span className={`progress-status-tag ${(point.status||'').toLowerCase().includes('progress')?'repairing':''}`}>{statusText(point.status)}</span></article>)}</div>:<Empty text="No road reports have been submitted yet."/>}</section></div>;

}

function SettingsPanel({preference,onChange,user,isAdmin,activityAlerts,onActivityAlerts,profilePhoto,onProfilePhotoChange,onRemoveProfilePhoto}) {

  const photoInput = useRef(null);

  const choices=[['light','Light',Sun],['dark','Dark',Moon],['system','System',Monitor]];

  const accountName=user?.name||'PotholeVision user';

  const accountEmail=user?.email||'Email not provided';

  const initials=String(user?.name||user?.email||'P').split(/[\s._-]+/).filter(Boolean).slice(0,2).map(part=>part[0].toUpperCase()).join('');

  return <div className="settings-layout"><section className="feature-panel settings-panel"><div className="panel-title"><div className="feature-icon"><Settings size={19}/></div><div><h2>Appearance</h2><p>Choose a theme for this device.</p></div></div><div className="theme-choices">{choices.map(([value,label,Icon])=><button type="button" key={value} className={`theme-choice ${preference===value?'selected':''}`} onClick={()=>onChange(value)} aria-pressed={preference===value}><Icon size={16}/><b>{label}</b>{preference===value&&<Check size={14}/>}</button>)}</div></section><section className="feature-panel settings-panel"><div className="panel-title"><div className="feature-icon"><Bell size={19}/></div><div><h2>Notifications</h2><p>Show an indicator when new road activity is available.</p></div></div><div className="settings-toggles"><div className="settings-toggle-row"><span className="settings-toggle-icon"><Bell size={17}/></span><span className="settings-toggle-copy"><b>Activity notifications</b><small>Show a badge on the notification bell when reports are available.</small></span><button type="button" role="switch" aria-checked={activityAlerts} aria-label="Activity notifications" className={`settings-switch ${activityAlerts?'on':''}`} onClick={()=>onActivityAlerts(!activityAlerts)}><i/></button></div></div></section><section className="feature-panel settings-panel account-settings-card"><div className="account-settings-heading"><div><span className="eyebrow dark-eyebrow">ACCOUNT</span><h2>Profile and access</h2></div><span className="account-session-pill"><i/> Signed in</span></div><div className="account-identity"><div className="account-avatar">{profilePhoto?<img src={profilePhoto} alt="Profile"/>:(initials||'P')}</div><div className="account-primary"><b>{accountName}</b><small>{accountEmail}</small></div><span className={`account-role ${isAdmin?'official':''}`}><ShieldCheck size={14}/>{isAdmin?'Official authority':'Community user'}</span></div><div className="account-photo-settings"><div><b>Profile photo</b><small>Choose a photo for your account avatar. Images up to 5 MB are supported.</small></div><input ref={photoInput} className="profile-photo-input" type="file" accept="image/*" onChange={onProfilePhotoChange}/><div className="account-photo-actions"><button type="button" className="secondary-button" onClick={()=>photoInput.current?.click()}><Camera size={15}/>{profilePhoto?'Change photo':'Upload photo'}</button>{profilePhoto&&<button type="button" className="account-photo-remove" onClick={onRemoveProfilePhoto}>Remove</button>}</div></div><div className="account-details"><div><small>ACCOUNT NAME</small><b>{accountName}</b></div><div><small>EMAIL ADDRESS</small><b>{accountEmail}</b></div><div><small>ACCESS LEVEL</small><b>{isAdmin?'Official dashboard':'Community dashboard'}</b></div></div><div className="account-access-note"><ShieldCheck size={15}/><span>Dashboard access is based on your signed-in account.</span></div></section></div>;

}

function AboutPanel() { return <section className="feature-panel about-panel"><span className="eyebrow dark-eyebrow">ABOUT POTHOLEVISION</span><h2>Helping communities find and fix potholes.</h2><p>PotholeVision helps people report potholes and road damage. View reported locations on the map, analyze road photos with AI, and follow repair progress.</p><div className="about-capabilities"><div><Camera size={18}/><b>Detect</b><small>Analyze road images</small></div><div><MapPinned size={18}/><b>Locate</b><small>View potholes on the map</small></div><div><Wrench size={18}/><b>Track</b><small>Follow repair progress</small></div></div></section>; }

function App() {

  const [user,setUser]=useState(()=>{const token=sessionStorage.getItem('pv_token');if(!token)return null;try{return JSON.parse(sessionStorage.getItem('pv_user')||'{"email":"Operator"}')}catch{return {email:'Operator'}}});

  const [authChecking,setAuthChecking]=useState(()=>Boolean(sessionStorage.getItem('pv_token')));

  const [themePreference,setThemePreference]=useState(()=>localStorage.getItem('pv_theme')||'system');

  const [systemDark,setSystemDark]=useState(()=>window.matchMedia?.('(prefers-color-scheme: dark)').matches||false);

  useEffect(()=>{localStorage.setItem('pv_theme',themePreference);const media=window.matchMedia?.('(prefers-color-scheme: dark)');if(!media)return;const update=event=>setSystemDark(event.matches);setSystemDark(media.matches);media.addEventListener?.('change',update);return()=>media.removeEventListener?.('change',update)},[themePreference]);


  useEffect(()=>{if(!sessionStorage.getItem('pv_token'))return;request('/auth/me').then(profile=>{if(sessionStorage.getItem('pv_dashboard_mode')==='citizen')profile.role='CITIZEN';sessionStorage.setItem('pv_user',JSON.stringify(profile));setUser(profile)}).catch(error=>{if(error.message.includes('HTTP 401')){sessionStorage.removeItem('pv_token');sessionStorage.removeItem('pv_user');setUser(null)}}).finally(()=>setAuthChecking(false))},[]);

  const theme=themePreference==='system'?(systemDark?'dark':'light'):themePreference;

  function logout(){['pv_token','pv_user','pv_citizen_token','pv_citizen_user','pv_official_token','pv_official_user','pv_dashboard_mode'].forEach(key=>sessionStorage.removeItem(key));setUser(null)}

  if(authChecking)return <main className="session-loading"><Brand/><span>Checking your accountâ€¦</span></main>;

  return user?<Dashboard user={user} onLogout={logout} onUserUpdate={setUser} theme={theme} themePreference={themePreference} onThemeChange={setThemePreference}/>:<Login onLogin={setUser}/>;

}



createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
