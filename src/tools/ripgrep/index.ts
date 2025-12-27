/**
 * Ripgrep Binary Management
 *
 * Provides the path to the bundled ripgrep binary based on the current platform.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Get the platform-specific binary name
 */
function getBinaryName(): string {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'win32') {
    return 'rg.exe';
  }

  // For Unix-like systems, we use platform-arch naming
  if (platform === 'darwin') {
    return arch === 'arm64' ? 'rg-darwin-arm64' : 'rg-darwin-x64';
  }

  if (platform === 'linux') {
    return arch === 'arm64' ? 'rg-linux-arm64' : 'rg-linux-x64';
  }

  throw new Error(`Unsupported platform: ${platform}-${arch}`);
}

/**
 * Get the path to the bundled ripgrep binary
 */
export function getRipgrepPath(): string {
  const binaryName = getBinaryName();
  const bundledPath = path.join(__dirname, 'bin', binaryName);

  // Check if bundled binary exists
  if (fs.existsSync(bundledPath)) {
    return bundledPath;
  }

  // Fallback to system ripgrep
  return 'rg';
}

/**
 * Check if ripgrep is available
 */
export async function isRipgrepAvailable(): Promise<boolean> {
  const rgPath = getRipgrepPath();

  return new Promise((resolve) => {
    const rg = spawn(rgPath, ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    rg.on('close', (code) => {
      resolve(code === 0);
    });

    rg.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Get ripgrep version
 */
export async function getRipgrepVersion(): Promise<string | null> {
  const rgPath = getRipgrepPath();

  return new Promise((resolve) => {
    const rg = spawn(rgPath, ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';

    rg.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    rg.on('close', (code) => {
      if (code === 0) {
        // Output format: "ripgrep 14.1.0\n..."
        const match = stdout.match(/ripgrep\s+(\d+\.\d+\.\d+)/);
        resolve(match ? match[1] : null);
      } else {
        resolve(null);
      }
    });

    rg.on('error', () => {
      resolve(null);
    });
  });
}
