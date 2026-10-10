/* ══════════════════════════════════════════════════════════════
   ResumeAI — AI Resume Builder (new, standalone page)
   Plain JS, no build step — mirrors the coding style of app.js.
   This file is completely independent: it does not read, call, or
   modify anything in app.js. The only connection point to the rest
   of the app is the "handoff" written to localStorage, which
   index.html's small bridging script picks up to run the EXISTING
   analysis pipeline (see index.html, bottom of file).
   ══════════════════════════════════════════════════════════════ */

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

window.addEventListener('error', (e) => {
  console.error('Uncaught error:', e.error || e.message);
  try { toast('⚠️ Something broke: ' + (e.message || 'unknown error') + ' — check console (F12).', 'err'); } catch (_) {}
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
  try { toast('⚠️ Something broke: ' + (e.reason?.message || e.reason || 'unknown error') + ' — check console (F12).', 'err'); } catch (_) {}
});

function toast(msg, type = 'ok') {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const d = document.createElement('div');
  d.className = 'toast ' + type;
  d.innerHTML = `<span>${type === 'ok' ? '✅' : '❌'}</span><span>${msg}</span>`;
  document.body.appendChild(d);
  setTimeout(() => { try { d.remove(); } catch (e) {} }, 4500);
}

/* ── Builder state ── */
function rbBlankState() {
  return {
    personal: { name: '', email: '', phone: '', address: '', dob: '', gradYear: '', linkedin: '', github: '', portfolio: '' },
    branch: '',
    targetRole: '',
    summary: '',
    education: [{ degree: '', institution: '', year: '', cgpa: '' }],
    academics: { ssc: '', inter: '', awards: '', backlogs: '' },
    skills: [],
    softSkills: [],
    codingProfiles: { leetcode: '', gfg: '', hackerrank: '', codechef: '', codeforces: '' },
    projects: [{ title: '', description: '', tech: [], github: '', demo: '', currentTech: '', updatedTech: '' }],
    experience: [],
    certifications: [],
    achievements: [],
    languages: [],
    interests: [],
  };
}

/* Branch options + branch-wise ATS keyword hints (used for career-objective
   generation and quick-fill suggestions — mirrors the master prompt's
   branch-wise keyword lists). */
const RB_BRANCHES = {
  'CSE': 'Java, Python, C++, DSA, OOP, DBMS, SQL, Operating Systems, Computer Networks, Spring Boot, React, REST APIs, Git, Linux, Cloud, Microservices, Agile',
  'CSE (AI & ML)': 'Machine Learning, Deep Learning, TensorFlow, PyTorch, NLP, Computer Vision, LLM, Generative AI, Prompt Engineering, LangChain, RAG, MLOps, Pandas, NumPy, Scikit-learn',
  'CSE (Data Science)': 'Python, SQL, Statistics, Data Analytics, Power BI, Tableau, Excel, Pandas, NumPy, Predictive Analytics, Feature Engineering, Data Visualization',
  'ECE': 'Embedded Systems, Microcontrollers, ARM, Arduino, IoT, MATLAB, Verilog, FPGA, VLSI, Digital Electronics, Analog Electronics, Communication Systems, Signal Processing, Keil, Proteus',
  'Mechanical': 'AutoCAD, SolidWorks, CATIA, ANSYS, CAD/CAM, Thermodynamics, Fluid Mechanics, Machine Design, Manufacturing Processes, Robotics, CNC, GD&T, Six Sigma, Product Design, MATLAB',
};

const RB = {
  step: 1,
  data: rbBlankState(),
  finalized: null,   // AI-completed resume, filled after "Generate"
  template: 'modern',
};

const RB_STEPS = [
  { n: 1, title: 'Personal Information', sub: 'How recruiters can reach you.' },
  { n: 2, title: 'Professional Summary', sub: "Leave it blank and AI will write one for you." },
  { n: 3, title: 'Education', sub: 'Add every degree or program you want listed.' },
  { n: 4, title: 'Skills', sub: 'Leave it blank and AI will recommend skills for your target role.' },
  { n: 5, title: 'Coding Profiles', sub: 'Optional — link your competitive programming profiles.' },
  { n: 6, title: 'Projects', sub: 'Only have a title? AI will write the description.' },
  { n: 7, title: 'Internships', sub: 'Optional — no internship is fine, AI builds a fresher-friendly resume.' },
  { n: 8, title: 'Certifications', sub: 'Any courses, licenses, or certificates.' },
  { n: 9, title: 'Achievements', sub: 'Optional — awards, honors, competition wins.' },
  { n: 10, title: 'Languages', sub: 'Languages you can work in.' },
  { n: 11, title: 'Interests', sub: 'Optional — a few personal interests.' },
];
const RB_TOTAL_STEPS = RB_STEPS.length;

/* ══════════════════════════════════════════
   Sidebar + progress + step navigation
   ══════════════════════════════════════════ */
function rbRenderSidenav() {
  const nav = $('rb-sidenav');
  const items = RB_STEPS.map((s) => {
    const done = rbStepHasContent(s.n) && s.n !== RB.step;
    return `<div class="nitem ${s.n === RB.step ? 'on' : ''} ${done ? 'rb-done' : ''}" onclick="rbGoToStep(${s.n})">
      <span class="rb-step-num">${done ? '✓' : s.n}</span>${esc(s.title)}
    </div>`;
  }).join('');
  nav.innerHTML = `<div class="sbsec">${RB_TOTAL_STEPS} Steps</div>${items}
    <div class="sbsec">Finish</div>
    <div class="nitem ${RB.step === 'result' ? 'on' : ''}" onclick="rbTryGenerate()"><span class="rb-step-num"></span>Review &amp; Generate</div>`;

  const sel = $('rb-mobile-step');
  sel.innerHTML = RB_STEPS.map((s) => `<option value="${s.n}" ${s.n === RB.step ? 'selected' : ''}>Step ${s.n}: ${esc(s.title)}</option>`).join('');
}

function rbStepHasContent(n) {
  const d = RB.data;
  switch (n) {
    case 1: return !!(d.personal.name && d.personal.email);
    case 2: return !!d.summary;
    case 3: return d.education.some((e) => e.degree || e.institution);
    case 4: return d.skills.length > 0;
    case 5: return Object.values(d.codingProfiles || {}).some(Boolean);
    case 6: return d.projects.some((p) => p.title);
    case 7: return d.experience.length > 0;
    case 8: return d.certifications.length > 0;
    case 9: return d.achievements.length > 0;
    case 10: return d.languages.length > 0;
    case 11: return d.interests.length > 0;
    default: return false;
  }
}

function rbUpdateProgress() {
  const pct = Math.round((RB.step / RB_TOTAL_STEPS) * 100);
  $('rb-progress-label').textContent = `Step ${RB.step} of ${RB_TOTAL_STEPS}`;
  $('rb-progress-pct').textContent = pct + '%';
  $('rb-progress-fill').style.width = pct + '%';
  $('rb-back-btn').disabled = RB.step === 1;
  $('rb-next-btn').textContent = RB.step === RB_TOTAL_STEPS ? 'Review & Generate' : 'Next →';
}

function rbGoToStep(n) {
  if (n < 1 || n > RB_TOTAL_STEPS) return;
  $('rb-result').style.display = 'none';
  $('rb-wizard').style.display = 'block';
  RB.step = n;
  rbRenderStep();
}
function rbNextStep() {
  if (RB.step === 1 && !rbValidateStep1()) return;
  if (RB.step < RB_TOTAL_STEPS) { RB.step++; rbRenderStep(); }
  else { rbTryGenerate(); }
}
function rbPrevStep() { if (RB.step > 1) { RB.step--; rbRenderStep(); } }

function rbValidateStep1() {
  if (!RB.data.personal.name.trim() || !RB.data.personal.email.trim()) {
    toast('Please enter at least your name and email to continue.', 'err');
    return false;
  }
  return true;
}

