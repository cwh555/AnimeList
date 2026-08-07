export function commaSeparatedValues(value) {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

export function parseTestArguments(arguments_, suitesCatalog, featuresCatalog) {
  const suites = new Set();
  const features = new Set();
  let list = false;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--all") continue;
    if (argument === "--list") {
      list = true;
      continue;
    }
    if (argument === "--suite") {
      const value = arguments_[index + 1];
      if (!value) throw new Error("--suite requires a suite name");
      commaSeparatedValues(value).forEach((entry) => suites.add(entry));
      index += 1;
      continue;
    }
    if (argument === "--feature") {
      const value = arguments_[index + 1];
      if (!value) throw new Error("--feature requires a feature name");
      commaSeparatedValues(value).forEach((entry) => features.add(entry));
      index += 1;
      continue;
    }
    throw new Error(`Unknown test argument: ${argument}`);
  }

  for (const suite of suites) {
    if (!suitesCatalog.includes(suite)) throw new Error(`Unknown test suite: ${suite}`);
  }
  for (const feature of features) {
    if (!featuresCatalog.includes(feature)) throw new Error(`Unknown test feature: ${feature}`);
  }
  return { suites, features, list };
}

export function selectTestTargets(targets, filters) {
  return targets.filter((target) => {
    const suiteMatch = filters.suites.size === 0 || filters.suites.has(target.suite);
    const featureMatch = filters.features.size === 0
      || target.features.some((feature) => filters.features.has(feature));
    return suiteMatch && featureMatch;
  });
}
