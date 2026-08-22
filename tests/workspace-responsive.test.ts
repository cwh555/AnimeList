import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  WORKSPACE_COMPACT_BREAKPOINT,
  WORKSPACE_EXPANDED_BREAKPOINT,
  classifyWorkspaceWidth,
} from "../src/ui/workspace-responsive";

describe("workspace responsive width classes", () => {
  it("uses the Material compact/medium/expanded boundaries", () => {
    assert.equal(WORKSPACE_COMPACT_BREAKPOINT, 600);
    assert.equal(WORKSPACE_EXPANDED_BREAKPOINT, 840);
    assert.equal(classifyWorkspaceWidth(0), "compact");
    assert.equal(classifyWorkspaceWidth(599), "compact");
    assert.equal(classifyWorkspaceWidth(600), "medium");
    assert.equal(classifyWorkspaceWidth(839), "medium");
    assert.equal(classifyWorkspaceWidth(840), "expanded");
  });

  it("falls back safely for invalid measurements", () => {
    assert.equal(classifyWorkspaceWidth(Number.NaN), "expanded");
    assert.equal(classifyWorkspaceWidth(Number.POSITIVE_INFINITY), "expanded");
    assert.equal(classifyWorkspaceWidth(-1), "expanded");
  });
});
