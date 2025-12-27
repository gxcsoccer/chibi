#!/usr/bin/env npx tsx
/**
 * Download Ripgrep Binaries
 *
 * Downloads pre-built ripgrep binaries for different platforms.
 * Run with: npx tsx scripts/download-ripgrep.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN_DIR = path.join(__dirname, '..', 'src', 'tools', 'ripgrep', 'bin');

// Ripgrep version to download
const RG_VERSION = '14.1.1';

// Platform configurations
const PLATFORMS = [
  {
    name: 'darwin-x64',
    archive: `ripgrep-${RG_VERSION}-x86_64-apple-darwin.tar.gz`,
    binary: 'rg',
    outputName: 'rg-darwin-x64',
  },
  {
    name: 'darwin-arm64',
    archive: `ripgrep-${RG_VERSION}-aarch64-apple-darwin.tar.gz`,
    binary: 'rg',
    outputName: 'rg-darwin-arm64',
  },
  {
    name: 'linux-x64',
    archive: `ripgrep-${RG_VERSION}-x86_64-unknown-linux-musl.tar.gz`,
    binary: 'rg',
    outputName: 'rg-linux-x64',
  },
  {
    name: 'linux-arm64',
    archive: `ripgrep-${RG_VERSION}-aarch64-unknown-linux-gnu.tar.gz`,
    binary: 'rg',
    outputName: 'rg-linux-arm64',
  },
  {
    name: 'win32-x64',
    archive: `ripgrep-${RG_VERSION}-x86_64-pc-windows-msvc.zip`,
    binary: 'rg.exe',
    outputName: 'rg.exe',
  },
];

const BASE_URL = `https://github.com/BurntSushi/ripgrep/releases/download/${RG_VERSION}`;

async function downloadFile(url: string, dest: string): Promise<void> {
  console.log(`Downloading: ${url}`);
  execSync(`curl -L -o "${dest}" "${url}"`, { stdio: 'inherit' });
}

async function extractTarGz(archive: string, dest: string): Promise<void> {
  execSync(`tar -xzf "${archive}" -C "${dest}"`, { stdio: 'inherit' });
}

async function extractZip(archive: string, dest: string): Promise<void> {
  execSync(`unzip -o "${archive}" -d "${dest}"`, { stdio: 'inherit' });
}

async function downloadPlatform(platform: typeof PLATFORMS[0]): Promise<void> {
  const tempDir = path.join(BIN_DIR, '.temp', platform.name);
  const archivePath = path.join(tempDir, platform.archive);
  const outputPath = path.join(BIN_DIR, platform.outputName);

  // Skip if already exists
  if (fs.existsSync(outputPath)) {
    console.log(`${platform.outputName} already exists, skipping...`);
    return;
  }

  // Create temp directory
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // Download archive
    const url = `${BASE_URL}/${platform.archive}`;
    await downloadFile(url, archivePath);

    // Extract
    if (platform.archive.endsWith('.tar.gz')) {
      await extractTarGz(archivePath, tempDir);
    } else if (platform.archive.endsWith('.zip')) {
      await extractZip(archivePath, tempDir);
    }

    // Find and copy binary
    const extractedDir = path.join(tempDir, platform.archive.replace(/\.(tar\.gz|zip)$/, ''));
    const binaryPath = path.join(extractedDir, platform.binary);

    if (!fs.existsSync(binaryPath)) {
      throw new Error(`Binary not found at ${binaryPath}`);
    }

    fs.copyFileSync(binaryPath, outputPath);

    // Make executable on Unix
    if (!platform.name.startsWith('win32')) {
      fs.chmodSync(outputPath, 0o755);
    }

    console.log(`Successfully installed ${platform.outputName}`);
  } finally {
    // Cleanup temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log(`Downloading ripgrep v${RG_VERSION} binaries...`);
  console.log(`Target directory: ${BIN_DIR}\n`);

  // Create bin directory
  fs.mkdirSync(BIN_DIR, { recursive: true });

  // Check for required tools
  try {
    execSync('which curl', { stdio: 'ignore' });
  } catch {
    console.error('Error: curl is required but not found');
    process.exit(1);
  }

  // Parse command line arguments
  const args = process.argv.slice(2);
  const currentOnly = args.includes('--current');
  const specificPlatform = args.find(a => a.startsWith('--platform='))?.split('=')[1];

  let platformsToDownload = PLATFORMS;

  if (currentOnly) {
    // Only download for current platform
    const currentPlatform = `${process.platform}-${process.arch}`;
    platformsToDownload = PLATFORMS.filter(p => p.name === currentPlatform);
    if (platformsToDownload.length === 0) {
      console.error(`Unsupported platform: ${currentPlatform}`);
      process.exit(1);
    }
  } else if (specificPlatform) {
    platformsToDownload = PLATFORMS.filter(p => p.name === specificPlatform);
    if (platformsToDownload.length === 0) {
      console.error(`Unknown platform: ${specificPlatform}`);
      console.log('Available platforms:', PLATFORMS.map(p => p.name).join(', '));
      process.exit(1);
    }
  }

  // Download each platform
  for (const platform of platformsToDownload) {
    console.log(`\n--- ${platform.name} ---`);
    try {
      await downloadPlatform(platform);
    } catch (error) {
      console.error(`Failed to download ${platform.name}:`, error);
    }
  }

  // Cleanup temp directory if exists
  const tempDir = path.join(BIN_DIR, '.temp');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('\nDone!');
}

main().catch(console.error);
