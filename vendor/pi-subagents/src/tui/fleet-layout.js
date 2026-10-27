/** Coordinates are overlay-local, matching Pi's normalized input contract. */
export function fleetLayout(width, rows, selected, items) {
    if (width < 36)
        return undefined;
    const bodyHeight = Math.max(2, Math.floor(rows * 0.85) - 6);
    const rosterWidth = Math.max(22, Math.min(46, Math.floor((width - 3) * 0.38)));
    const rosterStart = Math.max(0, Math.min(selected - bodyHeight + 1, Math.max(0, items.length - bodyHeight)));
    return {
        width, rows, bodyHeight, rosterStart,
        roster: { x: 1, y: 3, width: rosterWidth, height: bodyHeight },
        output: { x: rosterWidth + 2, y: 3, width: Math.max(1, width - rosterWidth - 3), height: bodyHeight },
        rosterKeys: items.slice(rosterStart, rosterStart + bodyHeight).map((item) => item.key),
    };
}
export function fleetContains(rect, x, y) {
    return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}