function rbRenderStep() {
  const meta = RB_STEPS[RB.step - 1];
  const renderers = {
    1: rbRenderStep1, 2: rbRenderStep2, 3: rbRenderStep3, 4: rbRenderStep4, 5: rbRenderStep5,
    6: rbRenderStep6, 7: rbRenderStep7, 8: rbRenderStep8, 9: rbRenderStep9, 10: rbRenderStep10,
    11: rbRenderStep11,
  };
  $('rb-step-body').innerHTML = `
    <div class="rb-step-title">${esc(meta.title)}</div>
    <div class="rb-step-sub">${esc(meta.sub)}</div>
    ${renderers[RB.step]()}
  `;
  rbUpdateProgress();
  rbRenderSidenav();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ══════════════════════════════════════════
   STEP 1 — Personal Information
   ══════════════════════════════════════════ */
function rbRenderStep1() {
  const p = RB.data.personal;
  const f = (key, label, type = 'text', placeholder = '', optional = false) => `
    <div class="rb-fg">
      <label>${label}${optional ? ' <span class="rb-optional">(optional)</span>' : ''}</label>
      <input type="${type}" value="${esc(p[key])}" placeholder="${esc(placeholder)}"
        oninput="RB.data.personal.${key}=this.value">
    </div>`;
  const linkedinWarn = p.linkedin && !rbIsValidUrl(p.linkedin, 'linkedin.com') ? '<div class="rb-field-warn">⚠️ Doesn\'t look like a linkedin.com URL — double check it.</div>' : '';
  const githubWarn = p.github && !rbIsValidUrl(p.github, 'github.com') ? '<div class="rb-field-warn">⚠️ Doesn\'t look like a github.com URL — double check it.</div>' : '';
  const branchOptions = Object.keys(RB_BRANCHES).map((b) => `<option value="${esc(b)}" ${RB.data.branch === b ? 'selected' : ''}>${esc(b)}</option>`).join('');
  return `
    <div class="rb-grid2">
      ${f('name', 'Full Name', 'text', 'e.g. Priya Sharma')}
      ${f('email', 'Email', 'email', 'you@example.com')}
      ${f('phone', 'Phone', 'tel', '+91 98765 43210', true)}
      ${f('address', 'Address / Location', 'text', 'City, Country', true)}
      ${f('gradYear', 'Graduation Year', 'text', 'e.g. 2026', true)}
      ${f('dob', 'Date of Birth', 'date', '', true)}
    </div>
    <div class="rb-grid2">
      <div class="rb-fg">${f('linkedin', 'LinkedIn URL', 'url', 'linkedin.com/in/you', true)}${linkedinWarn}</div>
      <div class="rb-fg">${f('github', 'GitHub URL', 'url', 'github.com/you', true)}${githubWarn}</div>
    </div>
    ${f('portfolio', 'Portfolio Website / Personal Website', 'url', 'you.dev', true)}
    <div class="rb-fg">
      <label>Branch <span class="rb-optional">(used to tailor keywords &amp; career objective)</span></label>
      <select onchange="RB.data.branch=this.value">
        <option value="">Select your branch…</option>
        ${branchOptions}
      </select>
    </div>
    <div class="rb-fg">
      <label>Target Job Role <span class="rb-optional">(helps AI personalize everything below)</span></label>
      <input type="text" value="${esc(RB.data.targetRole)}" placeholder="e.g. Frontend Developer"
        oninput="RB.data.targetRole=this.value">
    </div>
  `;
}

/* Very light client-side URL sanity check — just flags an obvious mismatch,
   never blocks submission (some students may legitimately paste a shortened
   or custom-domain link). */
function rbIsValidUrl(value, expectedHost) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return true;
  return v.includes(expectedHost);
}

/* ══════════════════════════════════════════
   STEP 2 — Professional Summary
   ══════════════════════════════════════════ */
function rbRenderStep2() {
  return `
    <div class="rb-ai-hint"><span>💡</span>Leave this blank and click Next — AI will generate a professional summary from your other answers when you finish the form.</div>
    <div class="rb-fg">
      <label>Professional Summary <span class="rb-optional">(optional)</span></label>
      <textarea placeholder="2-3 sentences summarizing your experience and strengths…" oninput="RB.data.summary=this.value">${esc(RB.data.summary)}</textarea>
    </div>
    <button class="rb-ai-btn" id="rb-sum-ai-btn" onclick="rbAiGenerateSummary()">Generate with AI now</button>
  `;
}
async function rbAiGenerateSummary() {
  const btn = $('rb-sum-ai-btn');
  btn.disabled = true; btn.textContent = 'Generating…';
  try {
    const res = await fetch('/api/builder/generate-summary', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: RB.data.personal.name, targetRole: RB.data.targetRole, skills: RB.data.skills,
        education: RB.data.education, experience: RB.data.experience, projects: RB.data.projects,
      }),
    });
    if (!res.ok) throw new Error('Request failed: ' + res.status);
    const out = await res.json();
    RB.data.summary = out.summary || RB.data.summary;
    rbRenderStep();
    toast('✅ Summary generated!', 'ok');
  } catch (err) {
    console.error(err);
    toast('Could not generate a summary right now. You can still write one manually.', 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Generate with AI now'; }
  }
}

/* ══════════════════════════════════════════
   STEP 3 — Education (repeatable)
   ══════════════════════════════════════════ */
function rbRenderStep3() {
  const rows = RB.data.education.map((e, i) => `
    <div class="rb-entry">
      <div class="rb-entry-head">
        <span class="rb-entry-tag">Education ${i + 1}</span>
        ${RB.data.education.length > 1 ? `<button class="rb-entry-remove" onclick="rbRemoveEntry('education',${i})">✕</button>` : ''}
      </div>
      <div class="rb-grid2">
        <div class="rb-fg"><label>Degree</label><input value="${esc(e.degree)}" placeholder="B.Tech in Computer Science" oninput="RB.data.education[${i}].degree=this.value"></div>
        <div class="rb-fg"><label>Institution</label><input value="${esc(e.institution)}" placeholder="XYZ University" oninput="RB.data.education[${i}].institution=this.value"></div>
        <div class="rb-fg"><label>Year</label><input value="${esc(e.year)}" placeholder="2021 – 2025" oninput="RB.data.education[${i}].year=this.value"></div>
        <div class="rb-fg"><label>CGPA / Grade <span class="rb-optional">(optional)</span></label><input value="${esc(e.cgpa)}" placeholder="8.7 / 10" oninput="RB.data.education[${i}].cgpa=this.value"></div>
      </div>
    </div>`).join('');
  const a = RB.data.academics;
  return `${rows}<button class="rb-add-btn" onclick="rbAddEntry('education',{degree:'',institution:'',year:'',cgpa:''})">+ Add Another Education</button>
    <div class="rb-entry" style="margin-top:16px">
      <div class="rb-entry-head"><span class="rb-entry-tag">Academic Background <span class="rb-optional">(optional)</span></span></div>
      <div class="rb-grid2">
        <div class="rb-fg"><label>Intermediate / Diploma %</label><input value="${esc(a.inter)}" placeholder="e.g. 92%" oninput="RB.data.academics.inter=this.value"></div>
        <div class="rb-fg"><label>SSC / 10th %</label><input value="${esc(a.ssc)}" placeholder="e.g. 9.5 CGPA" oninput="RB.data.academics.ssc=this.value"></div>
      </div>
      <div class="rb-fg"><label>Academic Awards <span class="rb-optional">(optional)</span></label><input value="${esc(a.awards)}" placeholder="e.g. University Topper, Merit Scholarship" oninput="RB.data.academics.awards=this.value"></div>
      <div class="rb-fg"><label>Active Backlogs <span class="rb-optional">(optional — leave blank if none)</span></label><input value="${esc(a.backlogs)}" placeholder="e.g. 0" oninput="RB.data.academics.backlogs=this.value"></div>
    </div>`;
}

/* ══════════════════════════════════════════
   STEP 4 — Skills (chip input)
   ══════════════════════════════════════════ */
function rbRenderStep4() {
  return `
    <div class="rb-ai-hint"><span>💡</span>Leave this empty and AI will recommend skills based on your target role once you finish the form — or click below to get suggestions right now.</div>
    <div class="rb-fg"><label>Technical Skills</label></div>
    ${rbChipEditor('skills', 'e.g. Python, React, SQL…')}
    <button class="rb-ai-btn" id="rb-skills-ai-btn" onclick="rbAiRecommendSkills()">Recommend skills for my target role</button>
    <div class="rb-fg" style="margin-top:18px"><label>Soft Skills <span class="rb-optional">(auto-generated from your profile — edit freely)</span></label></div>
    ${rbChipEditor('softSkills', 'e.g. Communication, Leadership…')}
    <button class="rb-ai-btn" id="rb-soft-ai-btn" onclick="rbAiRecommendSoftSkills()">Auto-generate soft skills</button>
  `;
}
async function rbAiRecommendSoftSkills() {
  const btn = $('rb-soft-ai-btn');
  btn.disabled = true; btn.textContent = 'Thinking…';
  try {
    const res = await fetch('/api/builder/recommend-soft-skills', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetRole: RB.data.targetRole, branch: RB.data.branch, achievements: RB.data.achievements }),
    });
    if (!res.ok) throw new Error('Request failed: ' + res.status);
    const out = await res.json();
    (out.softSkills || []).forEach((s) => { if (s && !RB.data.softSkills.includes(s)) RB.data.softSkills.push(s); });
    rbRenderStep();
    toast('✅ Soft skills added — remove any that don\'t fit.', 'ok');
  } catch (err) {
    console.error(err);
    toast('Could not generate soft skills right now.', 'err');
  } finally {
    const b = $('rb-soft-ai-btn');
    if (b) { b.disabled = false; b.textContent = 'Auto-generate soft skills'; }
  }
}
async function rbAiRecommendSkills() {
  if (!RB.data.targetRole.trim()) { toast('Add a target job role in Step 1 first, so AI knows what to recommend.', 'err'); return; }
  const btn = $('rb-skills-ai-btn');
  btn.disabled = true; btn.textContent = 'Thinking…';
  try {
    const res = await fetch('/api/builder/recommend-skills', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetRole: RB.data.targetRole, existingSkills: RB.data.skills }),
    });
    if (!res.ok) throw new Error('Request failed: ' + res.status);
    const out = await res.json();
    (out.skills || []).forEach((s) => { if (s && !RB.data.skills.includes(s)) RB.data.skills.push(s); });
    rbRenderStep();
    toast('✅ Skill suggestions added — remove any that don\'t fit.', 'ok');
  } catch (err) {
    console.error(err);
    toast('Could not fetch skill suggestions right now.', 'err');
  } finally {
    const b = $('rb-skills-ai-btn');
    if (b) { b.disabled = false; b.textContent = 'Recommend skills for my target role'; }
  }
}

