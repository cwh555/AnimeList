export interface FeatureInstaller<PluginHost> {
  readonly id: string;
  readonly order?: number;
  install(plugin: PluginHost): void | Promise<void>;
}

function compareInstallers<PluginHost>(
  left: FeatureInstaller<PluginHost>,
  right: FeatureInstaller<PluginHost>,
): number {
  return (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id);
}

export async function installFeatureSet<PluginHost>(
  plugin: PluginHost,
  installers: readonly FeatureInstaller<PluginHost>[],
): Promise<void> {
  const seen = new Set<string>();
  const ordered = [...installers].sort(compareInstallers);

  for (const installer of ordered) {
    if (seen.has(installer.id)) {
      throw new Error(`Duplicate feature installer: ${installer.id}`);
    }
    seen.add(installer.id);
  }

  for (const installer of ordered) {
    await installer.install(plugin);
  }
}
