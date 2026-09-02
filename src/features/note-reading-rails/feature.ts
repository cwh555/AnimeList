import { defineFeature, type AnimeListFeatureHost } from "../../app/feature-types";
import { uiText } from "../../ui-text";
import { asArray, makeEl } from "../../ui/ui-helpers";
import { disposeMountedNoteReadingRails, installNoteReadingRails } from "../../ui/note-reading-rails";

function detailString(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function appendMetaRow(container: HTMLElement, label: string, value: string): void {
  if (!value) return;
  const row = makeEl("div", "al-detail-meta-row");
  row.appendChild(makeEl("dt", "al-detail-meta-label", label));
  row.appendChild(makeEl("dd", "al-detail-meta-value", value));
  container.appendChild(row);
}

function aliases(frontmatter: Record<string, unknown>, title: string): string[] {
  const values = [
    frontmatter.title_original,
    frontmatter.title_romaji,
    ...asArray(frontmatter.title_aliases),
  ].map(detailString).filter((value) => value && value !== title);
  return [...new Set(values)];
}

function sourceBasename(sourcePath: string): string {
  const filename = sourcePath.split("/").at(-1) ?? sourcePath;
  return filename.replace(/\.md$/i, "");
}

function addRailButtonLabel(button: HTMLElement | null): void {
  if (!button || button.querySelector(".al-detail-rail-only-label")) return;
  const label = button.getAttribute("aria-label") || button.getAttribute("title") || "";
  if (label) button.appendChild(makeEl("span", "al-detail-rail-only-label", label));
}

export function decorateNoteReadingRails(
  container: HTMLElement,
  sourcePath: string,
  frontmatter: Record<string, unknown>,
): void {
  const card = container.querySelector<HTMLElement>(".al-detail-card");
  const topbar = card?.querySelector<HTMLElement>(".al-detail-topbar") ?? null;
  const body = card?.querySelector<HTMLElement>(".al-detail-body") ?? null;
  if (!card || !topbar || !body) return;

  const title = detailString(frontmatter.title) || sourceBasename(sourcePath);
  if (!body.querySelector(".al-detail-rail-identity")) {
    const identity = makeEl("div", "al-detail-rail-identity");
    identity.appendChild(makeEl("h2", "al-detail-rail-title", title));
    const titleAliases = aliases(frontmatter, title);
    if (titleAliases.length) {
      identity.appendChild(makeEl("p", "al-detail-rail-aliases", titleAliases.join(" · ")));
    }
    const metadata = body.querySelector(".al-detail-metadata");
    body.insertBefore(identity, metadata);
  }

  if (!topbar.querySelector(".al-detail-rail-dates")) {
    const dates = makeEl("dl", "al-detail-rail-dates");
    appendMetaRow(dates, uiText("add.startedAt"), detailString(frontmatter.started_at));
    appendMetaRow(dates, uiText("add.completedAt"), detailString(frontmatter.completed_at));
    if (dates.childElementCount) {
      const buttons = topbar.querySelector(".al-detail-buttons");
      topbar.insertBefore(dates, buttons);
    }
  }

  addRailButtonLabel(topbar.querySelector<HTMLElement>(".al-detail-favorite"));
  addRailButtonLabel(topbar.querySelector<HTMLElement>(".al-detail-more"));

  installNoteReadingRails({ container, card, topbar, body });
}

export const noteReadingRailsFeature = defineFeature<AnimeListFeatureHost>({
  id: "note-reading-rails",
  contributions: [{
    kind: "lifecycle",
    activate(host) {
      host.register(() => disposeMountedNoteReadingRails());
    },
  }, {
    kind: "detail",
    afterRender({ container, sourcePath, frontmatter }) {
      decorateNoteReadingRails(container, sourcePath, frontmatter);
    },
  }],
});