/* Generic chip-list editor used for skills / achievements / languages / interests */
function rbChipEditor(field, placeholder) {
  const chips = RB.data[field].map((v, i) => `<span class="rb-chip">${esc(v)}<button onclick="rbRemoveChip('${field}',${i})">✕</button></span>`).join('');
  return `
    <div class="rb-chipbar">
      <input type="text" id="rb-chip-input-${field}" placeholder="${esc(placeholder)}"
        onkeydown="if(event.key==='Enter'){event.preventDefault();rbAddChipFromInput('${field}')}">
      <button class="rb-btn rb-btn-out" style="padding:11px 16px" onclick="rbAddChipFromInput('${field}')">+ Add</button>
    </div>
    <div class="rb-chips" id="rb-chips-${field}">${chips || '<span class="rb-empty-note">Nothing added yet.</span>'}</div>
  `;
}
function rbAddChipFromInput(field) {
  const inp = $('rb-chip-input-' + field);
  const val = (inp.value || '').trim();
  if (!val) return;
  val.split(',').map((v) => v.trim()).filter(Boolean).forEach((v) => {
    if (!RB.data[field].includes(v)) RB.data[field].push(v);
  });
  inp.value = '';
  rbRenderStep();
  setTimeout(() => { const el = $('rb-chip-input-' + field); if (el) el.focus(); }, 0);
}
function rbRemoveChip(field, i) { RB.data[field].splice(i, 1); rbRenderStep(); }

/* ══════════════════════════════════════════
   STEP 5 — Coding Profiles
   ══════════════════════════════════════════ */
function rbCodingMilestone(count) {
  const n = parseInt(String(count).replace(/\D/g, ''), 10);
  if (!n) return '';
  const tier = n >= 700 ? '700+' : n >= 500 ? '500+' : n >= 200 ? '200+' : n >= 100 ? '100+' : '';
  return tier ? `<span class="rb-milestone">🏅 ${tier} problems</span>` : '';
}
function rbRenderStep5() {
  const cp = RB.data.codingProfiles;
  const row = (key, label, placeholder) => `
    <div class="rb-fg">
      <label>${label} <span class="rb-optional">(profile URL or problems solved)</span></label>
      <input value="${esc(cp[key])}" placeholder="${esc(placeholder)}" oninput="RB.data.codingProfiles.${key}=this.value">
      ${rbCodingMilestone(cp[key])}
    </div>`;
  return `
    <div class="rb-ai-hint"><span>💡</span>Paste a profile URL, or just the number of problems solved (e.g. "350+") — either works.</div>
    <div class="rb-grid2">
      ${row('leetcode', 'LeetCode', 'leetcode.com/you or 350+')}
      ${row('gfg', 'GeeksforGeeks', 'geeksforgeeks.org/user/you')}
      ${row('hackerrank', 'HackerRank', 'hackerrank.com/you')}
      ${row('codechef', 'CodeChef', 'codechef.com/users/you')}
    </div>
    ${row('codeforces', 'Codeforces', 'codeforces.com/profile/you')}
  `;
}

/* ══════════════════════════════════════════
   STEP 6 — Projects (repeatable + AI description)
   ══════════════════════════════════════════ */
function rbRenderStep6() {
  const rows = RB.data.projects.map((p, i) => `
    <div class="rb-entry">
      <div class="rb-entry-head">
        <span class="rb-entry-tag">Project ${i + 1}</span>
        ${RB.data.projects.length > 1 ? `<button class="rb-entry-remove" onclick="rbRemoveEntry('projects',${i})">✕</button>` : ''}
      </div>
      <div class="rb-fg"><label>Project Title</label><input value="${esc(p.title)}" placeholder="e.g. E-Commerce Recommendation Engine" oninput="RB.data.projects[${i}].title=this.value"></div>
      <div class="rb-fg">
        <label>Description <span class="rb-optional">(only a title? AI will write this)</span></label>
        <textarea placeholder="What did you build, and what did you use?" oninput="RB.data.projects[${i}].description=this.value">${esc(p.description)}</textarea>
      </div>
      <div class="rb-fg"><label>Tech Used <span class="rb-optional">(comma separated, optional)</span></label>
        <input value="${esc((p.tech || []).join(', '))}" placeholder="React, Node.js, MongoDB" oninput="RB.data.projects[${i}].tech=this.value.split(',').map(s=>s.trim()).filter(Boolean)"></div>
      <div class="rb-grid2">
        <div class="rb-fg"><label>GitHub Link <span class="rb-optional">(optional)</span></label><input value="${esc(p.github || '')}" placeholder="github.com/you/project" oninput="RB.data.projects[${i}].github=this.value"></div>
        <div class="rb-fg"><label>Live Demo Link <span class="rb-optional">(optional)</span></label><input value="${esc(p.demo || '')}" placeholder="project-demo.vercel.app" oninput="RB.data.projects[${i}].demo=this.value"></div>
      </div>
      <div class="rb-grid2">
        <div class="rb-fg"><label>Current Tech / Version <span class="rb-optional">(optional)</span></label><input value="${esc(p.currentTech || '')}" placeholder="e.g. React 17, Node 16" oninput="RB.data.projects[${i}].currentTech=this.value"></div>
        <div class="rb-fg"><label>Updated / New Tech / Version <span class="rb-optional">(optional)</span></label><input value="${esc(p.updatedTech || '')}" placeholder="e.g. React 18, Node 20" oninput="RB.data.projects[${i}].updatedTech=this.value"></div>
      </div>
      <button class="rb-ai-btn" onclick="rbAiGenerateProject(${i})" id="rb-proj-ai-btn-${i}">Write description with AI</button>
    </div>`).join('');
  return `${rows}<button class="rb-add-btn" onclick="rbAddEntry('projects',{title:'',description:'',tech:[],github:'',demo:'',currentTech:'',updatedTech:''})">+ Add Another Project</button>`;
}
async function rbAiGenerateProject(i) {
  const p = RB.data.projects[i];
  if (!p.title.trim()) { toast('Add a project title first — AI needs something to work with.', 'err'); return; }
  const btn = $('rb-proj-ai-btn-' + i);
  btn.disabled = true; btn.textContent = 'Writing…';
  try {
    const res = await fetch('/api/builder/generate-project-description', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: p.title, targetRole: RB.data.targetRole, skills: RB.data.skills }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || out.detail || ('Request failed: ' + res.status));
    const bulletText = (out.bullets || []).map((b) => '• ' + b).join('\n');
    RB.data.projects[i].description = [out.description, bulletText].filter(Boolean).join('\n');
    if (out.tech && out.tech.length && !p.tech.length) RB.data.projects[i].tech = out.tech;
    rbRenderStep();
    toast('✅ Project description generated!', 'ok');
  } catch (err) {
    console.error(err);
    toast(err.message ? ('Could not generate a description: ' + err.message) : 'Could not generate a description right now.', 'err');
  } finally {
    const b = $('rb-proj-ai-btn-' + i);
    if (b) { b.disabled = false; b.textContent = 'Write description with AI'; }
  }
}

/* ══════════════════════════════════════════
   STEP 7 — Internships (optional, repeatable + AI bullets)
   ══════════════════════════════════════════ */
