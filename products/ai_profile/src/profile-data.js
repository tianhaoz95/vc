/**
 * Developer profile configuration.
 *
 * Edit this file to customize the profile displayed on the site.
 * The AI agent uses this data as its knowledge base to answer
 * visitors' questions about the developer.
 */

const PROFILE = {
  name: "Alex Developer",
  title: "Full-Stack Software Engineer",
  avatar: "https://api.dicebear.com/8.x/identicon/svg?seed=alexdev",
  bio: `Passionate software engineer with 6+ years of experience building
scalable web applications and developer tools. I love open-source,
elegant architecture, and helping teams ship high-quality software.`,
  location: "San Francisco, CA",
  email: "alex@example.com",
  links: {
    github: "https://github.com/alexdev",
    linkedin: "https://linkedin.com/in/alexdev",
    twitter: "https://twitter.com/alexdev",
    website: "https://alexdev.example.com",
  },
  skills: [
    { category: "Languages", items: ["JavaScript", "TypeScript", "Python", "Go", "Rust"] },
    { category: "Frontend", items: ["React", "Vue.js", "HTML5", "CSS3", "WebAssembly"] },
    { category: "Backend", items: ["Node.js", "FastAPI", "PostgreSQL", "Redis", "GraphQL"] },
    { category: "DevOps", items: ["Docker", "Kubernetes", "GitHub Actions", "AWS", "Firebase"] },
  ],
  projects: [
    {
      name: "OpenAPI Gateway",
      description:
        "A lightweight, self-hosted API gateway with rate limiting, auth, and analytics built with Go.",
      url: "https://github.com/alexdev/openapi-gateway",
      tags: ["Go", "Docker", "Open Source"],
    },
    {
      name: "React Query Devtools Pro",
      description:
        "Advanced devtools extension for React Query with timeline visualization and cache inspector.",
      url: "https://github.com/alexdev/rq-devtools-pro",
      tags: ["React", "TypeScript", "Browser Extension"],
    },
    {
      name: "DataViz Studio",
      description:
        "Drag-and-drop dashboard builder that generates shareable, embeddable charts from CSV/JSON data.",
      url: "https://dataviz.example.com",
      tags: ["Vue.js", "D3.js", "Firebase"],
    },
  ],
  experience: [
    {
      company: "Acme Corp",
      role: "Senior Software Engineer",
      period: "2021 – Present",
      description:
        "Lead architect for the core platform team, migrating a monolith to microservices.",
    },
    {
      company: "Startup XYZ",
      role: "Software Engineer",
      period: "2018 – 2021",
      description:
        "Built the real-time collaboration features powering 50k+ daily active users.",
    },
  ],
};

/**
 * Generates a rich system prompt for the AI agent derived from the profile.
 * @returns {string}
 */
function buildSystemPrompt() {
  const skillsList = PROFILE.skills
    .map((s) => `${s.category}: ${s.items.join(", ")}`)
    .join("\n");

  const projectsList = PROFILE.projects
    .map(
      (p) =>
        `- ${p.name}: ${p.description} (tags: ${p.tags.join(", ")}; url: ${p.url})`
    )
    .join("\n");

  const experienceList = PROFILE.experience
    .map((e) => `- ${e.role} at ${e.company} (${e.period}): ${e.description}`)
    .join("\n");

  return `You are an AI assistant embedded on ${PROFILE.name}'s personal developer profile website.
Your job is to help visitors learn about ${PROFILE.name} in a friendly, concise, and professional way.
Answer questions about their background, skills, projects, and experience using only the information below.
If a question is outside this scope, politely say you don't have that information.

=== PROFILE ===
Name: ${PROFILE.name}
Title: ${PROFILE.title}
Location: ${PROFILE.location}
Email: ${PROFILE.email}
Bio: ${PROFILE.bio}

=== SKILLS ===
${skillsList}

=== PROJECTS ===
${projectsList}

=== EXPERIENCE ===
${experienceList}

=== LINKS ===
GitHub: ${PROFILE.links.github}
LinkedIn: ${PROFILE.links.linkedin}
Website: ${PROFILE.links.website}
`;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { PROFILE, buildSystemPrompt };
}
