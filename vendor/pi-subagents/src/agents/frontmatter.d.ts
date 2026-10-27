/**
 * Normalize a simple-scalar frontmatter list from comma-separated or block-list syntax.
 * Only the standard `- item` marker is removed; ordinary hyphenated values stay intact.
 * A trailing ` #...` comment is dropped from unquoted `- item` lines. Single-line values are left
 * alone because parseFrontmatter has already removed their quotes, so `"notes #1.md"` must survive.
 */
export declare function parseFrontmatterList(raw: string | undefined): string[] | undefined;
/** A tool or extension name list whose items may each be quoted, as in `"read", "bash"` or `- "read"`. */
export declare function parseUnquotedList(raw: string | undefined): string[] | undefined;
/**
 * Parse YAML frontmatter from agent/chain files.
 * Handles both flat (key: value) and nested block (key: \n  sub: val) values.
 * Block values are stored as single strings with embedded newlines.
 * The indentation of the block content is preserved relative to the key.
 */
export declare function parseFrontmatter(content: string): {
    frontmatter: Record<string, string>;
    body: string;
};
