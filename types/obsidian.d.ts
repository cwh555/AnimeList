/* eslint-disable @typescript-eslint/no-explicit-any -- Minimal compile-time shim mirrors external Obsidian API boundaries without bundling runtime types. */
declare global {
  interface HTMLElement {
    empty(): void;
    createDiv(options?: string | { cls?: string; text?: string; attr?: Record<string, string> }): HTMLDivElement;
    createSpan(options?: string | { cls?: string; text?: string; attr?: Record<string, string> }): HTMLSpanElement;
    createEl<K extends keyof HTMLElementTagNameMap>(
      tag: K,
      options?: string | { cls?: string; text?: string; attr?: Record<string, string>; type?: string; value?: string },
    ): HTMLElementTagNameMap[K];
    addClass(...classes: string[]): void;
    removeClass(...classes: string[]): void;
    toggleClass(className: string, value?: boolean): void;
    setText(text: string): void;
  }
}

declare module "obsidian" {
  export interface RequestUrlParam {
    url: string;
    method?: string;
    contentType?: string;
    body?: string | ArrayBuffer;
    headers?: Record<string, string>;
    throw?: boolean;
  }

  export interface RequestUrlResponse {
    status: number;
    headers: Record<string, string>;
    arrayBuffer: ArrayBuffer;
    json: any;
    text: string;
  }

  export class Component {
    addChild<T extends Component>(component: T): T;
    removeChild<T extends Component>(component: T): T;
    register(callback: () => void): void;
  }

  export class MarkdownRenderChild extends Component {
    containerEl: HTMLElement;
    constructor(containerEl: HTMLElement);
    onload(): void;
    onunload(): void;
  }

  export class TAbstractFile {
    path: string;
    name: string;
    parent: TFolder | null;
  }

  export class TFile extends TAbstractFile {
    basename: string;
    extension: string;
    stat: { ctime: number; mtime: number; size: number };
  }

  export class TFolder extends TAbstractFile {
    children: TAbstractFile[];
  }

  export class WorkspaceLeaf {
    setViewState(state: any): Promise<void>;
    getViewState(): any;
  }

  export class App {
    vault: any;
    workspace: any;
    metadataCache: any;
    fileManager: any;
  }

  export class Plugin extends Component {
    app: App;
    manifest: any;
    registerView(type: string, creator: (leaf: WorkspaceLeaf) => ItemView): void;
    registerMarkdownCodeBlockProcessor(language: string, processor: (...args: any[]) => any): void;
    registerEvent(eventRef: any): void;
    addRibbonIcon(icon: string, title: string, callback: (event: MouseEvent) => any): HTMLElement;
    addCommand(command: any): any;
    addSettingTab(settingTab: PluginSettingTab): void;
    loadData(): Promise<any>;
    saveData(data: any): Promise<void>;
  }

  export class ItemView extends Component {
    app: App;
    leaf: WorkspaceLeaf;
    containerEl: HTMLElement;
    contentEl: HTMLElement;
    constructor(leaf: WorkspaceLeaf);
    getViewType(): string;
    getDisplayText(): string;
    getIcon(): string;
    onOpen(): Promise<void> | void;
    onClose(): Promise<void> | void;
  }

  export class Modal {
    app: App;
    contentEl: HTMLElement;
    modalEl: HTMLElement;
    titleEl: HTMLElement;
    constructor(app: App);
    open(): void;
    close(): void;
    onOpen(): void;
    onClose(): void;
    setTitle(title: string): this;
  }

  export class Notice {
    constructor(message: string | DocumentFragment, timeout?: number);
    hide(): void;
    setMessage(message: string | DocumentFragment): this;
  }

  export class PluginSettingTab {
    containerEl: HTMLElement;
    constructor(app: App, plugin: Plugin);
    display(): void;
    hide(): void;
  }

  export class TextComponent {
    inputEl: HTMLInputElement;
    setPlaceholder(value: string): this;
    setValue(value: string): this;
    onChange(callback: (value: string) => any): this;
  }

  export class TextAreaComponent {
    inputEl: HTMLTextAreaElement;
    setPlaceholder(value: string): this;
    setValue(value: string): this;
    onChange(callback: (value: string) => any): this;
  }

  export class DropdownComponent {
    selectEl: HTMLSelectElement;
    addOption(value: string, display: string): this;
    addOptions(options: Record<string, string>): this;
    setValue(value: string): this;
    onChange(callback: (value: string) => any): this;
  }

  export class ToggleComponent {
    toggleEl: HTMLElement;
    setValue(value: boolean): this;
    onChange(callback: (value: boolean) => any): this;
  }

  export class ButtonComponent {
    buttonEl: HTMLButtonElement;
    setButtonText(value: string): this;
    setIcon(icon: string): this;
    setTooltip(tooltip: string): this;
    setCta(): this;
    setWarning(): this;
    onClick(callback: (event: MouseEvent) => any): this;
  }

  export class Setting {
    settingEl: HTMLElement;
    nameEl: HTMLElement;
    descEl: HTMLElement;
    controlEl: HTMLElement;
    constructor(containerEl: HTMLElement);
    setName(name: string | DocumentFragment): this;
    setDesc(desc: string | DocumentFragment): this;
    setHeading(): this;
    addText(callback: (component: TextComponent) => any): this;
    addTextArea(callback: (component: TextAreaComponent) => any): this;
    addDropdown(callback: (component: DropdownComponent) => any): this;
    addToggle(callback: (component: ToggleComponent) => any): this;
    addButton(callback: (component: ButtonComponent) => any): this;
  }

  export function normalizePath(path: string): string;
  export function requestUrl(request: RequestUrlParam | string): Promise<RequestUrlResponse>;
  export function setIcon(parent: HTMLElement, iconId: string): void;
}

export {};
