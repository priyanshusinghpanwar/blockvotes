import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.blockvotes.mobile",
  appName: "BlockVotes",
  webDir: "dist/public",
  bundledWebRuntime: false,
  android: {
    backgroundColor: "#0f172a",
  },
  ios: {
    backgroundColor: "#0f172a",
  },
};

export default config;
