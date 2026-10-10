/* Portfolio v2 ("Editorial") — renders from samplePortfolio (portfolio-data.js) */

const V2_SECTIONS = [
  { id: "about", label: "About", index: "01" },
  { id: "experience", label: "Experience", index: "02" },
  { id: "projects", label: "Projects", index: "03" },
  { id: "background", label: "Background", index: "04" },
  { id: "contact", label: "Contact", index: "05" },
];

function v2Id(id) {
  return document.getElementById(id);
}

function getV2Initials(fullName) {
  return fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function renderV2Rail() {
  const rail = v2Id("v2-rail");
  rail.innerHTML = V2_SECTIONS.map(
    (s) => `
    <button class="v2-rail-item" data-section="${s.id}">
      <span class="v2-rail-line"></span>
      <span class="v2-rail-label">${s.index} — ${s.label}</span>
    </button>`
  ).join("");

  rail.querySelectorAll(".v2-rail-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      v2Id(btn.dataset.section)?.scrollIntoView({ behavior: "smooth" });
    });
  });
}

function renderV2Hero(data) {
  const parts = data.fullName.split(" ");
  const first = parts[0];
  const rest = parts.slice(1).join(" ");

  v2Id("v2-headline").textContent =
    data.headline + (data.location ? ` · ${data.location}` : "");
  v2Id("v2-name").innerHTML = `${first}<br><span class="last">${rest}</span>`;
  v2Id("v2-tagline").textContent = data.bioTagline
    ? data.bioTagline.charAt(0) + data.bioTagline.slice(1).toLowerCase()
    : "";
  v2Id("v2-hero-socials").innerHTML = renderSocialIcons(data.socials, data.email)
    .replace(/class="soc-i"/g, 'class="v2-soc-i"');

  const cvLink = v2Id("v2-cv-link");
  if (data.resumeUrl) {
    cvLink.href = data.resumeUrl;
  } else {
    cvLink.style.display = "none";
  }
}

function renderV2About(data) {
  const initials = getV2Initials(data.fullName);
  const avatarEl = v2Id("v2-avatar");
  avatarEl.innerHTML = data.avatarUrl
    ? `<img src="${data.avatarUrl}" alt="${data.fullName}">`
    : initials;

  const [first, ...restPoints] = data.bioPoints;
  v2Id("v2-lede").textContent = (first || "").replace(/^[^\w]+/, "");
  v2Id("v2-about-rest").innerHTML = restPoints
    .map((p) => `<p>${p.replace(/^[^\w]+/, "")}</p>`)
    .join("");
}

function renderV2Experience(data) {
  v2Id("v2-exp-list").innerHTML = data.experience
    .map(
      (exp) => `
      <div class="v2-exp-row">
        <div>
          <p class="v2-exp-date">${formatMonthRange(exp.startDate, exp.endDate)}</p>
          <p class="v2-exp-company">${exp.company}</p>
        </div>
        <div>
          <h3 class="v2-exp-role">${exp.role}</h3>
          <ul class="v2-exp-bullets">${exp.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>
        </div>
      </div>`
    )
    .join("");
}

function renderV2Projects(data) {
  v2Id("v2-proj-rail").innerHTML = data.projects
    .map((p) => {
      const tags = p.tags.map((t) => `<span>${t}</span>`).join("");
      const repoLink = p.repoUrl
        ? `<a class="v2-proj-link" href="${p.repoUrl}" target="_blank" rel="noopener noreferrer">⌥ Code</a>`
        : "";
      const liveLink = p.link
        ? `<a class="v2-proj-link" href="${p.link}" target="_blank" rel="noopener noreferrer">↗ Live</a>`
        : "";
      return `
        <div class="v2-proj-card">
          <h3 class="v2-proj-title">${p.title}</h3>
          <p class="v2-proj-desc">${p.description}</p>
          <div class="v2-proj-tags">${tags}</div>
          <div class="v2-proj-links">${repoLink}${liveLink}</div>
        </div>`;
    })
    .join("");
}

function renderV2Background(data) {
  v2Id("v2-edu-list").innerHTML = data.education
    .map(
      (edu) => `
      <div class="v2-edu-item">
        <p class="v2-edu-degree">${edu.degree}</p>
        <p class="v2-edu-meta">${edu.institution} · ${edu.startDate.slice(0, 4)}${edu.endDate ? `–${edu.endDate.slice(0, 4)}` : ""}</p>
      </div>`
    )
    .join("");

  if (data.certifications.length > 0) {
    v2Id("v2-cert-wrap").innerHTML = `
      <h3 class="v2-bg-h3" style="margin-top:40px">Certifications</h3>
      ${data.certifications
        .map(
          (c) => `<p class="v2-cert-name" style="margin-top:16px">${c.name}<span class="v2-cert-issuer">${c.issuer}</span></p>`
        )
        .join("")}
    `;
  }

  v2Id("v2-skill-list").innerHTML = data.skills
    .map(
      (g) => `
      <div class="v2-skill-item">
        <p class="v2-skill-cat">${g.category}</p>
        <p class="v2-skill-items">${g.items.join(" · ")}</p>
      </div>`
    )
    .join("");
}

function renderV2Contact(data) {
  const emailEl = v2Id("v2-contact-email");
  if (data.email) {
    emailEl.href = `mailto:${data.email}`;
    emailEl.textContent = data.email;
  } else {
    emailEl.style.display = "none";
  }
  v2Id("v2-contact-socials").innerHTML = renderSocialIcons(data.socials, "")
    .replace(/class="soc-i"/g, 'class="v2-soc-i"');
  v2Id("v2-footer-name").textContent = data.fullName;
}

function setupV2ScrollSpy() {
  const railItems = document.querySelectorAll(".v2-rail-item");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          railItems.forEach((item) =>
            item.classList.toggle("active", item.dataset.section === entry.target.id)
          );
        }
      });
    },
    { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
  );

  V2_SECTIONS.forEach((s) => {
    const el = v2Id(s.id);
    if (el) observer.observe(el);
  });
}

function renderV2Portfolio(data) {
  renderV2Rail();
  renderV2Hero(data);
  renderV2About(data);
  renderV2Experience(data);
  renderV2Projects(data);
  renderV2Background(data);
  renderV2Contact(data);
  setupV2ScrollSpy();
}

document.addEventListener("DOMContentLoaded", () => {
  renderV2Portfolio(samplePortfolio);
});
