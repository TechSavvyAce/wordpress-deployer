<?php
// Auto-extract wordpress.zip if wp-load.php is missing
if (!file_exists(__DIR__ . '/wp-load.php') && file_exists(__DIR__ . '/wordpress.zip')) {
    $zip = new ZipArchive;
    if ($zip->open(__DIR__ . '/wordpress.zip') === TRUE) {
        $zip->extractTo(__DIR__);
        $zip->close();
        // Move files from wordpress/ to root if needed
        if (is_dir(__DIR__ . '/wordpress')) {
            $files = scandir(__DIR__ . '/wordpress');
            foreach ($files as $file) {
                if ($file !== '.' && $file !== '..') {
                    rename(__DIR__ . '/wordpress/' . $file, __DIR__ . '/' . $file);
                }
            }
            rmdir(__DIR__ . '/wordpress');
        }
    } else {
        die('Failed to extract wordpress.zip');
    }
}

error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "<h2>Starting WordPress Automated Deployment...</h2>";
echo "<p>This script will automatically configure WordPress and import your site template.</p>";

// Define base path (where WordPress is installed)
define('BASE_PATH', __DIR__);

// === Ensure WordPress core is extracted before proceeding ===
$wordpressZip = BASE_PATH . '/wordpress.zip';
$wpLoad = BASE_PATH . '/wp-load.php';

if (!file_exists($wpLoad) && file_exists($wordpressZip)) {
    echo "<p>📦 Extracting WordPress core from wordpress.zip...</p>";
    $zip = new ZipArchive;
    if ($zip->open($wordpressZip) === TRUE) {
        $zip->extractTo(BASE_PATH);
        $zip->close();
        // Move files from wordpress/ to root if needed
        if (is_dir(BASE_PATH . '/wordpress')) {
            $files = scandir(BASE_PATH . '/wordpress');
            foreach ($files as $file) {
                if ($file !== '.' && $file !== '..') {
                    rename(BASE_PATH . '/wordpress/' . $file, BASE_PATH . '/' . $file);
                }
            }
            rmdir(BASE_PATH . '/wordpress');
        }
        echo "<p>✅ WordPress core extracted.</p>";
        unlink($wordpressZip);
        echo "<p>🗑️ Cleaned up wordpress.zip.</p>";
    } else {
        echo "<p style=\"color:red;\">❌ Could not open wordpress.zip for extraction.</p>";
        exit;
    }
}

// After extraction, check again for wp-load.php
if (!file_exists($wpLoad)) {
    echo "<p style=\"color:red;\">❌ wp-load.php still not found after extraction. Aborting.</p>";
    exit;
}

// === Step 1: Read Job Info ===
$jobInfoPath = BASE_PATH . '/job-info.json';
$jobData = [];

if (file_exists($jobInfoPath)) {
    $jobInfoContent = file_get_contents($jobInfoPath);
    $jobData = json_decode($jobInfoContent, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        echo "<p style=\"color:red;\">Error: Could not decode job-info.json. " . json_last_error_msg() . "</p>";
        exit;
    }
    echo "<p>✅ Job info loaded successfully.</p>";
} else {
    echo "<p style=\"color:red;\">Error: job-info.json not found at $jobInfoPath</p>";
    exit;
}

// Extract data from jobInfo
$domain = $jobData['domain'] ?? '';
$admin_email = $jobData['email'] ?? '';
$db_name = $jobData['dbName'] ?? '';
$db_user = $jobData['dbUser'] ?? '';
$db_password = $jobData['dbPass'] ?? '';
$site_title = 'New WordPress Site on ' . $domain; // Dynamic site title
$admin_username = 'admin-' . substr(md5(uniqid(rand(), true)), 0, 8); // Generate a random admin username
$template_filename = $jobData['template'] . '.wpress' ?? '';

// Basic validation of critical data
if (empty($domain) || empty($admin_email) || empty($db_name) || empty($db_user) || empty($db_password) || empty($template_filename)) {
    echo "<p style=\"color:red;\">Error: Missing critical job data required for installation.</p>";
    echo "<pre>";
    print_r($jobData);
    echo "</pre>";
    exit;
}

// --- End Step 1 ---

// === Step 2: Define WordPress Constants and Load Core ===

// Define database constants for wp-config.php
define('DB_NAME', $db_name);
define('DB_USER', $db_user);
define('DB_PASSWORD', $db_password);
define('DB_HOST', 'localhost'); // cPanel usually uses 'localhost' for MySQL

// Indicate that WordPress is being installed
define('WP_INSTALLING', true);

