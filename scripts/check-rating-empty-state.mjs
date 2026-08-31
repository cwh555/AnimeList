import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "rating-empty-state");
const profile = path.join(output, "chrome-profile");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `
      export {
        createMediaEditorFields,
        createMediaFormContext,
        mediaFormValues,
      } from "./src/ui/media-form-controls";
      export { ratingFeature } from "./src/features/rating/feature";
      export { applyEditableMediaForm } from "./src/data/media-note-codec";
    `,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "rating-empty-state.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListRatingEmpty",
  target: "es2022",
  logLevel: "warning",
  plugins: [{
    name: "obsidian-browser-stub",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
      buildContext.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents: `
          export class Notice { constructor() {} }
          export function setIcon() {}
        `,
        loader: "js",
      }));
    },
  }],
});

const bundle = await readFile(path.join(output, "rating-empty-state.js"), "utf8");
const html = `<!doctype html>
<html>
<head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body data-result="pending">
  <form id="edit-form"></form>
  <form id="reopen-form"></form>
  <form id="create-form"></form>
  <script>
    window.createDiv = () => document.createElement("div");
    window.createSpan = () => document.createElement("span");
    window.createEl = (tag) => document.createElement(tag);
    if (!HTMLElement.prototype.toggleClass) HTMLElement.prototype.toggleClass = function(name, force) { this.classList.toggle(name, force); };
    if (!HTMLElement.prototype.addClass) HTMLElement.prototype.addClass = function(...names) { this.classList.add(...names); };
    if (!HTMLElement.prototype.removeClass) HTMLElement.prototype.removeClass = function(...names) { this.classList.remove(...names); };
  </script>
  <script>${bundle}</script>
  <script>
    const contribution = AnimeListRatingEmpty.ratingFeature.contributions
      .find((candidate) => candidate.kind === "media-form");

    const makeFlow = (host, mode, status, score) => {
      const fields = AnimeListRatingEmpty.createMediaEditorFields({
        parent: host,
        mediaType: "anime",
        values: {
          title: mode === "create" ? "Create example" : "Edit example",
          status,
          releaseStatus: "unknown",
          score,
          startedAt: "",
          completedAt: "",
          progress: 3,
          total: 12,
          unit: "episode",
          genres: [],
          favorite: false,
        },
      });
      const context = AnimeListRatingEmpty.createMediaFormContext({
        mode,
        plugin: {},
        modalEl: host,
        formEl: host,
        mediaType: "anime",
        result: null,
        file: null,
        frontmatter: {},
        fields,
      });
      contribution.configure?.(context);
      return { fields, context };
    };

    window.ratingEmptyFlows = {
      contribution,
      edit: makeFlow(document.querySelector("#edit-form"), "edit", "ongoing", "8.5"),
      create: makeFlow(document.querySelector("#create-form"), "create", "planned", ""),
    };
  </script>
</body>
</html>`;

const evaluate = async (send, expression) => {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Chromium evaluation failed");
  return result.result.value;
};

const dispatchBackspace = async (send) => {
  await send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "Backspace",
    code: "Backspace",
    windowsVirtualKeyCode: 8,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Backspace",
    code: "Backspace",
    windowsVirtualKeyCode: 8,
  });
};

