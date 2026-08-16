import { defineTextCatalog } from "../../i18n/catalog";
import { SCORE_DASHBOARD_MESSAGES } from "../../i18n/locales/zh-TW/score-dashboard";

const MESSAGES = SCORE_DASHBOARD_MESSAGES;
const CATALOG = defineTextCatalog("score-dashboard", MESSAGES);
const text = <K extends keyof typeof MESSAGES>(key: K, variables: Record<string, string | number> = {}) => (
  CATALOG.text(key, variables)
);

export const scoreDashboardText = {
  get title() { return text("title"); },
  get kicker() { return text("kicker"); },
  get description() { return text("description"); },
  get open() { return text("open"); },
  get all() { return text("all"); },
  get anime() { return text("anime"); },
  get manga() { return text("manga"); },
  get novel() { return text("novel"); },
  get unrated() { return text("unrated"); },
  get showUnrated() { return text("showUnrated"); },
  get hideUnrated() { return text("hideUnrated"); },
  get zoom() { return text("zoom"); },
  get emptyLane() { return text("emptyLane"); },
  get works() { return text("works"); },
  get batchSelect() { return text("batchSelect"); },
  get finishBatch() { return text("finishBatch"); },
  get batchShort() { return text("batchShort"); },
  get finishBatchShort() { return text("finishBatchShort"); },
  selected: (count: number) => text("selected", { count }),
  get selectVisible() { return text("selectVisible"); },
  get clearSelection() { return text("clearSelection"); },
  get moveTo() { return text("moveTo"); },
  get shiftDown() { return text("shiftDown"); },
  get shiftUp() { return text("shiftUp"); },
  get cancel() { return text("cancel"); },
  get confirmClamp() { return text("confirmClamp"); },
  get shiftClampTitle() { return text("shiftClampTitle"); },
  shiftClampMessage: (low: number, high: number) => text("shiftClampMessage", { count: low + high }),
  shiftClampLow: (count: number) => text("shiftClampLow", { count }),
  shiftClampHigh: (count: number) => text("shiftClampHigh", { count }),
  shiftBlockedUnrated: (count: number) => text("shiftBlockedUnrated", { count }),
  moveSuccess: (count: number) => text("moveSuccess", { count }),
  get moveNoChange() { return text("moveNoChange"); },
  moveFailed: (message: string) => text("moveFailed", { message }),
  get dragHint() { return text("dragHint"); },
  get selectionHint() { return text("selectionHint"); },
  ratedSummary: (rated: number, total: number) => text("ratedSummary", { rated, total }),
  coverAlt: (title: string) => text("coverAlt", { title }),
  unratedControlLabel: (action: string, count: number) => text("unratedControlLabel", { action, count }),
  posterAria: (title: string, score: string) => text("posterAria", { title, score }),
  scoreLaneAria: (score: string) => text("scoreLaneAria", { score }),
  noteMissing: (path: string) => text("noteMissing", { path }),
  rollbackFailed: (paths: string) => text("rollbackFailed", { paths }),
  get rollbackSucceeded() { return text("rollbackSucceeded"); },
  updateFailed: (reason: string, rollback: string) => text("updateFailed", { reason, rollback }),
} as const;