// To prevent errors related to headers already sent
ob_start();

// Set server variables for wp_install()
$_SERVER['HTTP_HOST'] = $domain;
$_SERVER['REQUEST_URI'] = '/install.php'; // Or wherever this script is accessed

// Load WordPress functions
require_once(BASE_PATH . '/wp-load.php');
require_once(BASE_PATH . '/wp-admin/includes/upgrade.php');
require_once(BASE_PATH . '/wp-admin/includes/plugin.php');
require_once(BASE_PATH . '/wp-admin/includes/user.php'); // For wp_create_user()

// --- End Step 2 ---

// === Step 3: Perform WordPress Installation ===

echo "<p>⚙️ Performing WordPress core installation...</p>";

$admin_password = wp_generate_password(16, true, true); // Generate a strong password

$install_result = wp_install(
    (string)$site_title, // Site Title
    (string)$admin_username, // Admin Username
    (string)$admin_password, // Admin Password
    (string)$admin_email, // Admin Email
    true, // Public blog (search engines can see it)
    '' // Site URL (wp_install uses HTTP_HOST if empty)
);

if (is_wp_error($install_result)) {
    echo "<p style=\"color:red;\">❌ WordPress installation failed: " . $install_result->get_error_message() . "</p>";
    exit;
} else {
    echo "<p>✅ WordPress core installed successfully!</p>";
    echo "<p>Login with:
        <br><strong>Username:</strong> <code style=\"background:#e6e6e6; padding:2px 5px; border-radius:3px;\">{$admin_username}</code>
        <br><strong>Password:</strong> <code style=\"background:#e6e6e6; padding:2px 5px; border-radius:3px;\">{$admin_password}</code>
        <br><em><small>(Make sure to save these credentials!)</small></em>
    </p>";
}

ob_end_clean(); // Clean the output buffer

// --- End Step 3 ---

// === Step 4: Install and Activate All-in-One WP Migration and Import Template ===
echo "<p>📦 Preparing All-in-One WP Migration plugin...</p>";

$plugin_zip_path = BASE_PATH . '/wp-content/plugins/all-in-one-wp-migration.zip';
$plugin_extract_path = BASE_PATH . '/wp-content/plugins/';
$plugin_dir_name = 'all-in-one-wp-migration'; // The directory name inside the zip
$plugin_main_file = $plugin_dir_name . '/all-in-one-wp-migration.php';

