import { describe, expect, it } from "vitest";
import { parseVoiceLog, wordsToNumbers } from "../src/voice";

describe("wordsToNumbers", () => {
  it.each([
    ["seven point five", "7.5"],
    ["seven and a half", "7.5"],
    ["twenty five", "25"],
    ["twelve and half", "12.5"],
    ["7,5 kg", "7.5 kg"],
    ["15kg", "15 kg"],
  ])("%s -> %s", (input, expected) => {
    expect(wordsToNumbers(input)).toBe(expected);
  });
});

describe("parseVoiceLog", () => {
  it("parses per-hand dumbbell weight and reps", () => {
    expect(parseVoiceLog("two dumbbells, seven and a half kilos each, twelve reps")).toMatchObject({
      equipmentKind: "dumbbell",
      weightKg: 7.5,
      weightIsTotal: false,
      reps: 12,
    });
  });

  it("parses a total weight and the exercise name", () => {
    expect(parseVoiceLog("bent over row 15 kg total")).toMatchObject({
      exerciseId: "bent_over_row",
      weightKg: 15,
      weightIsTotal: true,
    });
  });

  it("maps a swing with a dumbbell to the dumbbell swing", () => {
    expect(parseVoiceLog("swings with the dumbbell")).toMatchObject({
      exerciseId: "dumbbell_swing",
      equipmentKind: "dumbbell",
    });
  });

  it("parses a kettlebell swing", () => {
    expect(parseVoiceLog("kettlebell swing twelve kilo")).toMatchObject({
      exerciseId: "kettlebell_swing",
      equipmentKind: "kettlebell",
      weightKg: 12,
    });
  });

  it("converts pounds", () => {
    expect(parseVoiceLog("25 pounds").weightKg).toBe(11.3);
  });

  it("recognises commands", () => {
    expect(parseVoiceLog("okay start").command).toBe("start");
    expect(parseVoiceLog("done, that was hard").command).toBe("stop");
    expect(parseVoiceLog("done, that was hard").rpe).toBe(8.5);
  });

  it("ignores unrelated speech", () => {
    expect(parseVoiceLog("hold on my phone is ringing")).toEqual({});
  });
});
