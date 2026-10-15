import { describe, expect, it } from "vitest";
import { formatMeters, LASER_PROFILES, profileForService } from "@/lib/laser-meter";

const disto = LASER_PROFILES.find((p) => p.id === "disto")!;
const bosch = LASER_PROFILES.find((p) => p.id === "bosch")!;

function float(m: number, size = 4, offset = 0, head: number[] = []) {
  const v = new DataView(new ArrayBuffer(size));
  head.forEach((b, i) => v.setUint8(i, b));
  v.setFloat32(offset, m, true);
  return v;
}

describe("télémètres laser Bluetooth", () => {
  it("lit la distance d'un Leica DISTO", () => {
    expect(disto.read(float(3.456))).toBe(3.456);
    expect(disto.read(new DataView(new ArrayBuffer(2)))).toBeNull();
    expect(disto.read(float(-1))).toBeNull();
    expect(disto.read(float(Number.NaN))).toBeNull();
  });

  it("lit la trame de mesure d'un Bosch GLM et ignore les autres", () => {
    expect(bosch.read(float(2.5, 12, 7, [0xc0, 0x55, 0x10, 0x06]))).toBe(2.5);
    expect(bosch.read(float(2.5, 12, 7, [0xc0, 0x55, 0x02]))).toBeNull();
    expect(bosch.read(float(2.5, 8, 0))).toBeNull();
    expect(bosch.enable).toEqual([0xc0, 0x55, 0x02, 0x01, 0x00, 0x1a]);
  });

  it("reconnaît l'appareil par son service et formate la cote", () => {
    expect(profileForService("3AB10100-F831-4395-B29D-570977D5BF94")?.id).toBe("disto");
    expect(profileForService("0000180f-0000-1000-8000-00805f9b34fb")).toBeNull();
    expect(formatMeters(4.1)).toBe("4,10");
    expect(formatMeters(2.996)).toBe("3,00");
  });
});
