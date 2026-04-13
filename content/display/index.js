import * as floatingDot from "./floatingDot.js";
import * as urlHash from "./urlHash.js";
import * as consoleLog from "./consoleLog.js";
import * as sidebar from "./sidebar.js";
import * as tooltip from "./tooltip.js";
import * as hiddenField from "./hiddenField.js";

const modes = {
  floatingDot,
  urlHash,
  consoleLog,
  sidebar,
  tooltip,
  hiddenField
};

export function show(mode, data, settings) {
  const handler = modes[mode] || modes.floatingDot;
  handler.mount(data, settings);
}

export function hide(mode) {
  const handler = modes[mode] || modes.floatingDot;
  handler.unmount();
}

export function refresh(mode, data, settings) {
  const handler = modes[mode] || modes.floatingDot;
  handler.update(data, settings);
}

export function hideAll() {
  for (const handler of Object.values(modes)) {
    handler.unmount();
  }
}
