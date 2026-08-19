const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const defaultConfig = getDefaultConfig(__dirname);
const reactNativePath = path.resolve(__dirname, 'node_modules/react-native');

const config = {
	resolver: {
		resolveRequest: (context, moduleName, platform) => {
			if (moduleName === 'react-native/asset-registry') {
				return {
					filePath: path.resolve(
						__dirname,
						'node_modules/react-native-macos/Libraries/Image/AssetRegistry.js',
					),
					type: 'sourceFile',
				};
			}

			if (moduleName.endsWith('src/private/devsupport/rndevtools/ReactDevToolsSettingsManager')) {
				return {
					filePath: path.join(
						reactNativePath,
						'src/private/devsupport/rndevtools/ReactDevToolsSettingsManager.ios.js',
					),
					type: 'sourceFile',
				};
			}

			return context.resolveRequest(context, moduleName, platform);
		},
	},
};

module.exports = mergeConfig(defaultConfig, config);
