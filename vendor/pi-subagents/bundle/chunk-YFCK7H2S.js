// src/shared/display-text.ts
function codePointWidth(codePoint) {
  return codePoint > 65535 ? 2 : 1;
}
function isWhitespaceOrControl(codePoint) {
  if (codePoint <= 32 || codePoint >= 127 && codePoint <= 159) return true;
  if (codePoint >= 55296 && codePoint <= 57343) return true;
  return String.fromCodePoint(codePoint).trim().length === 0;
}
function consumeControlString(value, index, osc) {
  while (index < value.length) {
    const codePoint = value.codePointAt(index);
    const width = codePointWidth(codePoint);
    if (osc && codePoint === 7) return index + width;
    if (codePoint === 156) return index + width;
    if (codePoint === 27 && value.charCodeAt(index + 1) === 92) return index + 2;
    index += width;
  }
  return value.length;
}
function consumeCsi(value, index) {
  while (index < value.length) {
    const codePoint = value.codePointAt(index);
    const width = codePointWidth(codePoint);
    if (codePoint >= 64 && codePoint <= 126) return index + width;
    index += width;
  }
  return value.length;
}
function sanitizeDisplayText(value) {
  const output = [];
  let pendingSpace = false;
  const appendSpace = () => {
    if (output.length > 0) pendingSpace = true;
  };
  const appendText = (text) => {
    if (pendingSpace) output.push(" ");
    output.push(text);
    pendingSpace = false;
  };
  for (let index = 0; index < value.length; ) {
    const codePoint = value.codePointAt(index);
    const width = codePointWidth(codePoint);
    if (codePoint === 27) {
      const next = value.charCodeAt(index + 1);
      appendSpace();
      if (next === 91) {
        index = consumeCsi(value, index + 2);
        continue;
      }
      if (next === 93 || next === 80 || next === 88 || next === 94 || next === 95) {
        index = consumeControlString(value, index + 2, next === 93);
        continue;
      }
      index += next ? 2 : 1;
      continue;
    }
    if (codePoint === 155) {
      appendSpace();
      index = consumeCsi(value, index + width);
      continue;
    }
    if (codePoint === 144 || codePoint === 152 || codePoint === 157 || codePoint === 158 || codePoint === 159) {
      appendSpace();
      index = consumeControlString(value, index + width, codePoint === 157);
      continue;
    }
    if (isWhitespaceOrControl(codePoint)) appendSpace();
    else appendText(String.fromCodePoint(codePoint));
    index += width;
  }
  return output.join("");
}
function truncateDisplayText(value, maxLength) {
  if (maxLength <= 0) return "";
  if (value.length <= maxLength) return value;
  let output = "";
  for (const char of value) {
    if (output.length + char.length > maxLength) break;
    output += char;
  }
  return output;
}
function previewDisplayText(value, maxLength) {
  const normalized = sanitizeDisplayText(value);
  if (normalized.length <= maxLength) return normalized;
  if (maxLength <= 3) return truncateDisplayText(normalized, maxLength);
  return `${truncateDisplayText(normalized, maxLength - 3)}...`;
}
var BINARY_CONTENT_PLACEHOLDER = "[binary content omitted for safe display]";
function isUnsafeTerminalCodePoint(codePoint) {
  const terminalControl = codePoint <= 31 && codePoint !== 9 && codePoint !== 10 || codePoint >= 127 && codePoint <= 159;
  const bidiControl = codePoint === 1564 || codePoint === 8206 || codePoint === 8207 || codePoint >= 8234 && codePoint <= 8238 || codePoint >= 8294 && codePoint <= 8297;
  const privateUse = codePoint >= 57344 && codePoint <= 63743 || codePoint >= 983040 && codePoint <= 1048573 || codePoint >= 1048576 && codePoint <= 1114109;
  const invalidScalar = codePoint >= 55296 && codePoint <= 57343;
  const nonCharacter = codePoint >= 64976 && codePoint <= 65007 || (codePoint & 65535) === 65534 || (codePoint & 65535) === 65535;
  return terminalControl || bidiControl || privateUse || invalidScalar || nonCharacter;
}
function looksLikeBinaryContent(text) {
  if (text.includes("\0")) return true;
  let suspiciousControls = 0;
  let replacementCharacters = 0;
  let codePoints = 0;
  for (const character of text) {
    codePoints++;
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 8 || codePoint >= 14 && codePoint <= 31) suspiciousControls++;
    if (codePoint === 65533) replacementCharacters++;
  }
  if (codePoints === 0) return false;
  return suspiciousControls >= 4 && suspiciousControls / codePoints >= 0.1 || replacementCharacters >= 3 && replacementCharacters / codePoints >= 0.1;
}
function safeTerminalText(value) {
  const normalized = value.replace(/\r\n/g, "\n");
  if (looksLikeBinaryContent(normalized)) return BINARY_CONTENT_PLACEHOLDER;
  let safe = "";
  for (const character of normalized) {
    const codePoint = character.codePointAt(0) ?? 0;
    safe += isUnsafeTerminalCodePoint(codePoint) ? `[U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}]` : character;
  }
  return safe;
}

export {
  sanitizeDisplayText,
  truncateDisplayText,
  previewDisplayText,
  safeTerminalText
};
