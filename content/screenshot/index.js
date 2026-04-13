import { autoCapture } from "./autoCapture.js";
import { regionSelect } from "./regionSelect.js";

export async function captureScreenshot(mode, element) {
  if (mode === "regionSelect") {
    return await regionSelect();
  }
  return await autoCapture(element);
}
