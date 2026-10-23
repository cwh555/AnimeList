import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MediaModalNavigation } from "../src/ui/media-modal-navigation";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe("media modal async navigation ownership", () => {
  it("prevents a slow search from replacing the manual create screen", async () => {
    const navigation = new MediaModalNavigation();
    const search = deferred<string[]>();
    let screen = "search";
    const request = navigation.enter();
    const task = search.promise.then(results => {
      if (navigation.isCurrent(request)) screen = results.join(",");
    });
    const manual = navigation.enter();
    screen = "manual-editor";
    search.resolve(["stale result"]);
    await task;
    assert.equal(screen, "manual-editor");
    assert.equal(navigation.isCurrent(manual), true);
  });

  it("ignores stale templates after switching manual media types", async () => {
    const navigation = new MediaModalNavigation();
    const oldTemplates = deferred<string[]>();
    const newTemplates = deferred<string[]>();
    let shown: string[] = [];
    const anime = navigation.enter();
    const oldTask = oldTemplates.promise.then(items => {
      if (navigation.isCurrent(anime)) shown = items;
    });
    const novel = navigation.enter();
    const newTask = newTemplates.promise.then(items => {
      if (navigation.isCurrent(novel)) shown = items;
    });
    newTemplates.resolve(["novel-template"]);
    await newTask;
    oldTemplates.resolve(["anime-template"]);
    await oldTask;
    assert.deepEqual(shown, ["novel-template"]);
  });

  it("ignores the previous enrichment when the user navigates back", async () => {
    const navigation = new MediaModalNavigation();
    const enrichment = deferred<string>();
    let screen = "media-detail-loading";
    const details = navigation.enter();
    const task = enrichment.promise.then(title => {
      if (navigation.isCurrent(details)) screen = title;
    });
    navigation.enter();
    screen = "search";
    enrichment.resolve("Old provider response");
    await task;
    assert.equal(screen, "search");
  });

  it("invalidates pending callbacks on close and on same-query re-search", () => {
    const navigation = new MediaModalNavigation();
    const first = navigation.enter();
    const sameQueryAgain = navigation.enter();
    assert.equal(navigation.isCurrent(first), false);
    assert.equal(navigation.isCurrent(sameQueryAgain), true);
    navigation.enter();
    assert.equal(navigation.isCurrent(sameQueryAgain), false);
  });
});