const RB_EXP_BLANK = { company: '', role: '', type: 'Offline', category: 'Industry', location: '', startDate: '', endDate: '', duration: '', technologies: '', department: '', description: '' };
const RB_EXP_GUIDE_QS = [
  'What technologies did you use?', 'What was your contribution?', 'What problem did you solve?',
  'Did you develop software?', 'Did you analyze data?', 'Did you build machine learning models?',
  'Did you use Git?', 'Did you work with APIs?', 'Did you work in Agile/Scrum?', 'Did you collaborate with a team?',
];
function rbRenderStep7() {
  const importBtn = `<button class="rb-ai-btn" style="margin-bottom:12px" onclick="rbOpenDocModal()">📄 Import from Certificate / Offer Letter / Report</button>`;
  if (RB.data.experience.length === 0) {
    return `
      <div class="rb-ai-hint"><span>💡</span>No internship yet? That's completely fine — leave this empty and AI will build a strong, fresher-friendly resume from your education, skills, and projects instead. Consider platforms like Internshala, LinkedIn, or AICTE Internship Portal, or showcase strong academic/personal projects instead.</div>
      ${importBtn}
      <button class="rb-add-btn" onclick="rbAddEntry('experience',${JSON.stringify(RB_EXP_BLANK)})">+ Add Internship / Work Experience</button>
    `;
  }
  const rows = importBtn + RB.data.experience.map((e, i) => `
    <div class="rb-entry">
      <div class="rb-entry-head">
        <span class="rb-entry-tag">Internship ${i + 1}</span>
        <button class="rb-entry-remove" onclick="rbRemoveEntry('experience',${i})">✕</button>
      </div>
      <div class="rb-grid2">
        <div class="rb-fg"><label>Company Name</label><input value="${esc(e.company)}" placeholder="Acme Corp" oninput="RB.data.experience[${i}].company=this.value"></div>
        <div class="rb-fg"><label>Role / Title</label><input value="${esc(e.role)}" placeholder="Software Engineer Intern" oninput="RB.data.experience[${i}].role=this.value"></div>
      </div>
      <div class="rb-grid2">
        <div class="rb-fg"><label>Internship Type</label>
          <select onchange="RB.data.experience[${i}].type=this.value">
            ${['Offline', 'Virtual', 'Hybrid'].map((t) => `<option value="${t}" ${e.type === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="rb-fg"><label>Category</label>
          <select onchange="RB.data.experience[${i}].category=this.value">
            ${['Industry', 'Startup', 'Research', 'Government', 'College', 'Virtual', 'Open Source', 'Freelance'].map((t) => `<option value="${t}" ${e.category === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="rb-grid2">
        <div class="rb-fg"><label>Start Date</label><input type="month" value="${esc(e.startDate)}" oninput="RB.data.experience[${i}].startDate=this.value"></div>
        <div class="rb-fg"><label>End Date</label><input type="month" value="${esc(e.endDate)}" oninput="RB.data.experience[${i}].endDate=this.value"></div>
      </div>
      <div class="rb-grid2">
        <div class="rb-fg"><label>Location <span class="rb-optional">(optional)</span></label><input value="${esc(e.location)}" placeholder="Hyderabad, India" oninput="RB.data.experience[${i}].location=this.value"></div>
        <div class="rb-fg"><label>Department <span class="rb-optional">(optional)</span></label><input value="${esc(e.department)}" placeholder="Engineering" oninput="RB.data.experience[${i}].department=this.value"></div>
      </div>
      <div class="rb-fg"><label>Duration <span class="rb-optional">(shown on resume, e.g. "Jun 2024 – Aug 2024")</span></label><input value="${esc(e.duration)}" placeholder="Jun 2024 – Aug 2024" oninput="RB.data.experience[${i}].duration=this.value"></div>
      <div class="rb-fg"><label>Technologies Used <span class="rb-optional">(optional)</span></label><input value="${esc(e.technologies)}" placeholder="Python, Django, PostgreSQL" oninput="RB.data.experience[${i}].technologies=this.value"></div>
      <div class="rb-fg">
        <label>What did you do? <span class="rb-optional">(optional — AI can write ATS-friendly bullet points)</span></label>
        <textarea placeholder="Rough notes are fine…" oninput="RB.data.experience[${i}].description=this.value">${esc(e.description)}</textarea>
        <div class="rb-guide-qs">${RB_EXP_GUIDE_QS.map((q) => `<span class="rb-guide-q">${esc(q)}</span>`).join('')}</div>
      </div>
      <button class="rb-ai-btn" onclick="rbAiGenerateExperience(${i})" id="rb-exp-ai-btn-${i}">Generate ATS bullet points</button>
    </div>`).join('');
  return `${rows}<button class="rb-add-btn" onclick="rbAddEntry('experience',${JSON.stringify(RB_EXP_BLANK)})">+ Add Another Internship</button>`;
}
async function rbAiGenerateExperience(i) {
  const e = RB.data.experience[i];
  if (!e.company.trim() || !e.role.trim()) { toast('Add a company and role first.', 'err'); return; }
  const btn = $('rb-exp-ai-btn-' + i);
  btn.disabled = true; btn.textContent = 'Writing…';
  try {
    const res = await fetch('/api/builder/generate-experience-bullets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: e.company, role: e.role, duration: e.duration, technologies: e.technologies, targetRole: RB.data.targetRole }),
    });
    if (!res.ok) throw new Error('Request failed: ' + res.status);
    const out = await res.json();
    const bulletText = (out.bullets || []).map((b) => '• ' + b).join('\n');
    RB.data.experience[i].description = bulletText || e.description;
    rbRenderStep();
    toast('✅ Bullet points generated!', 'ok');
  } catch (err) {
    console.error(err);
    toast('Could not generate bullet points right now.', 'err');
  } finally {
    const b = $('rb-exp-ai-btn-' + i);
    if (b) { b.disabled = false; b.textContent = 'Generate ATS bullet points'; }
  }
}

/* ══════════════════════════════════════════
   Document Intelligence — upload internship certificate / offer letter /
   completion certificate / experience letter / internship report / project
   report, extract text client-side (same PDF.js/Mammoth pattern as the
   main dashboard upload), send the text to the AI for structured field
   extraction, let the user review/edit/confirm, then fill it into an
   Internship entry. Never auto-fills without user confirmation.
   ══════════════════════════════════════════ */
const RB_DOC_TYPES = ['Internship Certificate', 'Offer Letter', 'Completion Certificate', 'Experience Letter', 'Internship Report', 'Project Report', 'Other'];
let RB_DOC_LAST_EXTRACT = null;

function rbOpenDocModal() {
  RB_DOC_LAST_EXTRACT = null;
  $('rb-doc-modal-body').innerHTML = `
    <p style="font-size:13px;color:var(--rb-t3,#94a3b8);line-height:1.6;margin-bottom:12px">
      Upload an internship certificate, offer letter, completion certificate, experience letter, internship report, or project report (PDF or DOCX).
      We'll extract the details and let you review before anything is added to your resume — nothing is invented; fields not found in the document are marked "Not Found".
    </p>
    <input type="file" id="rb-doc-file-input" accept=".pdf,.docx" onchange="rbHandleDocFile(this)">
    <div id="rb-doc-status" style="margin-top:10px;font-size:13px;color:var(--rb-t3,#94a3b8)"></div>
    <div id="rb-doc-result"></div>
  `;
  $('rb-doc-modal').classList.add('on');
}

async function rbHandleDocFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const nm = file.name.toLowerCase();
  const isPDF = nm.endsWith('.pdf');
  const isDOCX = nm.endsWith('.docx');
  if (!isPDF && !isDOCX) { toast('Please upload a PDF or DOCX file.', 'err'); return; }

  $('rb-doc-status').textContent = `📄 Reading "${file.name}"…`;
  $('rb-doc-result').innerHTML = '';

  if (isPDF && !window['pdfjs-dist/build/pdf']) await rbWaitForGlobal(() => window['pdfjs-dist/build/pdf'], 4000);
  if (isDOCX && !window.mammoth) await rbWaitForGlobal(() => window.mammoth, 4000);

  let text = '';
  try {
    text = isPDF ? await rbReadPDF(file) : await rbReadDOCX(file);
  } catch (err) {
    console.error(err);
  }

  if (!text || text.trim().length < 20) {
    $('rb-doc-status').textContent = '⚠️ Could not extract readable text from this file. Try a clearer PDF/DOCX export, or a different file.';
    return;
  }

  $('rb-doc-status').textContent = '🤖 Extracting details with AI…';
  try {
    const res = await fetch('/api/document-extract', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, fileName: file.name }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || ('Request failed: ' + res.status)); }
    const out = await res.json();
    RB_DOC_LAST_EXTRACT = out;
    $('rb-doc-status').textContent = '';
    rbRenderDocExtractResult(out);
  } catch (err) {
    console.error(err);
    $('rb-doc-status').textContent = '⚠️ ' + (err.message || 'Could not extract details from this document right now.');
  }
}

function rbWaitForGlobal(check, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const iv = setInterval(() => { if (check() || Date.now() - start > timeoutMs) { clearInterval(iv); resolve(); } }, 150);
  });
}
async function rbReadPDF(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const lib = window['pdfjs-dist/build/pdf'];
        if (!lib) { resolve(''); return; }
        lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const pdf = await lib.getDocument({ data: new Uint8Array(e.target.result) }).promise;
        let out = '';
        for (let i = 1; i <= Math.min(pdf.numPages, 8); i++) {
          const pg = await pdf.getPage(i);
          const ct = await pg.getTextContent();
          out += ct.items.map((x) => x.str).join(' ') + '\n';
        }
        resolve(out.trim());
      } catch (err) { console.error('PDF.js error:', err); resolve(''); }
    };
    reader.onerror = () => resolve('');
    reader.readAsArrayBuffer(file);
  });
}
async function rbReadDOCX(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        if (!window.mammoth) { resolve(''); return; }
        const r = await mammoth.extractRawText({ arrayBuffer: e.target.result });
        resolve((r.value || '').trim());
      } catch (err) { console.error('Mammoth error:', err); resolve(''); }
    };
    reader.onerror = () => resolve('');
    reader.readAsArrayBuffer(file);
  });
}

const RB_DOC_FIELD_LABELS = [
  ['companyName', 'Company Name'], ['role', 'Role'], ['internshipType', 'Internship Type'],
  ['duration', 'Duration'], ['startDate', 'Start Date'], ['endDate', 'End Date'],
  ['location', 'Location'], ['department', 'Department'], ['reportingManager', 'Reporting Manager'],
  ['companyWebsite', 'Company Website'], ['stipend', 'Stipend'],
];
const RB_DOC_LIST_FIELDS = [
  ['technologiesUsed', 'Technologies Used'], ['responsibilities', 'Responsibilities'],
  ['contributions', 'Contributions'], ['projects', 'Projects'], ['achievements', 'Achievements'],
];

function rbRenderDocExtractResult(out) {
  const targetOptions = RB.data.experience.map((e, i) => `<option value="${i}">${esc(e.company || 'Internship ' + (i + 1))}</option>`).join('');
  $('rb-doc-result').innerHTML = `
    <div class="rb-ai-hint"><span>${out.confidence === 'low' ? '⚠️' : 'ℹ️'}</span>Document type detected: <strong>${esc(out.documentType)}</strong> (confidence: ${esc(out.confidence)}). Review and edit anything below before adding it — fields the document didn't contain are marked "Not Found".</div>
    <div class="rb-grid2">
      ${RB_DOC_FIELD_LABELS.map(([key, label]) => `
        <div class="rb-fg"><label>${label}</label><input id="rb-doc-f-${key}" value="${esc(out[key])}" oninput="RB_DOC_LAST_EXTRACT['${key}']=this.value"></div>
      `).join('')}
    </div>
    ${RB_DOC_LIST_FIELDS.map(([key, label]) => `
      <div class="rb-fg"><label>${label}</label>
        <textarea id="rb-doc-f-${key}" oninput="RB_DOC_LAST_EXTRACT['${key}']=this.value.split('\\n').filter(Boolean)">${esc((out[key] || []).join('\n'))}</textarea>
      </div>
    `).join('')}
    <div id="rb-doc-consistency"></div>
    <div class="rb-grid2" style="align-items:end">
      <div class="rb-fg">
        <label>Add to</label>
        <select id="rb-doc-target">
          <option value="new">+ New Internship Entry</option>
          ${targetOptions}
        </select>
      </div>
      <button class="rb-ai-btn" onclick="rbConfirmDocExtract()">✅ Confirm &amp; Add to Resume Builder</button>
    </div>
  `;
  const sel = $('rb-doc-target');
  if (sel) sel.onchange = rbCheckDocConsistency;
  rbCheckDocConsistency();
}

