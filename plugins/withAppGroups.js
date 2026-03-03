const { withEntitlementsPlist, withXcodeProject } = require("@expo/config-plugins");

function withAppGroups(config, { groups }) {
  config = withEntitlementsPlist(config, (mod) => {
    mod.modResults["com.apple.security.application-groups"] = groups;
    return mod;
  });

  config = withXcodeProject(config, (mod) => {
    const proj = mod.modResults;
    const targetName = mod.modRequest.projectName;

    const targets = proj.pbxNativeTargetSection();
    for (const key in targets) {
      if (typeof targets[key] === "string") continue;
      const target = targets[key];
      if (target.name === `"${targetName}"` || target.name === targetName) {
        const buildConfigs = proj.pbxXCBuildConfigurationSection();
        if (target.buildConfigurationList) {
          const configList = proj.pbxXCConfigurationList()[target.buildConfigurationList];
          if (configList && configList.buildConfigurations) {
            for (const bc of configList.buildConfigurations) {
              const buildConfig = buildConfigs[bc.value];
              if (buildConfig && buildConfig.buildSettings) {
                buildConfig.buildSettings.CODE_SIGN_ENTITLEMENTS = `${targetName}/${targetName}.entitlements`;
              }
            }
          }
        }
      }
    }

    return mod;
  });

  return config;
}

module.exports = withAppGroups;
