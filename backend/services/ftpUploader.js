const ftp = require("basic-ftp");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const https = require("https");
const http = require("http");
const { pipeline } = require("stream");
const { promisify } = require("util");
const pipelineAsync = promisify(pipeline);

/**
 * Downloads a file from URL to a local path
 * @param {string} url - The URL to download from
 * @param {string} destPath - Local destination path
 * @param {Function} progressCallback - Progress callback function
 * @returns {Promise<void>}
 */
async function downloadFile(url, destPath, progressCallback = null) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https:") ? https : http;

    const request = protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(
          new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`)
        );
        return;
      }

      const totalSize = parseInt(response.headers["content-length"], 10);
      let downloadedSize = 0;

      const fileStream = fs.createWriteStream(destPath);

      response.on("data", (chunk) => {
        downloadedSize += chunk.length;
        if (progressCallback && totalSize) {
          const progress = (downloadedSize / totalSize) * 100;
          progressCallback(progress, downloadedSize, totalSize);
        }
      });

      fileStream.on("finish", () => {
        fileStream.close();
        resolve();
      });

      fileStream.on("error", (err) => {
        fs.unlink(destPath, () => {}); // Delete the file if it exists
        reject(err);
      });

      response.pipe(fileStream);
    });

    request.on("error", (err) => {
      reject(err);
    });

    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error("Download timeout"));
    });
  });
}

/**
 * Downloads WordPress core files from wordpress.org
 * @param {string} version - WordPress version (default: latest)
 * @param {string} destPath - Destination directory
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<string>} - Path to downloaded WordPress files
 */
async function downloadWordPressCore(
  version = "latest",
  destPath,
  progressCallback = null
) {
  const tempDir = path.join(destPath, "wordpress-temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Get latest version if not specified
  if (version === "latest") {
    try {
      const response = await fetch(
        "https://api.wordpress.org/core/version-check/1.7/"
      );
      const data = await response.json();
      version = data.offers[0].version;
    } catch (error) {
      console.log("Could not fetch latest version, using 6.4.3 as fallback");
      version = "6.4.3";
    }
  }

  const wpUrl = `https://wordpress.org/wordpress-${version}.zip`;
  const wpZipPath = path.join(tempDir, `wordpress-${version}.zip`);

  console.log(`📥 Downloading WordPress ${version} from ${wpUrl}`);

  await downloadFile(wpUrl, wpZipPath, progressCallback);

  // Extract the zip file
  const extract = require("extract-zip");
  const extractPath = path.join(tempDir, "extracted");

  console.log("📦 Extracting WordPress files...");
  await extract(wpZipPath, { dir: extractPath });

  // Move files from wordpress/ subdirectory to root
  const wordpressDir = path.join(extractPath, "wordpress");
  const finalPath = path.join(tempDir, "wordpress-core");

  if (fs.existsSync(wordpressDir)) {
    fs.renameSync(wordpressDir, finalPath);
  } else {
    fs.renameSync(extractPath, finalPath);
  }

  // Clean up zip file
  fs.unlinkSync(wpZipPath);

  console.log(
    `✅ WordPress ${version} downloaded and extracted to ${finalPath}`
  );
  return finalPath;
}

/**
 * Downloads a plugin from wordpress.org
 * @param {string} pluginSlug - Plugin slug (e.g., 'all-in-one-wp-migration')
 * @param {string} destPath - Destination directory
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<string>} - Path to downloaded plugin
 */