/* Consistency check — no AI call needed, a simple compare against the
   selected existing internship entry's stated duration. */
function rbCheckDocConsistency() {
  const box = $('rb-doc-consistency');
  if (!box || !RB_DOC_LAST_EXTRACT) return;
  const sel = $('rb-doc-target');
  const idx = sel ? sel.value : 'new';
  if (idx === 'new') { box.innerHTML = ''; return; }
  const existing = RB.data.experience[parseInt(idx, 10)];
  const docDuration = (RB_DOC_LAST_EXTRACT.duration || '').trim();
  const resumeDuration = (existing.duration || '').trim();
  if (!existing || !resumeDuration || !docDuration || docDuration === 'Not Found') { box.innerHTML = ''; return; }
  const extractMonths = (s) => { const m = s.match(/(\d+)\s*month/i); return m ? parseInt(m[1], 10) : null; };
  const dM = extractMonths(docDuration), rM = extractMonths(resumeDuration);
  if (dM !== null && rM !== null && dM !== rM) {
    box.innerHTML = `<div class="rb-ai-hint" style="border-color:var(--rb-err,#f87171);color:var(--rb-err,#f87171)"><span>⚠️</span>Duration mismatch: the document says "${esc(docDuration)}" but this internship entry currently says "${esc(resumeDuration)}". Double-check before confirming.</div>`;
  } else if (resumeDuration.toLowerCase() !== docDuration.toLowerCase()) {
    box.innerHTML = `<div class="rb-ai-hint"><span>ℹ️</span>Note: document duration ("${esc(docDuration)}") differs in wording from the resume entry ("${esc(resumeDuration)}") — confirm this is expected.</div>`;
  } else {
    box.innerHTML = '';
  }
}

function rbConfirmDocExtract() {
  const out = RB_DOC_LAST_EXTRACT;
  if (!out) return;
  const notFound = (v) => !v || v === 'Not Found' ? '' : v;
  const sel = $('rb-doc-target');
  const idx = sel ? sel.value : 'new';
  const merged = idx === 'new' ? { ...RB_EXP_BLANK } : { ...RB.data.experience[parseInt(idx, 10)] };

  merged.company = notFound(out.companyName) || merged.company;
  merged.role = notFound(out.role) || merged.role;
  merged.type = ['Offline', 'Virtual', 'Hybrid'].includes(out.internshipType) ? out.internshipType : merged.type;
  merged.duration = notFound(out.duration) || merged.duration;
  merged.startDate = notFound(out.startDate) || merged.startDate;
  merged.endDate = notFound(out.endDate) || merged.endDate;
  merged.location = notFound(out.location) || merged.location;
  merged.department = notFound(out.department) || merged.department;
  merged.technologies = (out.technologiesUsed || []).join(', ') || merged.technologies;
  const descParts = [];
  if ((out.responsibilities || []).length) descParts.push(...out.responsibilities.map((r) => '• ' + r));
  if ((out.contributions || []).length) descParts.push(...out.contributions.map((r) => '• ' + r));
  if (descParts.length) merged.description = (merged.description ? merged.description + '\n' : '') + descParts.join('\n');

  if (idx === 'new') { RB.data.experience.push(merged); } else { RB.data.experience[parseInt(idx, 10)] = merged; }
  rbCloseModal('rb-doc-modal');
  rbRenderStep();
  toast('✅ Document details added — review the internship entry.', 'ok');
}

/* ══════════════════════════════════════════
   STEP 7 — Certifications (repeatable)
   ══════════════════════════════════════════ */
const RB_CERT_PROVIDERS = ['NPTEL', 'Coursera', 'Udemy', 'AWS', 'Microsoft', 'Cisco', 'Google', 'Oracle', 'IBM', 'NVIDIA', 'Infosys Springboard', 'Scaler', 'NxtWave'];
function rbRenderStep8() {
  const rows = RB.data.certifications.map((c, i) => `
    <div class="rb-entry">
      <div class="rb-entry-head">
        <span class="rb-entry-tag">Certification ${i + 1}</span>
        <button class="rb-entry-remove" onclick="rbRemoveEntry('certifications',${i})">✕</button>
      </div>
      <div class="rb-grid2">
        <div class="rb-fg"><label>Certificate Name</label><input value="${esc(c.name)}" placeholder="AWS Certified Cloud Practitioner" oninput="RB.data.certifications[${i}].name=this.value"></div>
        <div class="rb-fg"><label>Issuer</label><input value="${esc(c.issuer)}" placeholder="Amazon Web Services" oninput="RB.data.certifications[${i}].issuer=this.value"></div>
      </div>
      <div class="rb-quick-chips">${RB_CERT_PROVIDERS.map((pv) => `<button type="button" class="rb-quick-chip" onclick="RB.data.certifications[${i}].issuer='${esc(pv)}';rbRenderStep()">${esc(pv)}</button>`).join('')}</div>
      <div class="rb-fg"><label>Year <span class="rb-optional">(optional)</span></label><input value="${esc(c.year)}" placeholder="2025" oninput="RB.data.certifications[${i}].year=this.value"></div>
    </div>`).join('');
  return `${rows}<button class="rb-add-btn" onclick="rbAddEntry('certifications',{name:'',issuer:'',year:''})">+ Add Certification</button>`;
}

/* ══════════════════════════════════════════
   STEP 9/10/11 — Achievements / Languages / Interests (chip inputs)
   ══════════════════════════════════════════ */
function rbRenderStep9() { return rbChipEditor('achievements', 'e.g. Winner, Smart India Hackathon 2024…'); }
function rbRenderStep10() { return rbChipEditor('languages', 'e.g. English, Hindi…'); }
function rbRenderStep11() { return rbChipEditor('interests', 'e.g. Chess, Open Source, Photography…'); }

/* ── Generic add/remove for repeatable entry arrays ── */
function rbAddEntry(field, blank) { RB.data[field].push(blank); rbRenderStep(); }
function rbRemoveEntry(field, i) { RB.data[field].splice(i, 1); rbRenderStep(); }

/* ══════════════════════════════════════════
   Generate — calls /api/builder/finalize-resume, then shows preview
   ══════════════════════════════════════════ */
async function rbTryGenerate() {
  if (!rbValidateStep1()) { rbGoToStep(1); return; }
  const wizard = $('rb-wizard');
  const original = wizard.innerHTML;
  wizard.innerHTML = `<div class="rb-card" style="text-align:center;padding:60px 20px">
    <div style="font-size:40px;margin-bottom:14px">🤖</div>
    <div style="font-size:16px;font-weight:700;margin-bottom:6px">AI is building your resume…</div>
    <div style="font-size:13px;color:var(--t2)">Filling in any missing summary, skills, and bullet points.</div>
  </div>`;
  try {
    const res = await fetch('/api/builder/finalize-resume', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(RB.data),
    });
    if (!res.ok) throw new Error('Request failed: ' + res.status);
    const out = await res.json();
    RB.finalized = {
      personal: RB.data.personal,
      branch: RB.data.branch,
      targetRole: RB.data.targetRole,
      summary: out.summary || RB.data.summary,
      skills: (out.skills && out.skills.length) ? out.skills : RB.data.skills,
      softSkills: RB.data.softSkills,
      codingProfiles: RB.data.codingProfiles,
      education: RB.data.education,
      academics: RB.data.academics,
      projects: (out.projects && out.projects.length) ? out.projects : RB.data.projects,
      experience: (out.experience && out.experience.length) ? out.experience : RB.data.experience,
      certifications: RB.data.certifications,
      achievements: RB.data.achievements,
      languages: RB.data.languages,
      interests: RB.data.interests,
      resume_text: out.resume_text || rbFallbackResumeText(),
    };
    rbShowResult();
    toast('✅ Your resume is ready!', 'ok');
  } catch (err) {
    console.error(err);
    toast('AI generation failed — showing your resume built from what you entered so far.', 'err');
    RB.finalized = {
      ...RB.data,
      resume_text: rbFallbackResumeText(),
    };
    rbShowResult();
  } finally {
    wizard.innerHTML = original;
  }
}

