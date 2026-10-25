export interface FleetRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface FleetLayout {
    width: number;
    rows: number;
    bodyHeight: number;
    roster: FleetRect;
    output: FleetRect;
    rosterStart: number;
    rosterKeys: string[];
}
/** Coordinates are overlay-local, matching Pi's normalized input contract. */
export declare function fleetLayout(width: number, rows: number, selected: number, items: readonly {
    key: string;
}[]): FleetLayout | undefined;
export declare function fleetContains(rect: FleetRect, x: number, y: number): boolean;
