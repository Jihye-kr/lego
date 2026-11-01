import { describe, expect, it } from "vitest";
import { migrateSettings } from "./settings";

describe("migrateSettings", () => {
  it("v0·v2(도보+여유 분리) 저장값을 leadMinutes 하나로 합친다", () => {
    const split = { station: "강남", subwayId: "1002", direction: "내선", walkMinutes: 7, bufferMinutes: 2, setupDone: true };
    const merged = { station: "강남", subwayId: "1002", direction: "내선", leadMinutes: 9, setupDone: true };
    expect(migrateSettings(split, 0)).toEqual(merged);
    expect(migrateSettings(split, 2)).toEqual(merged);
  });

  it("v1은 그대로", () => {
    expect(migrateSettings({ leadMinutes: 8, setupDone: true }, 1)).toEqual({ leadMinutes: 8, setupDone: true });
  });

  it("값이 빠진 분리 저장값은 기본값 6분", () => {
    expect(migrateSettings({ setupDone: false }, 0)).toMatchObject({ leadMinutes: 6 });
  });
});