async function downloadPlugin(pluginSlug, destPath, progressCallback = null) {
  const tempDir = path.join(destPath, "plugins-temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Get plugin info from WordPress.org API
  const apiUrl = `https://api.wordpress.org/plugins/info/1.0/${pluginSlug}.json`;

  try {
    const response = await fetch(apiUrl);
    const pluginInfo = await response.json();

    if (!pluginInfo.download_link) {
      throw new Error(
        `Plugin ${pluginSlug} not found or no download link available`
      );
    }

    const pluginZipPath = path.join(tempDir, `${pluginSlug}.zip`);

    console.log(
      `📥 Downloading plugin ${pluginSlug} from ${pluginInfo.download_link}`
    );

    await downloadFile(
      pluginInfo.download_link,
      pluginZipPath,
      progressCallback
    );

    console.log(`✅ Plugin ${pluginSlug} downloaded to ${pluginZipPath}`);
    return pluginZipPath;
  } catch (error) {
    console.error(`❌ Failed to download plugin ${pluginSlug}:`, error.message);
    throw error;
  }
}

/**
 * Downloads a theme from wordpress.org
 * @param {string} themeSlug - Theme slug (e.g., 'twentytwentyfour')
 * @param {string} destPath - Destination directory
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<string>} - Path to downloaded theme
 */
async function downloadTheme(themeSlug, destPath, progressCallback = null) {
  const tempDir = path.join(destPath, "themes-temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Get theme info from WordPress.org API
  const apiUrl = `https://api.wordpress.org/themes/info/1.1/?action=theme_information&request[slug]=${themeSlug}`;

  try {
    const response = await fetch(apiUrl);
    const themeInfo = await response.json();

    if (!themeInfo.download_link) {
      throw new Error(
        `Theme ${themeSlug} not found or no download link available`
      );
    }

    const themeZipPath = path.join(tempDir, `${themeSlug}.zip`);

    console.log(
      `📥 Downloading theme ${themeSlug} from ${themeInfo.download_link}`
    );

    await downloadFile(themeInfo.download_link, themeZipPath, progressCallback);

    console.log(`✅ Theme ${themeSlug} downloaded to ${themeZipPath}`);
    return themeZipPath;
  } catch (error) {
    console.error(`❌ Failed to download theme ${themeSlug}:`, error.message);
    throw error;
  }
}

/**
 * Generates random WordPress salts.
 * @returns {string} - A block of WordPress salts.
 */
function generateSalts() {
  const salts = [
    "AUTH_KEY",
    "SECURE_AUTH_KEY",
    "LOGGED_IN_KEY",
    "NONCE_KEY",
    "AUTH_SALT",
    "SECURE_AUTH_SALT",
    "LOGGED_IN_SALT",
    "NONCE_SALT",
  ];
  let saltString = "";
  salts.forEach((salt) => {
    saltString += `define( '${salt}', '${crypto
      .randomBytes(64)
      .toString("hex")}' );\n`;
  });
  return saltString;
}

/**
 * Generates wp-config.php content from sample and provided DB credentials.
 * @param {object} dbConfig - Object with dbName, dbUser, dbPass, dbHost.
 * @returns {string} - The generated wp-config.php content.
 */
function generateWpConfigContent(dbConfig) {
  const sampleConfigPath = path.join(
    __dirname,
    "../wordpress-core",
    "wp-config-sample.php"
  );
  let configContent = fs.readFileSync(sampleConfigPath, "utf8");

  configContent = configContent.replace("database_name_here", dbConfig.dbName);
  configContent = configContent.replace("username_here", dbConfig.dbUser);
  configContent = configContent.replace("password_here", dbConfig.dbPass);
  configContent = configContent.replace("localhost", dbConfig.dbHost);

  // Replace salt placeholders
  const saltsBlock = generateSalts();
  configContent = configContent.replace(
    /define\( 'AUTH_KEY',\s+.*\s*\);\ndefine\( 'SECURE_AUTH_KEY',\s+.*\s*\);\ndefine\( 'LOGGED_IN_KEY',\s+.*\s*\);\ndefine\( 'NONCE_KEY',\s+.*\s*\);\ndefine\( 'AUTH_SALT',\s+.*\s*\);\ndefine\( 'SECURE_AUTH_SALT',\s+.*\s*\);\ndefine\( 'LOGGED_IN_SALT',\s+.*\s*\);\ndefine\( 'NONCE_SALT',\s+.*\s*\);/s,
    saltsBlock
  );

  return configContent;
}

/**
 * Uploads files to FTP with progress tracking
 * @param {object} client - FTP client
 * @param {string} localPath - Local file/directory path
 * @param {string} remotePath - Remote path
 * @param {Function} progressCallback - Progress callback
 */
async function uploadWithProgress(
  client,
  localPath,
  remotePath,
  progressCallback = null
) {
  const stats = fs.statSync(localPath);

  if (stats.isDirectory()) {
    // Upload directory recursively
    const files = fs.readdirSync(localPath);
    let uploadedFiles = 0;

    for (const file of files) {
      const localFilePath = path.join(localPath, file);
      const remoteFilePath = `${remotePath}/${file}`;

      await uploadWithProgress(
        client,
        localFilePath,
        remoteFilePath,
        (progress) => {
          if (progressCallback) {
            const overallProgress =
              ((uploadedFiles + progress / 100) / files.length) * 100;
            progressCallback(overallProgress);
          }
        }
      );

      uploadedFiles++;
    }
  } else {
    // Upload single file
    await client.uploadFrom(localPath, remotePath);
    if (progressCallback) {
      progressCallback(100);
    }
  }
}

/**
 * Main optimized FTP upload function
 * @param {object} hostConfig - FTP host configuration
 * @param {object} jobData - Job data including template, logo, db credentials
 */
async function uploadToFtp(hostConfig, jobData) {
  const client = new ftp.Client();
  client.ftp.verbose = false;

  // Validate FTP credentials
  if (!hostConfig.host || !hostConfig.user || !hostConfig.pass) {
    throw new Error("Missing FTP credentials (host, user, or password)");
  }

  // Validate job data
  if (
    !jobData.template ||
    !jobData.logo ||
    !jobData.dbName ||
    !jobData.dbUser ||
    !jobData.dbPass
  ) {
    throw new Error(
      "Missing required job data (template, logo, or database credentials)"
    );
  }

  const tempDirPath = path.join(__dirname, "../temp");
  let localWpConfigPath;

  try {
    console.log(`🔌 Connecting to FTP: ${hostConfig.host}`);
    await client.access({
      host: hostConfig.host,
      user: hostConfig.user,
      password: hostConfig.pass,
      secure: false,
    });

    console.log("✅ Connected to FTP successfully");

    const remotePath = "/public_html";

    // Ensure the main remote directory exists
    await client.ensureDir(remotePath);
    // Ensure wp-content/uploads exists
    await client.ensureDir(`${remotePath}/wp-content`);
    await client.ensureDir(`${remotePath}/wp-content/uploads`);
    await client.ensureDir(`${remotePath}/wp-content/plugins`);
    await client.ensureDir(`${remotePath}/wp-content/themes`);

    // Ensure temp directory exists
    if (!fs.existsSync(tempDirPath)) {
      fs.mkdirSync(tempDirPath, { recursive: true });
    }

    // === NEW: Download WordPress core ZIP ===
    console.log("📥 Downloading WordPress core ZIP file...");
    const wpVersion = "latest";
    const tempZipDir = path.join(tempDirPath, "wordpress-temp");
    if (!fs.existsSync(tempZipDir)) {
      fs.mkdirSync(tempZipDir, { recursive: true });
    }
    let version = wpVersion;
    if (wpVersion === "latest") {
      try {
        const response = await fetch(
          "https://api.wordpress.org/core/version-check/1.7/"
        );
        const data = await response.json();
        version = data.offers[0].version;
      } catch (error) {
        console.log("Could not fetch latest version, using 6.4.3 as fallback");
        version = "6.4.3";
      }
    }
    const wpZipUrl = `https://wordpress.org/wordpress-${version}.zip`;
    const wpZipPath = path.join(tempZipDir, `wordpress-${version}.zip`);
    await downloadFile(wpZipUrl, wpZipPath, (progress) => {
      console.log(`📥 WordPress download progress: ${progress.toFixed(1)}%`);
    });
    console.log(`✅ WordPress ZIP downloaded to ${wpZipPath}`);

    // === DETERMINE TEMPLATE TYPE AND HANDLE ACCORDINGLY ===
    let templatePath;
    let templateType = "wordpress"; // default

    // Check if it's a custom template (exists as .wpress file)
    const customTemplatePath = path.join(
      __dirname,
      "../templates",
      `${jobData.template}.wpress`
    );
    if (fs.existsSync(customTemplatePath)) {
      console.log(`📁 Using custom template: ${jobData.template}.wpress`);
      templatePath = customTemplatePath;
      templateType = "custom";
    } else {
      // Download from WordPress.org
      console.log(`📥 Downloading WordPress.org theme: ${jobData.template}`);
      templatePath = await downloadTheme(
        jobData.template,
        tempDirPath,
        (progress) => {
          console.log(`📥 Theme download progress: ${progress.toFixed(1)}%`);
        }
      );
      templateType = "wordpress";
    }

    // === NEW: Download All-in-One WP Migration plugin ===
    console.log("📥 Downloading All-in-One WP Migration plugin...");
    const pluginPath = await downloadPlugin(
      "all-in-one-wp-migration",
      tempDirPath,
      (progress) => {
        console.log(`📥 Plugin download progress: ${progress.toFixed(1)}%`);
      }
    );

    // Define file paths
    const localLogoPath = path.join(__dirname, "../../uploads", jobData.logo);
    const localInstallerPath = path.join(
      __dirname,
      "../../deploy-scripts",
      "install.php"
    );

    // === Generate wp-config.php ===
    const wpConfigContent = generateWpConfigContent({
      dbName: jobData.dbName,
      dbUser: jobData.dbUser,
      dbPass: jobData.dbPass,
      dbHost: "localhost",
    });
    localWpConfigPath = path.join(tempDirPath, `wp-config-${jobData.id}.php`);
    fs.writeFileSync(localWpConfigPath, wpConfigContent);
    console.log(`✅ Generated wp-config.php at: ${localWpConfigPath}`);

    // === Generate job-info.json ===
    const localJobInfoPath = path.join(tempDirPath, `job-info.json`);
    fs.writeFileSync(localJobInfoPath, JSON.stringify(jobData, null, 2));

    // Validate that all required files exist
    const requiredFiles = [
      { path: wpZipPath, name: "WordPress core ZIP file" },
      {
        path: templatePath,
        name: `Template: ${jobData.template} (${templateType})`,
      },
      { path: pluginPath, name: "All-in-One WP Migration plugin" },
      { path: localLogoPath, name: `Logo: ${jobData.logo}` },
      { path: localInstallerPath, name: "Install script" },
    ];

    for (const file of requiredFiles) {
      if (!fs.existsSync(file.path)) {
        throw new Error(`${file.name} not found at: ${file.path}`);
      }
    }

    // === Upload files to FTP ===
    console.log("📤 Starting optimized file upload...");

    // Upload WordPress core ZIP file
    console.log(
      "[DEBUG] Preparing to upload WordPress core ZIP:",
      wpZipPath,
      "->",
      `${remotePath}/wordpress.zip`
    );
    if (!fs.existsSync(wpZipPath)) {
      console.error("[ERROR] WordPress core ZIP not found:", wpZipPath);
      throw new Error(`File not found: ${wpZipPath}`);
    }
    console.log("📤 Uploading WordPress core ZIP file...");
    await client.uploadFrom(wpZipPath, `${remotePath}/wordpress.zip`);

    // Upload template based on type
    if (templateType === "custom") {
      // Upload custom .wpress template
      console.log(
        `[DEBUG] Preparing to upload custom template (.wpress): ${templatePath} -> ${remotePath}/template.wpress`
      );
      if (!fs.existsSync(templatePath)) {
        console.error(
          "[ERROR] Custom template (.wpress) not found:",
          templatePath
        );
        throw new Error(`File not found: ${templatePath}`);
      }
      console.log("📤 Uploading custom template (.wpress)...");
      await client.uploadFrom(templatePath, `${remotePath}/template.wpress`);
    } else {
      // Upload WordPress.org theme
      console.log(
        `[DEBUG] Preparing to upload WordPress.org theme: ${templatePath} -> ${remotePath}/wp-content/themes/${jobData.template}.zip`
      );
      if (!fs.existsSync(templatePath)) {
        console.error(
          "[ERROR] WordPress.org theme ZIP not found:",
          templatePath
        );
        throw new Error(`File not found: ${templatePath}`);
      }
      console.log("📤 Uploading WordPress.org theme...");
      await client.uploadFrom(
        templatePath,
        `${remotePath}/wp-content/themes/${jobData.template}.zip`
      );
    }

    // Upload plugin
    console.log(
      `[DEBUG] Preparing to upload plugin: ${pluginPath} -> ${remotePath}/wp-content/plugins/all-in-one-wp-migration.zip`
    );
    if (!fs.existsSync(pluginPath)) {
      console.error("[ERROR] Plugin ZIP not found:", pluginPath);
      throw new Error(`File not found: ${pluginPath}`);
    }
    console.log("📤 Uploading plugin...");
    await client.uploadFrom(
      pluginPath,
      `${remotePath}/wp-content/plugins/all-in-one-wp-migration.zip`
    );

    // Upload Unlimited Extension
    const unlimitedExtensionPath = path.join(
      __dirname,
      "../plugins/all-in-one-wp-migration-unlimited-extension.zip"
    );
    console.log(
      `[DEBUG] Preparing to upload Unlimited Extension: ${unlimitedExtensionPath} -> ${remotePath}/wp-content/plugins/all-in-one-wp-migration-unlimited-extension.zip`
    );
    if (!fs.existsSync(unlimitedExtensionPath)) {
      console.error(
        "[ERROR] Unlimited Extension ZIP not found:",
        unlimitedExtensionPath
      );
      throw new Error(`File not found: ${unlimitedExtensionPath}`);
    }
    console.log("📤 Uploading Unlimited Extension...");
    await client.uploadFrom(
      unlimitedExtensionPath,
      `${remotePath}/wp-content/plugins/all-in-one-wp-migration-unlimited-extension.zip`
    );

    // Upload logo
    console.log(
      `[DEBUG] Preparing to upload logo: ${localLogoPath} -> ${remotePath}/wp-content/uploads/${jobData.logo}`
    );
    if (!fs.existsSync(localLogoPath)) {
      console.error("[ERROR] Logo file not found:", localLogoPath);
      throw new Error(`File not found: ${localLogoPath}`);
    }
    console.log("📤 Uploading logo...");
    await client.uploadFrom(
      localLogoPath,
      `${remotePath}/wp-content/uploads/${jobData.logo}`
    );

    // Upload wp-config.php
    console.log(
      `[DEBUG] Preparing to upload wp-config.php: ${localWpConfigPath} -> ${remotePath}/wp-config.php`
    );
    if (!fs.existsSync(localWpConfigPath)) {
      console.error("[ERROR] wp-config.php not found:", localWpConfigPath);
      throw new Error(`File not found: ${localWpConfigPath}`);
    }
    console.log("📤 Uploading wp-config.php...");
    await client.uploadFrom(localWpConfigPath, `${remotePath}/wp-config.php`);

    // Upload install script
    console.log(
      `[DEBUG] Preparing to upload install script: ${localInstallerPath} -> ${remotePath}/install.php`
    );
    if (!fs.existsSync(localInstallerPath)) {
      console.error("[ERROR] Install script not found:", localInstallerPath);
      throw new Error(`File not found: ${localInstallerPath}`);
    }
    console.log("📤 Uploading install script...");
    await client.uploadFrom(localInstallerPath, `${remotePath}/install.php`);

    // === Upload job-info.json ===
    console.log(
      `[DEBUG] Preparing to upload job-info.json: ${localJobInfoPath} -> ${remotePath}/job-info.json`
    );
    if (!fs.existsSync(localJobInfoPath)) {
      console.error("[ERROR] job-info.json not found:", localJobInfoPath);
      throw new Error(`File not found: ${localJobInfoPath}`);
    }
    console.log("📤 Uploading job-info.json...");
    await client.uploadFrom(localJobInfoPath, `${remotePath}/job-info.json`);

    console.log("✅ All files uploaded successfully!");
  } catch (error) {
    console.error("❌ FTP upload error:", error);
    throw error;
  } finally {
    client.close();

    // Clean up temporary files
    try {
      if (localWpConfigPath && fs.existsSync(localWpConfigPath)) {
        fs.unlinkSync(localWpConfigPath);
      }

      // Clean up temp directories
      const tempDirs = [
        path.join(tempDirPath, "wordpress-temp"),
        path.join(tempDirPath, "plugins-temp"),
        path.join(tempDirPath, "themes-temp"),
      ];

      tempDirs.forEach((dir) => {
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      });
    } catch (cleanupError) {
      console.warn(
        "⚠️ Warning: Could not clean up temporary files:",
        cleanupError.message
      );
    }
  }
}

module.exports = { uploadToFtp };