/* Plain-text fallback if the AI finalize call fails, so the app never gets stuck */
function rbFallbackResumeText() {
  const d = RB.data;
  const lines = [];
  lines.push(d.personal.name || 'Candidate');
  lines.push([d.personal.email, d.personal.phone, d.personal.address].filter(Boolean).join(' | '));
  lines.push([d.personal.linkedin, d.personal.github, d.personal.portfolio].filter(Boolean).join(' | '));
  if (d.summary) lines.push('\nSUMMARY\n' + d.summary);
  if (d.skills.length) lines.push('\nSKILLS\n' + d.skills.join(', '));
  if (d.softSkills && d.softSkills.length) lines.push('\nSOFT SKILLS\n' + d.softSkills.join(', '));
  if (d.education.length) lines.push('\nEDUCATION\n' + d.education.map((e) => `${e.degree} — ${e.institution} (${e.year})`).join('\n'));
  if (d.projects.some((p) => p.title)) lines.push('\nPROJECTS\n' + d.projects.filter((p) => p.title).map((p) => `${p.title}: ${p.description}${p.github ? '\nGitHub: ' + p.github : ''}${p.demo ? '\nDemo: ' + p.demo : ''}${p.currentTech ? '\nCurrent Tech/Version: ' + p.currentTech : ''}${p.updatedTech ? '\nUpdated Tech/Version: ' + p.updatedTech : ''}`).join('\n'));
  if (d.experience.length) lines.push('\nINTERNSHIPS\n' + d.experience.map((e) => `${e.role} — ${e.company} (${e.duration})${e.technologies ? '\nTech: ' + e.technologies : ''}\n${e.description}`).join('\n'));
  if (d.certifications.length) lines.push('\nCERTIFICATIONS\n' + d.certifications.map((c) => `${c.name} — ${c.issuer} (${c.year})`).join('\n'));
  const cp = d.codingProfiles || {};
  const cpBits = Object.entries(cp).filter(([, v]) => v).map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`);
  if (cpBits.length) lines.push('\nCODING PROFILES\n' + cpBits.join('\n'));
  if (d.achievements.length) lines.push('\nACHIEVEMENTS\n' + d.achievements.join(', '));
  if (d.languages.length) lines.push('\nLANGUAGES\n' + d.languages.join(', '));
  if (d.interests.length) lines.push('\nINTERESTS\n' + d.interests.join(', '));
  return lines.join('\n');
}

/* Strict ATS plain-text version: no emojis/icons, single column, uppercase
   section headers only — matches the master prompt's "ATS Text Version"
   export option. */
function rbAtsTextVersion() {
  return rbFallbackResumeText()
    .replace(/[^\x00-\x7F]/g, '')   // strip emoji/non-ASCII glyphs
    .replace(/[•\-]\s+/g, '- ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function rbEditResume() { $('rb-result').style.display = 'none'; $('rb-wizard').style.display = 'block'; rbGoToStep(1); }

/* ══════════════════════════════════════════
   Result screen: template picker + live preview
   ══════════════════════════════════════════ */
function rbShowResult() {
  $('rb-wizard').style.display = 'none';
  $('rb-result').style.display = 'block';
  RB.step = 'result';
  rbRenderSidenav();
  rbSelectTemplate(RB.template);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function rbSelectTemplate(tpl) {
  RB.template = tpl;
  document.querySelectorAll('.rb-tpl-card').forEach((c) => c.classList.toggle('on', c.dataset.tpl === tpl));
  $('rb-preview-body').innerHTML = rbRenderDoc(RB.finalized, tpl);
}

function rbBullets(text) {
  if (!text) return [];
  return String(text).split('\n').map((l) => l.replace(/^[•\-\*]\s*/, '').trim()).filter(Boolean);
}

/* Single shared markup builder — the 3 "templates" are really the same
   semantic structure with different CSS skins (.rb-tpl-modern /
   .rb-tpl-professional / .rb-tpl-minimal), which keeps this both simple
   and easy to extend with more templates later without duplicating markup. */
function rbRenderDoc(d, tpl) {
  if (!d) return '';
  const p = d.personal || {};
  const contactBits = [
    p.email && `📧 ${esc(p.email)}`, p.phone && `📱 ${esc(p.phone)}`, p.address && `📍 ${esc(p.address)}`,
    p.linkedin && `🔗 ${esc(p.linkedin)}`, p.github && `💻 ${esc(p.github)}`, p.portfolio && `🌐 ${esc(p.portfolio)}`,
  ].filter(Boolean).map((c) => `<span>${c}</span>`).join('');

  const header = `
    <h1 class="rb-doc-name">${esc(p.name) || 'Your Name'}</h1>
    ${d.targetRole ? `<div class="rb-doc-role">${esc(d.targetRole)}</div>` : ''}
    <div class="rb-doc-contact">${contactBits}</div>`;

  const summarySec = d.summary ? `<h2 class="rb-doc-sec">Professional Summary</h2><p>${esc(d.summary)}</p>` : '';

  const skillsSec = (d.skills || []).length ? `<h2 class="rb-doc-sec">Skills</h2>
    <div class="rb-doc-chips">${d.skills.map((s) => `<span class="rb-doc-chip">${esc(s)}</span>`).join('')}</div>` : '';

  const softSkillsSec = (d.softSkills || []).length ? `<h2 class="rb-doc-sec">Soft Skills</h2>
    <div class="rb-doc-chips">${d.softSkills.map((s) => `<span class="rb-doc-chip">${esc(s)}</span>`).join('')}</div>` : '';

  const a = d.academics || {};
  const eduSec = (d.education || []).some((e) => e.degree || e.institution) ? `<h2 class="rb-doc-sec">Education</h2>
    ${d.education.filter((e) => e.degree || e.institution).map((e) => `
      <div class="rb-doc-item">
        <div class="rb-doc-item-top"><span>${esc(e.degree)}</span><span>${esc(e.year)}</span></div>
        <div class="rb-doc-item-sub">${esc(e.institution)}${e.cgpa ? ' · ' + esc(e.cgpa) : ''}</div>
      </div>`).join('')}
    ${(a.inter || a.ssc) ? `<div class="rb-doc-item">${a.inter ? `<div class="rb-doc-item-sub">Intermediate / Diploma: ${esc(a.inter)}</div>` : ''}${a.ssc ? `<div class="rb-doc-item-sub">SSC: ${esc(a.ssc)}</div>` : ''}</div>` : ''}
    ${a.awards ? `<div class="rb-doc-item-sub">Awards: ${esc(a.awards)}</div>` : ''}` : '';

  const projSec = (d.projects || []).some((p2) => p2.title) ? `<h2 class="rb-doc-sec">Projects</h2>
    ${d.projects.filter((p2) => p2.title).map((p2) => {
      const bullets = rbBullets(p2.description);
      const links = [p2.github && `GitHub: ${esc(p2.github)}`, p2.demo && `Live Demo: ${esc(p2.demo)}`].filter(Boolean).join(' · ');
      const versionBits = [p2.currentTech && `Current: ${esc(p2.currentTech)}`, p2.updatedTech && `Updated: ${esc(p2.updatedTech)}`].filter(Boolean).join(' → ');
      return `<div class="rb-doc-item">
        <div class="rb-doc-item-top"><span>${esc(p2.title)}</span></div>
        ${bullets.length > 1 ? `<ul class="rb-doc-bullets">${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : `<div class="rb-doc-item-sub">${esc(p2.description)}</div>`}
        ${(p2.tech || []).length ? `<div class="rb-doc-tags">Tech: ${p2.tech.map(esc).join(', ')}</div>` : ''}
        ${versionBits ? `<div class="rb-doc-tags">${versionBits}</div>` : ''}
        ${links ? `<div class="rb-doc-tags">${links}</div>` : ''}
      </div>`;
    }).join('')}` : '';

  const expSec = (d.experience || []).length ? `<h2 class="rb-doc-sec">Internships</h2>
    ${d.experience.map((e) => {
      const bullets = rbBullets(e.description);
      const bulletsHtml = bullets.length ? `<ul class="rb-doc-bullets">${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : '';
      return `<div class="rb-doc-item">
        <div class="rb-doc-item-top"><span>${esc(e.role)} — ${esc(e.company)}${e.type ? ' (' + esc(e.type) + ')' : ''}</span><span>${esc(e.duration)}</span></div>
        ${bulletsHtml}
        ${e.technologies ? `<div class="rb-doc-tags">Tech: ${esc(e.technologies)}</div>` : ''}
      </div>`;
    }).join('')}` : `<h2 class="rb-doc-sec">Internships</h2><p style="color:#64748b;font-style:italic">Fresher — entry-level candidate, see Education &amp; Projects above.</p>`;

  const certSec = (d.certifications || []).length ? `<h2 class="rb-doc-sec">Certifications</h2>
    ${d.certifications.map((c) => `<div class="rb-doc-item"><div class="rb-doc-item-top"><span>${esc(c.name)}</span><span>${esc(c.year)}</span></div><div class="rb-doc-item-sub">${esc(c.issuer)}</div></div>`).join('')}` : '';

  const cp = d.codingProfiles || {};
  const cpBits = Object.entries(cp).filter(([, v]) => v).map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)}: ${esc(v)}`);
  const codingSec = cpBits.length ? `<h2 class="rb-doc-sec">Coding Profiles</h2><div class="rb-doc-chips">${cpBits.map((c) => `<span class="rb-doc-chip">${c}</span>`).join('')}</div>` : '';

  const achieveSec = (d.achievements || []).length ? `<h2 class="rb-doc-sec">Achievements</h2><ul class="rb-doc-bullets">${d.achievements.map((a2) => `<li>${esc(a2)}</li>`).join('')}</ul>` : '';
  const langSec = (d.languages || []).length ? `<h2 class="rb-doc-sec">Languages</h2><div class="rb-doc-chips">${d.languages.map((l) => `<span class="rb-doc-chip">${esc(l)}</span>`).join('')}</div>` : '';
  const interestSec = (d.interests || []).length ? `<h2 class="rb-doc-sec">Interests</h2><div class="rb-doc-chips">${d.interests.map((i) => `<span class="rb-doc-chip">${esc(i)}</span>`).join('')}</div>` : '';

  const headerBlock = (tpl === 'professional' || tpl === 'microsoft' || tpl === 'amazon') ? `<div class="rb-doc-header">${header}</div>` : header;

  return `<div class="rb-doc rb-tpl-${tpl}">
    ${headerBlock}
    ${summarySec}${skillsSec}${softSkillsSec}${expSec}${projSec}${eduSec}${certSec}${codingSec}${achieveSec}${langSec}${interestSec}
  </div>`;
}

/* ══════════════════════════════════════════
   Downloads — PDF (print) and DOCX (docx.js)
   ══════════════════════════════════════════ */
