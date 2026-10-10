/* Portfolio v1 ("App Shell") — renders from samplePortfolio (portfolio-data.js) */

function getInitials(fullName) {
  return fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function renderAboutPanel(data) {
  const initials = getInitials(data.fullName);
  const avatarInner = data.avatarUrl
    ? `<img src="${data.avatarUrl}" alt="${data.fullName}">`
    : initials;

  const taglineHtml = data.bioTagline
    ? `<div class="pf-tagline-wrap">
         <div class="pf-tagline"><h1><span class="grad-text">${data.bioTagline}</span></h1></div>
       </div>`
    : "";

  const bioItems = data.bioPoints
    .map((p) => `<li><span class="pf-bio-dot"></span><span>${p}</span></li>`)
    .join("");

  const dlCv = data.resumeUrl
    ? `<a class="pf-dl-cv" href="${data.resumeUrl}" download>⬇ Download CV</a>`
    : "";

  const emailLink = data.email
    ? `<a class="pf-email-link" href="mailto:${data.email}">✉ ${data.email}</a>`
    : "";

  return `
    ${taglineHtml}
    <div class="pf-about-grid">
      <div class="pf-avatar-col">
        <div class="pf-avatar">${avatarInner}</div>
        ${dlCv}
      </div>
      <div>
        <p class="pf-hi">Hi there 👋</p>
        <p class="pf-intro">I'm a <strong>${data.headline}</strong>${data.location ? ` based in ${data.location}` : ""}, who:</p>
        <ul class="pf-bio-list">${bioItems}</ul>
        ${emailLink}
      </div>
    </div>
  `;
}

function renderCvPanel(data) {
  const expHtml = data.experience
    .map(
      (exp) => `
      <div class="pf-tl-item">
        <span class="pf-tl-dot"></span>
        <div class="pf-tl-head">
          <h3>${exp.role}</h3>
          <span class="pf-tl-date">${formatMonthRange(exp.startDate, exp.endDate)}</span>
        </div>
        <p class="pf-tl-company">${exp.company}${exp.location ? ` · ${exp.location}` : ""}</p>
        <ul class="pf-tl-bullets">${exp.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>
      </div>`
    )
    .join("");

  const eduHtml = data.education
    .map(
      (edu) => `
      <div class="pf-edu-card">
        <div class="pf-edu-head">
          <h3>${edu.degree}</h3>
          <span class="pf-tl-date">${formatMonthRange(edu.startDate, edu.endDate)}</span>
        </div>
        <p class="pf-edu-inst">${edu.institution}${edu.location ? ` · ${edu.location}` : ""}</p>
      </div>`
    )
    .join("");

  const skillsHtml = data.skills
    .map(
      (group) => `
      <div class="pf-skill-group">
        <p class="pf-skill-cat">${group.category}</p>
        <div class="pf-badges">${group.items.map((i) => `<span class="pf-badge">${i}</span>`).join("")}</div>
      </div>`
    )
    .join("");

  const certsHtml =
    data.certifications.length > 0
      ? `
      <section class="pf-section">
        <h2>🏆 Certifications</h2>
        <div class="pf-cert-grid">
          ${data.certifications
            .map(
              (c) => `
            <div class="pf-cert-card">
              <p class="pf-cert-name">${c.name}</p>
              <p class="pf-cert-issuer">${c.issuer}</p>
              <p class="pf-cert-date">${c.date}</p>
            </div>`
            )
            .join("")}
        </div>
      </section>`
      : "";

  return `
    <section class="pf-section">
      <h2>Experience</h2>
      <div class="pf-timeline">${expHtml}</div>
    </section>
    <section class="pf-section">
      <h2>🎓 Education</h2>
      ${eduHtml}
    </section>
    <section class="pf-section">
      <h2>Skills</h2>
      ${skillsHtml}
    </section>
    ${certsHtml}
  `;
}

function renderProjectsPanel(data) {
  const cards = data.projects
    .map((p) => {
      const tags = p.tags.map((t) => `<span class="pf-badge">${t}</span>`).join("");
      const repoLink = p.repoUrl
        ? `<a class="pf-proj-link" href="${p.repoUrl}" target="_blank" rel="noopener noreferrer">⌥ Code</a>`
        : "";
      const liveLink = p.link
        ? `<a class="pf-proj-link" href="${p.link}" target="_blank" rel="noopener noreferrer">↗ Live demo</a>`
        : "";
      return `
        <div class="pf-proj-card">
          <div>
            <h3 class="pf-proj-title">${p.title}</h3>
            <p class="pf-proj-desc">${p.description}</p>
            <div class="pf-proj-tags">${tags}</div>
          </div>
          <div class="pf-proj-links">${repoLink}${liveLink}</div>
        </div>`;
    })
    .join("");

  return `<section class="pf-section"><h2>Projects</h2><div class="pf-proj-grid">${cards}</div></section>`;
}

function renderPortfolio(data) {
  $id("pf-name").textContent = data.fullName;
  $id("pf-headline").textContent = data.headline;
  $id("pf-socials").innerHTML = renderSocialIcons(data.socials, data.email);
  $id("panel-about").innerHTML = renderAboutPanel(data);
  $id("panel-cv").innerHTML = renderCvPanel(data);
  $id("panel-projects").innerHTML = renderProjectsPanel(data);
}

function $id(id) {
  return document.getElementById(id);
}

function setupTabs() {
  const tabs = document.querySelectorAll(".pf-tab");
  const panels = document.querySelectorAll(".pf-tabpanel");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      document.querySelector(`.pf-tabpanel[data-panel="${tab.dataset.tab}"]`).classList.add("active");
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderPortfolio(samplePortfolio);
  setupTabs();
});
