interface ParsedPath {
  root: string;
  separator: "/" | "\\";
  segments: string[];
}

function parsePath(filePath: string): ParsedPath {
  const windowsRoot = filePath.match(/^[A-Za-z]:[\\/]/)?.[0];
  if (windowsRoot) {
    return {
      root: windowsRoot,
      separator: "\\",
      segments: filePath
        .slice(windowsRoot.length)
        .split(/[\\/]+/)
        .filter(Boolean),
    };
  }

  const posixRoot = filePath.startsWith("/") ? "/" : "";
  return {
    root: posixRoot,
    separator: "/",
    segments: filePath
      .slice(posixRoot.length)
      .split(/[\\/]+/)
      .filter(Boolean),
  };
}

export function dirname(filePath: string): string {
  const match = filePath.match(/^(.*)[\\/][^\\/]+$/);
  if (match?.[1]) return match[1];
  return filePath;
}

export function basename(filePath: string): string {
  const { segments } = parsePath(filePath);
  return segments.at(-1) ?? filePath;
}

export function parentDir(filePath: string): string {
  const { root, separator, segments } = parsePath(filePath);

  if (segments.length <= 1) {
    return root || filePath;
  }

  const parent = segments.slice(0, -1).join(separator);

  if (!root) return parent || ".";
  return parent ? `${root}${parent}` : root;
}