function rbDownloadPDF() {
  const area = $('rb-print-area');
  area.innerHTML = rbRenderDoc(RB.finalized, RB.template);
  document.body.classList.add('rb-printing');
  const cleanup = () => { document.body.classList.remove('rb-printing'); area.innerHTML = ''; window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  setTimeout(() => window.print(), 50);
}

async function rbDownloadDOCX() {
  if (!window.docx) { toast('DOCX library is still loading — try again in a moment.', 'err'); return; }
  try {
    const blob = await rbBuildDocxBlob(RB.finalized);
    const fileName = `${(RB.finalized.personal.name || 'Resume').replace(/\s+/g, '_')}_Resume.docx`;
    if (window.saveAs) window.saveAs(blob, fileName);
    else {
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: fileName });
      a.click(); URL.revokeObjectURL(a.href);
    }
    toast('✅ DOCX downloaded!', 'ok');
  } catch (err) {
    console.error(err);
    toast('Could not generate the DOCX file. Try Download PDF instead.', 'err');
  }
}

/* Plain Text + ATS Text Version exports (master-prompt export options) */
function rbDownloadPlainText() {
  const text = RB.finalized.resume_text || rbFallbackResumeText();
  const fileName = `${(RB.finalized.personal.name || 'Resume').replace(/\s+/g, '_')}_Resume.txt`;
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'text/plain' })), download: fileName });
  a.click(); URL.revokeObjectURL(a.href);
  toast('✅ Plain text resume downloaded!', 'ok');
}
function rbDownloadATSText() {
  const text = rbAtsTextVersion();
  const fileName = `${(RB.finalized.personal.name || 'Resume').replace(/\s+/g, '_')}_ATS_Version.txt`;
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'text/plain' })), download: fileName });
  a.click(); URL.revokeObjectURL(a.href);
  toast('✅ ATS-compatible text version downloaded!', 'ok');
}