if (file_exists($plugin_zip_path)) {
    $zip = new ZipArchive;
    if ($zip->open($plugin_zip_path) === TRUE) {
        $zip->extractTo($plugin_extract_path);
        $zip->close();
        echo "<p>✅ All-in-One WP Migration plugin unzipped.</p>";

        // Activate plugin
        // Ensure the plugin functions are available
        include_once(ABSPATH . 'wp-admin/includes/plugin.php');
        $activated = activate_plugin($plugin_main_file);

        if (is_wp_error($activated)) {
            echo "<p style=\"color:red;\">❌ Failed to activate All-in-One WP Migration plugin: " . $activated->get_error_message() . "</p>";
        } else {
            echo "<p>✅ All-in-One WP Migration plugin activated.</p>";

            // === Unzip and activate Unlimited Extension ===
            $unlimited_zip_path = BASE_PATH . '/wp-content/plugins/all-in-one-wp-migration-unlimited-extension.zip';
            $unlimited_extract_path = BASE_PATH . '/wp-content/plugins/';
            $unlimited_plugin_dir = 'all-in-one-wp-migration-unlimited-extension';
            $unlimited_main_file = $unlimited_plugin_dir . '/all-in-one-wp-migration-unlimited-extension.php';

            if (file_exists($unlimited_zip_path)) {
                $zip2 = new ZipArchive;
                if ($zip2->open($unlimited_zip_path) === TRUE) {
                    $zip2->extractTo($unlimited_extract_path);
                    $zip2->close();
                    echo "<p>✅ Unlimited Extension unzipped.</p>";
                    // Fix possible double-nesting of plugin directory
                    $nestedPath = $unlimited_extract_path . $unlimited_plugin_dir . '/' . $unlimited_plugin_dir;
                    $targetPath = $unlimited_extract_path . $unlimited_plugin_dir;
                    if (is_dir($nestedPath)) {
                        $files = scandir($nestedPath);
                        foreach ($files as $file) {
                            if ($file !== '.' && $file !== '..') {
                                rename($nestedPath . '/' . $file, $targetPath . '/' . $file);
                            }
                        }
                        rmdir($nestedPath);
                    }
                    // Activate Unlimited Extension
                    if (file_exists(ABSPATH . 'wp-admin/includes/plugin.php')) {
                        include_once(ABSPATH . 'wp-admin/includes/plugin.php');
                        $activated2 = activate_plugin($unlimited_main_file);
                        if (is_wp_error($activated2)) {
                            echo "<p style=\"color:red;\">❌ Failed to activate Unlimited Extension: " . $activated2->get_error_message() . "</p>";
                        } else {
                            echo "<p>✅ Unlimited Extension activated.</p>";
                        }
                    }
                } else {
                    echo "<p style=\"color:red;\">❌ Could not open Unlimited Extension ZIP file.</p>";
                }
            } else {
                echo "<p style=\"color:red;\">❌ Unlimited Extension ZIP file not found at {$unlimited_zip_path}</p>";
            }

            // --- WP-CLI AUTOMATION SECTION ---
            // Move .wpress file to ai1wm-backups for best compatibility
            $wpress_file_path = BASE_PATH . '/template.wpress';
            $ai1wm_backup_dir = BASE_PATH . '/wp-content/ai1wm-backups/';
            if (!is_dir($ai1wm_backup_dir)) {
                mkdir($ai1wm_backup_dir, 0755, true);
            }
            if (file_exists($wpress_file_path)) {
                rename($wpress_file_path, $ai1wm_backup_dir . basename($wpress_file_path));
                $wpress_file_path = $ai1wm_backup_dir . basename($wpress_file_path);
            }

            // Download WP-CLI if not present
            $wp_cli_phar = BASE_PATH . '/wp-cli.phar';
            if (!file_exists($wp_cli_phar)) {
                echo "<p>Downloading WP-CLI...</p>";
                $wp_cli_url = 'https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar';
                $wp_cli_data = @file_get_contents($wp_cli_url);
                if ($wp_cli_data !== false) {
                    file_put_contents($wp_cli_phar, $wp_cli_data);
                    echo "<p>✅ WP-CLI downloaded to $wp_cli_phar</p>";
                } else {
                    echo "<p style=\"color:red;\">❌ Failed to download WP-CLI. Please check your server's internet access.</p>";
                }
            }

            // Use WP-CLI via php wp-cli.phar
            if (file_exists($wp_cli_phar)) {
                $wp_cli_cmd = 'php ' . escapeshellarg($wp_cli_phar);
                echo "<p>Using WP-CLI: <code>$wp_cli_cmd</code></p>";
                // Run ai1wm import
                if (file_exists($wpress_file_path)) {
                    $command = $wp_cli_cmd . ' ai1wm import ' . escapeshellarg($wpress_file_path) . ' --allow-root';
                    echo "<p>Executing command: <code>{$command}</code></p>";
                    $output = shell_exec($command . ' 2>&1');
                    echo "<pre>{$output}</pre>";
                    if (strpos($output, 'Success') !== false) {
                        echo "<p>✅ Template imported successfully!</p>";
                        // Delete the wpress file after successful import
                        // unlink($wpress_file_path);
                        echo "<p>🗑️ (Skipped) Cleaned up template.wpress file. File is kept for debugging.</p>";
                    } else {
                        echo "<p style=\"color:red;\">❌ Template import failed!</p>";
                        echo "<p style=\"color:red;\">Please check the WP-CLI output above for details or try manual import.</p>";
                    }
                } else {
                    echo "<p style=\"color:red;\">❌ Template .wpress file not found at {$wpress_file_path}</p>";
                }
            } else {
                echo "<p style=\"color:red;\">❌ WP-CLI not available. Please install it manually.</p>";
                echo "<p style=\"color:orange;\">You may need to manually import the template using the All-in-One WP Migration plugin's interface.</p>";
            }
            // --- END WP-CLI AUTOMATION SECTION ---
        }
    } else {
        echo "<p style=\"color:red;\">❌ Could not open All-in-One WP Migration ZIP file.</p>";
    }
} else {
    echo "<p style=\"color:red;\">❌ All-in-One WP Migration ZIP file not found at {$plugin_zip_path}</p>";
}

// --- End Step 4 ---

// === Step 5: Clean up job-info.json ===
if (file_exists($jobInfoPath)) {
    unlink($jobInfoPath);
    echo "<p>🗑️ Cleaned up job-info.json.</p>";
}

echo "<p>✅ Automated deployment script finished.</p>";

// === Step 6: Clean up install.php ===
if (file_exists(__FILE__)) {
    unlink(__FILE__);
    echo "<p>🗑️ Cleaned up install.php. This script has self-destructed.</p>";
}
