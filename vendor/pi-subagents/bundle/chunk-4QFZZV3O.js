// src/runs/shared/herdr-pi-protocol.ts
var HERDR_PI_PROTOCOL = 1;
var HERDR_PI_MAX_FRAME_BYTES = 1024 * 1024;
var HERDR_PI_MODE_ENV = "PI_SUBAGENTS_HERDR_BRIDGE";
var HERDR_PI_RUN_ENV = "PI_SUBAGENTS_HERDR_RUN_ID";
var HERDR_PI_RUNTIME_DIR_ENV = "PI_SUBAGENTS_HERDR_RUNTIME_DIR";
var SAFE_ID = /^[A-Za-z0-9_-]{8,96}$/u;
function validateHerdrPiRunId(value) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw new Error("Herdr Pi bridge run identity is invalid.");
  return value;
}
function encodeHerdrPiFrame(frame) {
  const data = Buffer.from(`${JSON.stringify(frame)}
`, "utf8");
  if (data.byteLength > HERDR_PI_MAX_FRAME_BYTES) throw new Error(`Herdr Pi frame exceeds ${HERDR_PI_MAX_FRAME_BYTES} bytes.`);
  return data;
}
var HerdrPiFrameDecoder = class {
  #buffer = Buffer.alloc(0);
  push(chunk) {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    if (this.#buffer.byteLength > HERDR_PI_MAX_FRAME_BYTES) throw new Error(`Herdr Pi frame exceeds ${HERDR_PI_MAX_FRAME_BYTES} bytes.`);
    const frames = [];
    for (; ; ) {
      const newline = this.#buffer.indexOf(10);
      if (newline < 0) break;
      const line = this.#buffer.subarray(0, newline);
      this.#buffer = this.#buffer.subarray(newline + 1);
      let value;
      try {
        value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(line));
      } catch {
        throw new Error("Herdr Pi bridge emitted malformed JSON or UTF-8.");
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Herdr Pi bridge frame must be an object.");
      const frame = value;
      if (frame.protocol !== HERDR_PI_PROTOCOL || typeof frame.type !== "string") throw new Error("Herdr Pi bridge protocol mismatch.");
      validateHerdrPiRunId(frame.runId);
      frames.push(frame);
    }
    return frames;
  }
  end() {
    if (this.#buffer.byteLength) throw new Error("Herdr Pi bridge ended with a partial frame.");
  }
};

export {
  HERDR_PI_PROTOCOL,
  HERDR_PI_MAX_FRAME_BYTES,
  HERDR_PI_MODE_ENV,
  HERDR_PI_RUN_ENV,
  HERDR_PI_RUNTIME_DIR_ENV,
  validateHerdrPiRunId,
  encodeHerdrPiFrame,
  HerdrPiFrameDecoder
};
