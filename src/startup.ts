import type { ComponentType } from "react";
import ComingSoon from "./ComingSoon";
import { isFullAppEnabled } from "./firebase";

export async function getStartupContent(hostname: string): Promise<ComponentType> {
  if (!(await isFullAppEnabled(hostname))) return ComingSoon;

  return (await import("./App")).default;
}
