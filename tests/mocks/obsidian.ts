export class Component {
  registerEvent(): void {}
}

export class Plugin extends Component {
  app: any = {};
  manifest: any = {};
  async loadData(): Promise<any> { return {}; }
  async saveData(): Promise<void> {}
  registerView(): void {}
  addRibbonIcon(): void {}
  registerMarkdownCodeBlockProcessor(): void {}
  addCommand(): void {}
  addSettingTab(): void {}
}

export class Modal {
  app: any;
  modalEl: any = { classList: { add() {} } };
  contentEl: any = { replaceChildren() {}, appendChild() {}, append() {} };
  constructor(app?: any) { this.app = app; }
  open(): void {}
  close(): void {}
}

export class MarkdownRenderChild {
  containerEl: any;
  constructor(containerEl?: any) { this.containerEl = containerEl; }
}

export class ItemView {
  leaf: any;
  contentEl: any = {
    empty() {},
    addClass() {},
    createDiv() { return { createEl() { return { addEventListener() {} }; } }; },
  };
  constructor(leaf?: any) { this.leaf = leaf; }
}

export class WorkspaceLeaf {}
export class TAbstractFile {
  path = "";
  name = "";
}
export class TFile extends TAbstractFile {
  basename = "";
  extension = "md";
}
export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];
}
export class Notice { constructor(_message?: string) {} }
export class App {}

export class PluginSettingTab {
  app: any;
  plugin: any;
  containerEl: any = { empty() {}, createEl() {} };
  constructor(app?: any, plugin?: any) { this.app = app; this.plugin = plugin; }
}

class SettingControl {
  setPlaceholder(): this { return this; }
  setValue(): this { return this; }
  setButtonText(): this { return this; }
  addOption(): this { return this; }
  onChange(): this { return this; }
  onClick(): this { return this; }
}

export class Setting {
  constructor(_container?: any) {}
  setName(): this { return this; }
  setDesc(): this { return this; }
  setHeading(): this { return this; }
  addDropdown(callback: (control: SettingControl) => void): this { callback(new SettingControl()); return this; }
  addText(callback: (control: SettingControl) => void): this { callback(new SettingControl()); return this; }
  addTextArea(callback: (control: SettingControl) => void): this { callback(new SettingControl()); return this; }
  addToggle(callback: (control: SettingControl) => void): this { callback(new SettingControl()); return this; }
  addButton(callback: (control: SettingControl) => void): this { callback(new SettingControl()); return this; }
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\.\//, "");
}

export async function requestUrl(): Promise<any> {
  throw new Error("requestUrl is not available in unit tests");
}

export function setIcon(_parent: HTMLElement, _iconId: string): void {}
