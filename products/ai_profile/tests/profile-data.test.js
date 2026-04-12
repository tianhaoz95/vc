/**
 * Tests for profile-data.js
 */

const { PROFILE, buildSystemPrompt } = require("../src/profile-data");

describe("PROFILE data", () => {
  test("has required top-level fields", () => {
    expect(PROFILE).toHaveProperty("name");
    expect(PROFILE).toHaveProperty("title");
    expect(PROFILE).toHaveProperty("bio");
    expect(PROFILE).toHaveProperty("location");
    expect(PROFILE).toHaveProperty("email");
    expect(PROFILE).toHaveProperty("links");
    expect(PROFILE).toHaveProperty("skills");
    expect(PROFILE).toHaveProperty("projects");
    expect(PROFILE).toHaveProperty("experience");
  });

  test("name is a non-empty string", () => {
    expect(typeof PROFILE.name).toBe("string");
    expect(PROFILE.name.trim().length).toBeGreaterThan(0);
  });

  test("skills is an array of category groups with items", () => {
    expect(Array.isArray(PROFILE.skills)).toBe(true);
    expect(PROFILE.skills.length).toBeGreaterThan(0);
    PROFILE.skills.forEach((group) => {
      expect(group).toHaveProperty("category");
      expect(group).toHaveProperty("items");
      expect(Array.isArray(group.items)).toBe(true);
      expect(group.items.length).toBeGreaterThan(0);
    });
  });

  test("projects have name, description, url, and tags", () => {
    expect(Array.isArray(PROFILE.projects)).toBe(true);
    expect(PROFILE.projects.length).toBeGreaterThan(0);
    PROFILE.projects.forEach((project) => {
      expect(project).toHaveProperty("name");
      expect(project).toHaveProperty("description");
      expect(project).toHaveProperty("url");
      expect(project).toHaveProperty("tags");
      expect(Array.isArray(project.tags)).toBe(true);
    });
  });

  test("experience entries have required fields", () => {
    expect(Array.isArray(PROFILE.experience)).toBe(true);
    expect(PROFILE.experience.length).toBeGreaterThan(0);
    PROFILE.experience.forEach((entry) => {
      expect(entry).toHaveProperty("company");
      expect(entry).toHaveProperty("role");
      expect(entry).toHaveProperty("period");
      expect(entry).toHaveProperty("description");
    });
  });

  test("links object has at least one entry", () => {
    const linkValues = Object.values(PROFILE.links);
    const nonEmpty = linkValues.filter((v) => typeof v === "string" && v.trim().length > 0);
    expect(nonEmpty.length).toBeGreaterThan(0);
  });

  test("email is a string containing @", () => {
    expect(typeof PROFILE.email).toBe("string");
    expect(PROFILE.email).toContain("@");
  });

  test("avatar is a non-empty string", () => {
    expect(typeof PROFILE.avatar).toBe("string");
    expect(PROFILE.avatar.trim().length).toBeGreaterThan(0);
  });
});

describe("buildSystemPrompt()", () => {
  let prompt;

  beforeAll(() => {
    prompt = buildSystemPrompt();
  });

  test("returns a non-empty string", () => {
    expect(typeof prompt).toBe("string");
    expect(prompt.trim().length).toBeGreaterThan(0);
  });

  test("includes the developer name", () => {
    expect(prompt).toContain(PROFILE.name);
  });

  test("includes the developer title", () => {
    expect(prompt).toContain(PROFILE.title);
  });

  test("includes all skill categories", () => {
    PROFILE.skills.forEach((group) => {
      expect(prompt).toContain(group.category);
    });
  });

  test("includes all project names", () => {
    PROFILE.projects.forEach((project) => {
      expect(prompt).toContain(project.name);
    });
  });

  test("includes all company names from experience", () => {
    PROFILE.experience.forEach((entry) => {
      expect(prompt).toContain(entry.company);
    });
  });

  test("contains a PROFILE section header", () => {
    expect(prompt).toContain("=== PROFILE ===");
  });

  test("contains a SKILLS section header", () => {
    expect(prompt).toContain("=== SKILLS ===");
  });

  test("contains a PROJECTS section header", () => {
    expect(prompt).toContain("=== PROJECTS ===");
  });

  test("contains an EXPERIENCE section header", () => {
    expect(prompt).toContain("=== EXPERIENCE ===");
  });

  test("contains a LINKS section header", () => {
    expect(prompt).toContain("=== LINKS ===");
  });
});
