// Code Structure Parser - Step 6
// Lightweight parsing for TypeScript/JavaScript to extract imports and dependencies

export type ImportInfo = {
  source: string; // Module being imported from
  specifiers: string[]; // What's being imported
  isDefault: boolean;
  isDynamic: boolean;
};

export type ExportInfo = {
  name: string;
  isDefault: boolean;
  type: "function" | "class" | "const" | "type" | "interface" | "unknown";
};

export type FileStructure = {
  path: string;
  imports: ImportInfo[];
  exports: ExportInfo[];
  dependencies: string[]; // Resolved file paths (relative imports)
};

/**
 * Parse imports from TypeScript/JavaScript code
 * Handles: import, require, dynamic import()
 */
export function parseImports(code: string, filePath: string): ImportInfo[] {
  const imports: ImportInfo[] = [];

  // ES6 import statements
  // import { foo, bar } from './module'
  // import foo from './module'
  // import * as foo from './module'
  const importRegex =
    /import\s+(?:(?:(\w+)|{([^}]+)}|\*\s+as\s+(\w+))\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;

  while ((match = importRegex.exec(code)) !== null) {
    const [, defaultImport, namedImports, namespaceImport, source] = match;
    const specifiers: string[] = [];
    let isDefault = false;

    if (defaultImport) {
      specifiers.push(defaultImport);
      isDefault = true;
    } else if (namedImports) {
      specifiers.push(...namedImports.split(",").map((s) => s.trim()));
    } else if (namespaceImport) {
      specifiers.push(namespaceImport);
    }

    imports.push({
      source,
      specifiers,
      isDefault,
      isDynamic: false,
    });
  }

  // CommonJS require
  // const foo = require('./module')
  const requireRegex = /require\s*\(['"]([^'"]+)['"]\)/g;
  while ((match = requireRegex.exec(code)) !== null) {
    imports.push({
      source: match[1],
      specifiers: [],
      isDefault: true,
      isDynamic: false,
    });
  }

  // Dynamic imports
  // import('./module')
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportRegex.exec(code)) !== null) {
    imports.push({
      source: match[1],
      specifiers: [],
      isDefault: false,
      isDynamic: true,
    });
  }

  return imports;
}

/**
 * Parse exports from TypeScript/JavaScript code
 */
export function parseExports(code: string): ExportInfo[] {
  const exports: ExportInfo[] = [];

  // export default
  const defaultExportRegex =
    /export\s+default\s+(function|class|const|let|var)?\s*(\w+)?/g;
  let match;

  while ((match = defaultExportRegex.exec(code)) !== null) {
    const type = (match[1] as ExportInfo["type"]) || "unknown";
    const name = match[2] || "default";
    exports.push({ name, isDefault: true, type });
  }

  // export function/class/const
  const namedExportRegex =
    /export\s+(function|class|const|let|var|interface|type)\s+(\w+)/g;
  while ((match = namedExportRegex.exec(code)) !== null) {
    const type = match[1] as ExportInfo["type"];
    const name = match[2];
    exports.push({ name, isDefault: false, type });
  }

  // export { foo, bar }
  const exportListRegex = /export\s*{([^}]+)}/g;
  while ((match = exportListRegex.exec(code)) !== null) {
    const names = match[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]);
    names.forEach((name) => {
      exports.push({ name, isDefault: false, type: "unknown" });
    });
  }

  return exports;
}

/**
 * Resolve relative import path to absolute file path
 */
export function resolveImportPath(
  importSource: string,
  currentFilePath: string
): string | null {
  // Ignore external packages (node_modules)
  if (!importSource.startsWith(".") && !importSource.startsWith("/")) {
    return null;
  }

  // Get directory of current file
  const parts = currentFilePath.split("/");
  parts.pop(); // Remove filename
  const currentDir = parts.join("/");

  // Resolve relative path
  let resolvedPath = importSource;

  if (importSource.startsWith("./") || importSource.startsWith("../")) {
    const importParts = importSource.split("/");
    const dirParts = currentDir.split("/");

    for (const part of importParts) {
      if (part === ".") {
        continue;
      } else if (part === "..") {
        dirParts.pop();
      } else {
        dirParts.push(part);
      }
    }

    resolvedPath = dirParts.join("/");
  }

  // Add common extensions if not present
  if (!/\.(ts|tsx|js|jsx)$/.test(resolvedPath)) {
    // Try common extensions in order
    const extensions = [
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      "/index.ts",
      "/index.tsx",
      "/index.js",
    ];
    for (const ext of extensions) {
      return resolvedPath + ext;
    }
  }

  return resolvedPath;
}

/**
 * Build complete file structure with dependencies
 */
export function analyzeFileStructure(
  filePath: string,
  code: string
): FileStructure {
  const imports = parseImports(code, filePath);
  const exports = parseExports(code);

  // Resolve import paths to dependencies
  const dependencies = imports
    .map((imp) => resolveImportPath(imp.source, filePath))
    .filter((path): path is string => path !== null);

  return {
    path: filePath,
    imports,
    exports,
    dependencies,
  };
}

/**
 * Extract function and class names for better context
 */
export function extractDefinitions(code: string): {
  functions: string[];
  classes: string[];
  types: string[];
} {
  const functions: string[] = [];
  const classes: string[] = [];
  const types: string[] = [];

  // Function declarations and expressions
  const functionRegex =
    /(?:function|const|let|var)\s+(\w+)\s*(?:=\s*)?(?:async\s*)?\(/g;
  let match;
  while ((match = functionRegex.exec(code)) !== null) {
    functions.push(match[1]);
  }

  // Arrow functions assigned to variables
  const arrowFunctionRegex = /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/g;
  while ((match = arrowFunctionRegex.exec(code)) !== null) {
    if (!functions.includes(match[1])) {
      functions.push(match[1]);
    }
  }

  // Class declarations
  const classRegex = /class\s+(\w+)/g;
  while ((match = classRegex.exec(code)) !== null) {
    classes.push(match[1]);
  }

  // Type and interface declarations
  const typeRegex = /(?:type|interface)\s+(\w+)/g;
  while ((match = typeRegex.exec(code)) !== null) {
    types.push(match[1]);
  }

  return { functions, classes, types };
}

/**
 * Detect if a file is a test file
 */
export function isTestFile(filePath: string): boolean {
  return (
    /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filePath) ||
    /\/__tests__\//.test(filePath)
  );
}

/**
 * Detect file type based on content and path
 */
export function detectFileType(
  filePath: string,
  code: string
): {
  isComponent: boolean;
  isHook: boolean;
  isUtil: boolean;
  isConfig: boolean;
  isTest: boolean;
  isAPI: boolean;
} {
  const isReactComponent =
    /\.tsx$/.test(filePath) &&
    (/export\s+default\s+function/.test(code) ||
      /export\s+function/.test(code));

  const isHook = /use[A-Z]\w+/.test(code) && /\.tsx?$/.test(filePath);
  const isUtil = /\/utils?\//.test(filePath) || /\/helpers?\//.test(filePath);
  const isConfig = /\.config\.(ts|js)$/.test(filePath);
  const isTest = isTestFile(filePath);
  const isAPI = /\/api\//.test(filePath) || /\/routes?\//.test(filePath);

  return {
    isComponent: isReactComponent,
    isHook,
    isUtil,
    isConfig,
    isTest,
    isAPI,
  };
}