try {
  await runChromiumDatasetTest({
    html,
    profile,
    testName: "Rating optional empty-state production regression",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 720, height: 600, deviceScaleFactor: 1, mobile: false },
    interact: async ({ send, sleep }) => {
      await sleep(50);

      const initial = JSON.parse(await evaluate(send, `JSON.stringify({
        editValue: window.ratingEmptyFlows.edit.fields.score.value,
        editRequired: window.ratingEmptyFlows.edit.fields.score.required,
        createValue: window.ratingEmptyFlows.create.fields.score.value,
        createRequired: window.ratingEmptyFlows.create.fields.score.required,
        createAriaValue: window.ratingEmptyFlows.create.fields.score.getAttribute("aria-valuenow"),
      })`));

      await evaluate(send, `(() => {
        const score = window.ratingEmptyFlows.edit.fields.score;
        score.focus();
        score.select();
      })()`);
      await dispatchBackspace(send);
      await sleep(30);

      const cleared = JSON.parse(await evaluate(send, `(() => {
        const flow = window.ratingEmptyFlows.edit;
        const snapshot = AnimeListRatingEmpty.mediaFormValues(flow.context);
        window.ratingEmptyFlows.contribution.prepareSubmit?.({ ...flow.context, form: snapshot });
        const frontmatter = {
          media_type: "anime",
          title: "Edit example",
          status: "ongoing",
          score: 8.5,
        };
        AnimeListRatingEmpty.applyEditableMediaForm(frontmatter, "anime", snapshot);
        const reopenHost = document.querySelector("#reopen-form");
        const reopened = AnimeListRatingEmpty.createMediaEditorFields({
          parent: reopenHost,
          mediaType: "anime",
          values: {
            title: "Edit example",
            status: "ongoing",
            releaseStatus: "unknown",
            score: frontmatter.score,
            startedAt: "",
            completedAt: "",
            progress: 3,
            total: 12,
            unit: "episode",
            genres: [],
            favorite: false,
          },
        });
        return JSON.stringify({
          liveValue: flow.fields.score.value,
          liveAriaValue: flow.fields.score.getAttribute("aria-valuenow"),
          snapshotScore: snapshot.score,
          hasPersistedScore: Object.hasOwn(frontmatter, "score"),
          reopenedValue: reopened.score.value,
        });
      })()`));

      const whitespace = JSON.parse(await evaluate(send, `(() => {
        const flow = window.ratingEmptyFlows.edit;
        flow.fields.score.value = "   ";
        flow.fields.score.dispatchEvent(new Event("input", { bubbles: true }));
        const snapshot = AnimeListRatingEmpty.mediaFormValues(flow.context);
        window.ratingEmptyFlows.contribution.prepareSubmit?.({ ...flow.context, form: snapshot });
        return JSON.stringify({
          score: snapshot.score,
          ariaValue: flow.fields.score.getAttribute("aria-valuenow"),
        });
      })()`));

      const explicitZero = JSON.parse(await evaluate(send, `(() => {
        const flow = window.ratingEmptyFlows.edit;
        flow.fields.score.value = "0";
        flow.fields.score.dispatchEvent(new Event("input", { bubbles: true }));
        const snapshot = AnimeListRatingEmpty.mediaFormValues(flow.context);
        window.ratingEmptyFlows.contribution.prepareSubmit?.({ ...flow.context, form: snapshot });
        const frontmatter = { media_type: "anime", title: "Edit example", status: "ongoing" };
        AnimeListRatingEmpty.applyEditableMediaForm(frontmatter, "anime", snapshot);
        return JSON.stringify({
          score: snapshot.score,
          persistedScore: frontmatter.score,
          ariaValue: flow.fields.score.getAttribute("aria-valuenow"),
        });
      })()`));

      const completed = JSON.parse(await evaluate(send, `(() => {
        const flow = window.ratingEmptyFlows.edit;
        flow.fields.status.value = "completed";
        flow.fields.status.dispatchEvent(new Event("change", { bubbles: true }));
        flow.fields.score.value = "";
        flow.fields.score.dispatchEvent(new Event("input", { bubbles: true }));
        const snapshot = AnimeListRatingEmpty.mediaFormValues(flow.context);
        snapshot.completedAt = "2026-08-31";
        window.ratingEmptyFlows.contribution.prepareSubmit?.({ ...flow.context, form: snapshot });
        let rejected = false;
        try {
          AnimeListRatingEmpty.applyEditableMediaForm({}, "anime", snapshot);
        } catch {
          rejected = true;
        }
        flow.fields.status.value = "ongoing";
        flow.fields.status.dispatchEvent(new Event("change", { bubbles: true }));
        return JSON.stringify({
          requiredWhileCompleted: flow.fields.score.getAttribute("aria-required") === "false" ? false : true,
          rejected,
          optionalAfterLeavingCompleted: flow.fields.score.required === false,
        });
      })()`));

      await evaluate(send, `(() => {
        const details = {
          editStartsRated: ${JSON.stringify(initial.editValue)} === "8.5",
          nonCompletedEditIsOptional: ${JSON.stringify(initial.editRequired)} === false,
          newPlannedWorkStartsEmpty: ${JSON.stringify(initial.createValue)} === "",
          newPlannedWorkIsOptional: ${JSON.stringify(initial.createRequired)} === false,
          emptyDoesNotExposeZeroToAccessibility: ${JSON.stringify(initial.createAriaValue)} === null,
          trustedBackspaceLeavesFieldEmpty: ${JSON.stringify(cleared.liveValue)} === "",
          clearedFieldHasNoAriaZero: ${JSON.stringify(cleared.liveAriaValue)} === null,
          submitKeepsClearedScoreNull: ${JSON.stringify(cleared.snapshotScore)} === null,
          saveRemovesExistingScoreKey: ${JSON.stringify(cleared.hasPersistedScore)} === false,
          reopenKeepsScoreEmpty: ${JSON.stringify(cleared.reopenedValue)} === "",
          whitespaceIsAlsoUnrated: ${JSON.stringify(whitespace.score)} === null,
          whitespaceHasNoAriaZero: ${JSON.stringify(whitespace.ariaValue)} === null,
          explicitZeroRemainsZero: ${JSON.stringify(explicitZero.score)} === 0 && ${JSON.stringify(explicitZero.persistedScore)} === 0,
          explicitZeroKeepsAriaZero: ${JSON.stringify(explicitZero.ariaValue)} === "0",
          completedRequiresRating: ${JSON.stringify(completed.requiredWhileCompleted)} === true,
          completedBlankSaveIsRejected: ${JSON.stringify(completed.rejected)} === true,
          leavingCompletedMakesRatingOptional: ${JSON.stringify(completed.optionalAfterLeavingCompleted)} === true,
        };
        document.body.dataset.details = JSON.stringify(details);
        document.body.dataset.result = Object.values(details).every(Boolean) ? "pass" : "fail";
      })()`);
    },
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}
