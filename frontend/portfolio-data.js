/* Sample portfolio data — ports src/data/sample-portfolio.ts.
   Replace this object with real parsed-resume data once the
   resume-analysis backend exists; both v1 and v2 templates render
   purely from this shape. */
const samplePortfolio = {
  slug: "arjun-mehta",
  fullName: "Arjun Mehta",
  headline: "Full Stack Developer",
  bioTagline: "BUILD THINGS THAT MATTER",
  bioPoints: [
    "💻 builds full-stack products end to end, from schema to ship",
    "🌍 currently working on developer tooling for fintech teams",
    "🔥 handled high-traffic systems in e-commerce & logistics",
    "⚡ comfortable across React, Node, Postgres, and infra",
    "🚀 at the end of the day, aims to ship things that matter",
  ],
  location: "Bengaluru, India",
  email: "arjun.mehta@example.com",
  avatarUrl: "",
  resumeUrl: "#",
  socials: [
    { platform: "github", url: "https://github.com/arjunmehta" },
    { platform: "linkedin", url: "https://linkedin.com/in/arjunmehta" },
    { platform: "twitter", url: "https://twitter.com/arjunmehta" },
  ],
  skills: [
    { category: "Languages", items: ["TypeScript", "Python", "Go"] },
    { category: "Frameworks", items: ["React", "Next.js", "Express", "FastAPI"] },
    { category: "Cloud & Infra", items: ["AWS", "Docker", "Vercel", "Postgres"] },
  ],
  experience: [
    {
      id: "exp-1",
      role: "Senior Software Engineer",
      company: "Finwise Technologies",
      location: "Bengaluru, India",
      startDate: "2023-04",
      bullets: [
        "Led migration of monolith to microservices, cutting deploy time by 60%",
        "Built internal developer platform used by 40+ engineers",
        "Mentored 4 junior engineers across two product squads",
      ],
    },
    {
      id: "exp-2",
      role: "Software Engineer",
      company: "Loop Commerce",
      location: "Remote",
      startDate: "2021-01",
      endDate: "2023-03",
      bullets: [
        "Built checkout pipeline handling 2M+ monthly transactions",
        "Reduced API p95 latency by 35% through caching strategy",
      ],
    },
  ],
  education: [
    {
      id: "edu-1",
      degree: "B.Tech in Computer Science",
      institution: "IIT Hyderabad",
      startDate: "2017-07",
      endDate: "2021-05",
    },
  ],
  projects: [
    {
      id: "proj-1",
      title: "Ledger — Open Source Expense Tracker",
      description:
        "Self-hosted expense tracking app with bank sync, budgets, and shared households.",
      tags: ["Next.js", "Postgres", "Plaid API"],
      repoUrl: "https://github.com/arjunmehta/ledger",
      link: "https://ledger-demo.vercel.app",
    },
    {
      id: "proj-2",
      title: "Streamline — Realtime Collab Editor",
      description: "CRDT-based collaborative text editor with offline-first sync.",
      tags: ["TypeScript", "Yjs", "WebRTC"],
      repoUrl: "https://github.com/arjunmehta/streamline",
    },
  ],
  certifications: [
    {
      id: "cert-1",
      name: "AWS Certified Solutions Architect",
      issuer: "Amazon Web Services",
      date: "2024-02",
    },
  ],
  achievements: [
    {
      id: "ach-1",
      title: "Speaker at React India 2024",
      description: "Talk on incremental migration strategies for legacy frontends",
    },
  ],
};

function formatMonthRange(start, end) {
  const fmt = (d) => {
    const [y, m] = d.split("-");
    const date = new Date(Number(y), Number(m) - 1);
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };
  return `${fmt(start)} — ${end ? fmt(end) : "Present"}`;
}

const SOCIAL_ICON_SVG = {
  github:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 .5C5.65.5.5 5.66.5 12.02c0 5.09 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.75 2.69 1.25 3.35.95.1-.75.4-1.25.72-1.54-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.43-2.7 5.41-5.27 5.7.41.36.78 1.07.78 2.16 0 1.56-.01 2.82-.01 3.2 0 .31.21.66.79.55A11.52 11.52 0 0 0 23.5 12c0-6.35-5.15-11.5-11.5-11.5Z"/></svg>',
  linkedin:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z"/></svg>',
  twitter:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M23.95 4.57a9.83 9.83 0 0 1-2.83.78 4.96 4.96 0 0 0 2.17-2.72c-.95.56-2 .97-3.12 1.19a4.92 4.92 0 0 0-8.38 4.48A13.94 13.94 0 0 1 1.67 3.15a4.92 4.92 0 0 0 1.52 6.56A4.9 4.9 0 0 1 .96 9.1v.06a4.92 4.92 0 0 0 3.95 4.83c-.47.12-.96.18-1.47.18-.36 0-.7-.03-1.04-.1a4.92 4.92 0 0 0 4.6 3.42A9.87 9.87 0 0 1 0 19.54a13.93 13.93 0 0 0 7.55 2.21c9.06 0 14.01-7.5 14.01-14.01l-.02-.64A9.93 9.93 0 0 0 24 4.59l-.05-.02Z"/></svg>',
  email:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>',
};

function renderSocialIcons(socials, email) {
  const links = socials
    .map((s) => `<a class="soc-i" href="${s.url}" target="_blank" rel="noopener noreferrer" aria-label="${s.platform}">${SOCIAL_ICON_SVG[s.platform] || ""}</a>`)
    .join("");
  const emailLink = email
    ? `<a class="soc-i" href="mailto:${email}" aria-label="email">${SOCIAL_ICON_SVG.email}</a>`
    : "";
  return links + emailLink;
}
