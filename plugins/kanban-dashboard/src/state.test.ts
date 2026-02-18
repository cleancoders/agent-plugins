import { describe, it, expect, beforeEach } from "vitest";
import { initDashboard, getProjectDir, getState, reset } from "./state.js";

describe("getProjectDir", () => {
  beforeEach(() => {
    reset();
  });

  it("returns undefined when project_dir is not configured", () => {
    initDashboard({ title: "t", subtitle: "s" });
    expect(getProjectDir()).toBeUndefined();
  });

  it("returns the configured project_dir after initDashboard", () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/some/path" });
    expect(getProjectDir()).toBe("/some/path");
  });

  it("returns undefined after reset", () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/some/path" });
    reset();
    expect(getProjectDir()).toBeUndefined();
  });
});
