import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  TEST_FEATURES,
  TEST_SUITES,
  TEST_TARGETS,
} from "../test-catalog.mjs";
import {
  parseTestArguments,
  selectTestTargets,
} from "../../scripts/test-selection.mjs";

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const absolute = path.join(directory, name);
    return statSync(absolute).isDirectory() ? walk(absolute) : [absolute];
  });
}

describe("test catalog", () => {
  it("registers every test file exactly once with valid suite and feature metadata", () => {
    const discovered = walk(path.join(process.cwd(), "tests"))
      .filter((file) => file.endsWith(".test.ts"))
      .map((file) => path.relative(process.cwd(), file).replaceAll(path.sep, "/"))
      .sort();
    const registered = TEST_TARGETS
      .filter((target) => target.kind === "test")
      .map((target) => target.path)
      .sort();

    assert.deepEqual(registered, discovered);
    assert.equal(new Set(TEST_TARGETS.map((target) => target.path)).size, TEST_TARGETS.length);
    for (const target of TEST_TARGETS) {
      assert.ok(TEST_SUITES.includes(target.suite), `${target.path} has an unknown suite`);
      assert.ok(target.features.length > 0, `${target.path} must declare a feature`);
      target.features.forEach((feature) => {
        assert.ok(TEST_FEATURES.includes(feature), `${target.path} has unknown feature ${feature}`);
      });
    }
  });

  it("selects suites and features independently and combines them with AND semantics", () => {
    const unit = selectTestTargets(TEST_TARGETS, {
      suites: new Set(["unit"]),
      features: new Set<string>(),
      list: false,
    });
    assert.ok(unit.length > 0);
    assert.ok(unit.every((target) => target.suite === "unit"));

    const rating = selectTestTargets(TEST_TARGETS, {
      suites: new Set<string>(),
      features: new Set(["rating"]),
      list: false,
    });
    assert.ok(rating.some((target) => target.path.endsWith("rating.test.ts")));
    assert.ok(rating.every((target) => target.features.includes("rating")));

    const integrationSearch = selectTestTargets(TEST_TARGETS, {
      suites: new Set(["integration"]),
      features: new Set(["search"]),
      list: false,
    });
    assert.ok(integrationSearch.length > 0);
    assert.ok(integrationSearch.every((target) => target.suite === "integration" && target.features.includes("search")));
  });

  it("rejects unknown selectors instead of silently running the wrong tests", () => {
    assert.throws(
      () => parseTestArguments(["--suite", "unknown"], TEST_SUITES, TEST_FEATURES),
      /Unknown test suite/,
    );
    assert.throws(
      () => parseTestArguments(["--feature", "unknown"], TEST_SUITES, TEST_FEATURES),
      /Unknown test feature/,
    );
    assert.throws(
      () => parseTestArguments(["rating"], TEST_SUITES, TEST_FEATURES),
      /Unknown test argument/,
    );
  });
});