async function rbBuildDocxBlob(d) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = window.docx;
  const p = d.personal || {};
  const children = [];

  children.push(new Paragraph({ text: p.name || 'Your Name', heading: HeadingLevel.TITLE }));
  if (d.targetRole) children.push(new Paragraph({ children: [new TextRun({ text: d.targetRole, bold: true, color: '0EA5E9' })] }));
  const contact = [p.email, p.phone, p.address, p.linkedin, p.github, p.portfolio].filter(Boolean).join('   |   ');
  if (contact) children.push(new Paragraph({ text: contact, spacing: { after: 200 } }));

  const heading = (text) => new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } });
  const bulletsOf = (text) => rbBullets(text).map((b) => new Paragraph({ text: b, bullet: { level: 0 } }));

  if (d.summary) { children.push(heading('Professional Summary')); children.push(new Paragraph({ text: d.summary })); }
  if ((d.skills || []).length) { children.push(heading('Skills')); children.push(new Paragraph({ text: d.skills.join(', ') })); }
  if ((d.softSkills || []).length) { children.push(heading('Soft Skills')); children.push(new Paragraph({ text: d.softSkills.join(', ') })); }

  if ((d.experience || []).length) {
    children.push(heading('Internships'));
    d.experience.forEach((e) => {
      children.push(new Paragraph({ children: [new TextRun({ text: `${e.role} — ${e.company}${e.type ? ' (' + e.type + ')' : ''}`, bold: true }), new TextRun({ text: `   ${e.duration || ''}`, italics: true })] }));
      if (e.technologies) children.push(new Paragraph({ text: 'Tech: ' + e.technologies, italics: true }));
      children.push(...bulletsOf(e.description));
    });
  }

  if ((d.projects || []).some((x) => x.title)) {
    children.push(heading('Projects'));
    d.projects.filter((x) => x.title).forEach((pr) => {
      children.push(new Paragraph({ children: [new TextRun({ text: pr.title, bold: true })] }));
      const b = bulletsOf(pr.description);
      if (b.length) children.push(...b); else children.push(new Paragraph({ text: pr.description || '' }));
      if ((pr.tech || []).length) children.push(new Paragraph({ text: 'Tech: ' + pr.tech.join(', '), italics: true }));
      if (pr.currentTech || pr.updatedTech) {
        const versionBits = [pr.currentTech && `Current: ${pr.currentTech}`, pr.updatedTech && `Updated: ${pr.updatedTech}`].filter(Boolean).join('  →  ');
        children.push(new Paragraph({ text: versionBits, italics: true }));
      }
      const links = [pr.github && `GitHub: ${pr.github}`, pr.demo && `Live Demo: ${pr.demo}`].filter(Boolean).join('   ');
      if (links) children.push(new Paragraph({ text: links, italics: true }));
    });
  }

  if ((d.education || []).some((x) => x.degree || x.institution)) {
    children.push(heading('Education'));
    d.education.filter((x) => x.degree || x.institution).forEach((e) => {
      children.push(new Paragraph({ children: [new TextRun({ text: `${e.degree} — ${e.institution}`, bold: true }), new TextRun({ text: `   ${e.year || ''}` })] }));
      if (e.cgpa) children.push(new Paragraph({ text: e.cgpa }));
    });
    const a = d.academics || {};
    if (a.inter) children.push(new Paragraph({ text: 'Intermediate / Diploma: ' + a.inter }));
    if (a.ssc) children.push(new Paragraph({ text: 'SSC: ' + a.ssc }));
    if (a.awards) children.push(new Paragraph({ text: 'Awards: ' + a.awards }));
  }

  if ((d.certifications || []).length) {
    children.push(heading('Certifications'));
    d.certifications.forEach((c) => children.push(new Paragraph({ text: `${c.name} — ${c.issuer} (${c.year || ''})` })));
  }
  const cp = d.codingProfiles || {};
  const cpBits = Object.entries(cp).filter(([, v]) => v).map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`);
  if (cpBits.length) { children.push(heading('Coding Profiles')); children.push(new Paragraph({ text: cpBits.join('   |   ') })); }
  if ((d.achievements || []).length) { children.push(heading('Achievements')); d.achievements.forEach((a2) => children.push(new Paragraph({ text: a2, bullet: { level: 0 } }))); }
  if ((d.languages || []).length) { children.push(heading('Languages')); children.push(new Paragraph({ text: d.languages.join(', ') })); }
  if ((d.interests || []).length) { children.push(heading('Interests')); children.push(new Paragraph({ text: d.interests.join(', ') })); }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBlob(doc);
}

/* ══════════════════════════════════════════
   Save / Load drafts (localStorage)
   ══════════════════════════════════════════ */
const RB_SAVE_KEY = 'ra_saved_resumes';
function rbSaveDraft(silent) {
  try {
    const list = JSON.parse(localStorage.getItem(RB_SAVE_KEY) || '[]');
    const id = 'draft_' + Date.now();
    list.unshift({ id, name: RB.data.personal.name || 'Untitled Resume', savedAt: new Date().toISOString(), data: RB.data });
    localStorage.setItem(RB_SAVE_KEY, JSON.stringify(list.slice(0, 20)));
    if (!silent) toast('✅ Resume saved — find it under "Load Saved".', 'ok');
    else toast('💾 Draft saved.', 'ok');
  } catch (err) {
    console.error(err);
    toast('Could not save — your browser storage may be full.', 'err');
  }
}
function rbSaveResume() { rbSaveDraft(false); }

function rbOpenSavedList() {
  const body = $('rb-saved-list-body');
  let list = [];
  try { list = JSON.parse(localStorage.getItem(RB_SAVE_KEY) || '[]'); } catch (e) {}
  if (!list.length) {
    body.innerHTML = '<div class="rb-empty-note">No saved resumes yet. Fill in the form and click "Save Resume".</div>';
  } else {
    body.innerHTML = `<div class="rb-saved-list">${list.map((item) => `
      <div class="rb-saved-row">
        <div class="rb-saved-meta"><b>${esc(item.name)}</b>${new Date(item.savedAt).toLocaleString()}</div>
        <div class="rb-saved-row-btns">
          <button class="rb-btn rb-btn-pri" style="padding:8px 14px" onclick="rbLoadDraft('${item.id}')">Open</button>
          <button class="rb-btn rb-btn-out" style="padding:8px 14px" onclick="rbDeleteDraft('${item.id}')">Delete</button>
        </div>
      </div>`).join('')}</div>`;
  }
  $('rb-saved-modal').classList.add('on');
}
function rbLoadDraft(id) {
  try {
    const list = JSON.parse(localStorage.getItem(RB_SAVE_KEY) || '[]');
    const item = list.find((x) => x.id === id);
    if (!item) return;
    RB.data = Object.assign(rbBlankState(), item.data);
    RB.finalized = null;
    rbCloseModal('rb-saved-modal');
    rbGoToStep(1);
    toast('📂 Draft loaded — pick up where you left off.', 'ok');
  } catch (err) { console.error(err); toast('Could not load that draft.', 'err'); }
}
function rbDeleteDraft(id) {
  try {
    const list = JSON.parse(localStorage.getItem(RB_SAVE_KEY) || '[]').filter((x) => x.id !== id);
    localStorage.setItem(RB_SAVE_KEY, JSON.stringify(list));
    rbOpenSavedList();
  } catch (err) { console.error(err); }
}
function rbCloseModal(id) { $(id).classList.remove('on'); }

/* ══════════════════════════════════════════
   Hand off to the EXISTING dashboard pipeline (index.html + app.js)
   — reuses fetchAIAnalysis()/startAnalysis()/renderAll() as-is.
   ══════════════════════════════════════════ */
function rbHandoff(targetTab) {
  const payload = {
    text: RB.finalized.resume_text,
    name: RB.finalized.personal.name,
    email: RB.finalized.personal.email,
    targetTab: targetTab || null,
  };
  localStorage.setItem('ra_builder_handoff', JSON.stringify(payload));
  location.href = 'index.html';
}
function rbAnalyzeNow() { rbHandoff(null); }
function rbGeneratePortfolio() { rbHandoff('t-pf'); }

/* ══════════════════════════════════════════
   Cover Letter / LinkedIn summary (new AI-backed features)
   ══════════════════════════════════════════ */
function rbOpenTextModal(title) {
  $('rb-text-modal-title').textContent = title;
  $('rb-text-modal-body').innerHTML = '<div class="rb-modal-loading">Generating…</div>';
  $('rb-text-modal').classList.add('on');
}
function rbShowTextModalResult(text, downloadName) {
  $('rb-text-modal-body').innerHTML = `
    <textarea id="rb-text-modal-textarea">${esc(text)}</textarea>
    <div class="rb-nav-row" style="margin-top:12px">
      <div class="rb-left"></div>
      <div class="rb-right">
        <button class="rb-btn rb-btn-out" onclick="rbCopyModalText()">📋 Copy</button>
        <button class="rb-btn rb-btn-pri" onclick="rbDownloadModalText('${downloadName}')">⬇️ Download .txt</button>
      </div>
    </div>`;
}
function rbCopyModalText() {
  const ta = $('rb-text-modal-textarea');
  ta.select();
  document.execCommand('copy');
  toast('📋 Copied to clipboard.', 'ok');
}
function rbDownloadModalText(name) {
  const text = $('rb-text-modal-textarea').value;
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'text/plain' })), download: name });
  a.click(); URL.revokeObjectURL(a.href);
}

async function rbGenerateCoverLetter() {
  rbOpenTextModal('✉️ Cover Letter');
  try {
    const res = await fetch('/api/builder/generate-cover-letter', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeText: RB.finalized.resume_text, targetRole: RB.finalized.targetRole }),
    });
    if (!res.ok) throw new Error('Request failed: ' + res.status);
    const out = await res.json();
    rbShowTextModalResult(out.cover_letter || '', 'Cover_Letter.txt');
  } catch (err) {
    console.error(err);
    $('rb-text-modal-body').innerHTML = '<div class="rb-modal-loading">⚠️ Could not generate a cover letter right now. Please try again.</div>';
  }
}
async function rbGenerateLinkedIn() {
  rbOpenTextModal('💼 LinkedIn "About" Summary');
  try {
    const res = await fetch('/api/builder/generate-linkedin-summary', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeText: RB.finalized.resume_text, targetRole: RB.finalized.targetRole }),
    });
    if (!res.ok) throw new Error('Request failed: ' + res.status);
    const out = await res.json();
    rbShowTextModalResult(out.linkedin_summary || '', 'LinkedIn_Summary.txt');
  } catch (err) {
    console.error(err);
    $('rb-text-modal-body').innerHTML = '<div class="rb-modal-loading">⚠️ Could not generate a LinkedIn summary right now. Please try again.</div>';
  }
}

/* ══════════════════════════════════════════
   Company-Specific Resume (new AI-backed feature)
   ══════════════════════════════════════════ */
const RB_COMPANIES = ['TCS', 'Infosys', 'Accenture', 'Cognizant', 'Wipro', 'Amazon', 'Microsoft', 'Google', 'IBM', 'Capgemini'];
function rbOpenCompanyModal() {
  $('rb-text-modal-title').textContent = '🏢 Company-Specific Resume';
  $('rb-text-modal-body').innerHTML = `
    <div class="rb-step-sub" style="margin-bottom:10px">Pick a company — AI will tailor your summary and top bullet points to what that recruiter typically screens for, using only your real resume content.</div>
    <div class="rb-quick-chips">${RB_COMPANIES.map((c) => `<button type="button" class="rb-quick-chip" onclick="rbGenerateCompanyResume('${c}')">${c}</button>`).join('')}</div>
    <div class="rb-fg" style="margin-top:12px"><label>Or type another company</label>
      <input type="text" id="rb-company-custom" placeholder="e.g. Deloitte" onkeydown="if(event.key==='Enter'){rbGenerateCompanyResume(this.value)}">
    </div>
    <button class="rb-btn rb-btn-pri" style="margin-top:4px" onclick="rbGenerateCompanyResume($('rb-company-custom').value)">Generate</button>
  `;
  $('rb-text-modal').classList.add('on');
}
async function rbGenerateCompanyResume(company) {
  company = (company || '').trim();
  if (!company) { toast('Enter or pick a company first.', 'err'); return; }
  $('rb-text-modal-title').textContent = `🏢 Tailored for ${company}`;
  $('rb-text-modal-body').innerHTML = '<div class="rb-modal-loading">Tailoring your resume…</div>';
  try {
    const res = await fetch('/api/builder/company-resume', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeText: RB.finalized.resume_text, targetRole: RB.finalized.targetRole, company }),
    });
    if (!res.ok) throw new Error('Request failed: ' + res.status);
    const out = await res.json();
    const text = [out.summary && `SUMMARY FOR ${company.toUpperCase()}\n${out.summary}`, out.bullets && out.bullets.length && `KEY BULLETS TO LEAD WITH\n${out.bullets.map((b) => '• ' + b).join('\n')}`, out.keywords && out.keywords.length && `KEYWORDS TO ECHO\n${out.keywords.join(', ')}`].filter(Boolean).join('\n\n');
    rbShowTextModalResult(text || 'No suggestions returned — try again.', `${company.replace(/\s+/g, '_')}_Resume_Notes.txt`);
  } catch (err) {
    console.error(err);
    $('rb-text-modal-body').innerHTML = '<div class="rb-modal-loading">⚠️ Could not generate company-specific suggestions right now. Please try again.</div>';
  }
}

/* ══════════════════════════════════════════
   Professional Profile Score (LinkedIn / GitHub / Overall)
   ══════════════════════════════════════════ */
function rbOpenProfileScoreModal() {
  $('rb-text-modal-title').textContent = '📊 Professional Profile Score';
  $('rb-text-modal-body').innerHTML = '<div class="rb-modal-loading">Scoring your profiles…</div>';
  $('rb-text-modal').classList.add('on');
  rbRunProfileScore();
}
async function rbRunProfileScore() {
  try {
    const res = await fetch('/api/builder/profile-score', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        linkedin: RB.finalized.personal.linkedin, github: RB.finalized.personal.github,
        resumeText: RB.finalized.resume_text,
      }),
    });
    if (!res.ok) throw new Error('Request failed: ' + res.status);
    const out = await res.json();
    const bar = (label, score) => `
      <div class="rb-score-row">
        <div class="rb-score-label"><span>${label}</span><span>${score}/100</span></div>
        <div class="rb-score-bar"><div class="rb-score-fill" style="width:${score}%"></div></div>
      </div>`;
    $('rb-text-modal-body').innerHTML = `
      ${bar('LinkedIn Score', out.linkedinScore ?? 0)}
      ${bar('GitHub Score', out.githubScore ?? 0)}
      ${bar('Overall Profile Score', out.overallScore ?? 0)}
      <div class="rb-fg" style="margin-top:14px"><label>Recommendations</label>
        <ul class="rb-doc-bullets">${(out.recommendations || []).map((r) => `<li>${esc(r)}</li>`).join('') || '<li>Add your LinkedIn and GitHub URLs in Step 1 for a full score.</li>'}</ul>
      </div>`;
  } catch (err) {
    console.error(err);
    $('rb-text-modal-body').innerHTML = '<div class="rb-modal-loading">⚠️ Could not score your profiles right now. Please try again.</div>';
  }
}

/* ══════════════════════════════════════════
   Trending Technologies (new, additive feature)
   ══════════════════════════════════════════ */
function rbOpenTrendingModal() {
  $('rb-text-modal-title').textContent = '🔥 Trending Technologies';
  $('rb-text-modal-body').innerHTML = '<div class="rb-modal-loading">Checking current market trends…</div>';
  $('rb-text-modal').classList.add('on');
  rbRunTrending();
}
const RB_TREND_ICON = { Hot: '🔥', Rising: '📈', Emerging: '🌱' };
async function rbRunTrending() {
  try {
    const res = await fetch('/api/trending-technologies', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetRole: RB.finalized?.targetRole || RB.data.targetRole,
        existingSkills: RB.data.skills,
      }),
    });
    if (!res.ok) throw new Error('Request failed: ' + res.status);
    const out = await res.json();
    const items = out.trending || [];
    $('rb-text-modal-body').innerHTML = `
      ${out.note ? `<div class="rb-step-sub" style="margin-bottom:10px">${esc([out.as_of, out.note].filter(Boolean).join(' — '))}</div>` : ''}
      <div class="rb-doc-bullets" style="list-style:none;padding:0">
        ${items.length ? items.map((t) => `
          <div class="rb-score-row">
            <div class="rb-score-label"><span>${RB_TREND_ICON[t.status] || '✦'} ${esc(t.name)}${t.category ? ` <span style="color:var(--t3);font-weight:400">(${esc(t.category)})</span>` : ''}</span></div>
            <div style="font-size:12.5px;color:var(--t3);line-height:1.5;margin-top:2px">${esc(t.why)}</div>
          </div>`).join('') : '<div class="rb-modal-loading">No trending technology data available right now.</div>'}
      </div>`;
  } catch (err) {
    console.error(err);
    $('rb-text-modal-body').innerHTML = '<div class="rb-modal-loading">⚠️ Could not reach the server for market trends.</div><button class="rb-btn rb-btn-out" style="margin-top:10px" onclick="rbRunTrending()">🔄 Retry</button>';
  }
}

/* ══════════════════════════════════════════
   Init
   ══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  rbRenderStep();
  document.querySelectorAll('.rb-modal-bg').forEach((bg) => {
    bg.addEventListener('click', (e) => { if (e.target === bg) bg.classList.remove('on'); });
  });
});
