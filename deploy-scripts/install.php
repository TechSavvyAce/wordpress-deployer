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

// Extract All-in-One WP Migration plugin BEFORE loading WordPress
$plugin_zip_path = BASE_PATH . '/wp-content/plugins/all-in-one-wp-migration.zip';
$plugin_extract_path = BASE_PATH . '/wp-content/plugins/';
$plugin_dir_name = 'all-in-one-wp-migration';
$plugin_main_file = $plugin_dir_name . '/all-in-one-wp-migration.php';
if (file_exists($plugin_zip_path)) {
    $zip = new ZipArchive;
    if ($zip->open($plugin_zip_path) === TRUE) {
        $zip->extractTo($plugin_extract_path);
        $zip->close();
        // Optionally remove the zip after extraction
        // unlink($plugin_zip_path);
    }
}
// Extract Unlimited Extension BEFORE loading WordPress
$unlimited_zip_path = BASE_PATH . '/wp-content/plugins/all-in-one-wp-migration-unlimited-extension.zip';
$unlimited_extract_path = BASE_PATH . '/wp-content/plugins/';
$unlimited_plugin_dir = 'all-in-one-wp-migration-unlimited-extension';
$unlimited_main_file = $unlimited_plugin_dir . '/all-in-one-wp-migration-unlimited-extension.php';
if (file_exists($unlimited_zip_path)) {
    $zip2 = new ZipArchive;
    if ($zip2->open($unlimited_zip_path) === TRUE) {
        $zip2->extractTo($unlimited_extract_path);
        $zip2->close();
        // Optionally remove the zip after extraction
        // unlink($unlimited_zip_path);
    }
}

// === Step 2: Define WordPress Constants and Load Core ===

// Define database constants for wp-config.php
if (!defined('DB_NAME'))     define('DB_NAME', $db_name);
if (!defined('DB_USER'))     define('DB_USER', $db_user);
if (!defined('DB_PASSWORD')) define('DB_PASSWORD', $db_password);
if (!defined('DB_HOST'))     define('DB_HOST', 'localhost'); // cPanel usually uses 'localhost' for MySQL

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

if ((is_object($install_result) && is_wp_error($install_result)) || (is_array($install_result) && isset($install_result['errors']))) {
    echo "<p style=\"color:red;\">❌ WordPress installation failed.";
    if (is_object($install_result) && method_exists($install_result, 'get_error_message')) {
        echo ' ' . $install_result->get_error_message();
    } elseif (is_array($install_result) && isset($install_result['errors'])) {
        echo ' ' . print_r($install_result['errors'], true);
    }
    echo "</p>";
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
                    // Debug: List files in the plugin directory after extraction
                    $pluginFiles = scandir($unlimited_extract_path . $unlimited_plugin_dir);
                    echo "<pre>Files in " . $unlimited_extract_path . $unlimited_plugin_dir . " after extraction:\n" . print_r($pluginFiles, true) . "</pre>";
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
                        // Debug: List files again after moving up
                        $pluginFiles = scandir($targetPath);
                        echo "<pre>Files in $targetPath after fixing nesting:\n" . print_r($pluginFiles, true) . "</pre>";
                    }
                    // Activate Unlimited Extension
                    if (file_exists(ABSPATH . 'wp-admin/includes/plugin.php')) {
                        include_once(ABSPATH . 'wp-admin/includes/plugin.php');
                        echo "<pre>Debug: unlimited_main_file = $unlimited_main_file</pre>";
                        $plugin_full_path = ABSPATH . 'wp-content/plugins/' . $unlimited_main_file;
                        if (file_exists($plugin_full_path)) {
                            echo "<pre>Plugin file found at: $plugin_full_path</pre>";
                            // Print first 10 lines of the plugin file
                            $lines = file($plugin_full_path);
                            echo "<pre>First 10 lines of plugin file:\n" . htmlspecialchars(implode('', array_slice($lines, 0, 10))) . "</pre>";
                        } else {
                            echo "<p style='color:red;'>Plugin file not found at: $plugin_full_path</p>";
                        }
                        $activated2 = activate_plugin($unlimited_main_file);
                        if (is_wp_error($activated2)) {
                            echo "<p style=\"color:red;\">❌ Failed to activate Unlimited Extension: " . $activated2->get_error_message() . "</p>";
                            echo "<pre>";
                            print_r($activated2);
                            echo "</pre>";
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
                // Debug: Show WP-CLI plugin list
                $output = shell_exec($wp_cli_cmd . ' plugin list 2>&1');
                echo "<pre>WP-CLI plugin list:\n$output</pre>";
                // Debug: Show available ai1wm subcommands
                $output = shell_exec($wp_cli_cmd . ' help ai1wm 2>&1');
                echo "<pre>WP-CLI ai1wm help:\n$output</pre>";
                // Run ai1wm restore (not import)
                if (file_exists($wpress_file_path)) {
                    $backup_filename = basename($wpress_file_path);
                    $command = $wp_cli_cmd . ' ai1wm restore ' . escapeshellarg($backup_filename) . ' --yes --allow-root';
                    echo "<p>Executing command: <code>{$command}</code></p>";
                    $output = shell_exec($command . ' 2>&1');
                    echo "<pre>{$output}</pre>";
                    if (strpos($output, 'Success') !== false) {
                        echo "<p>✅ Template imported successfully!</p>";
                        unlink($wpress_file_path);
                        echo "<p>🗑️ Cleaned up template.wpress file. File is kept for debugging.</p>";
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

// === Step 5: Automate Logo Update ===
echo "<h3>Automating logo update...</h3>";

// Try to get logo file from job-info.json, else auto-detect
$logo_file = '';
if (!empty($jobData['logo'])) {
    $logo_file = BASE_PATH . '/wp-content/uploads/' . $jobData['logo'];
    echo "<p>Using logo file from job-info.json: <code>$logo_file</code></p>";
} else {
    // Auto-detect: find the most recent file with 'logo' in the name
    $uploads_dir = BASE_PATH . '/wp-content/uploads/';
    $logo_files = glob($uploads_dir . '*logo*.*');
    usort($logo_files, function ($a, $b) {
        return filemtime($b) - filemtime($a);
    });
    $logo_file = $logo_files[0] ?? '';
    if ($logo_file) {
        echo "<p>Auto-detected logo file: <code>$logo_file</code></p>";
    }
}

if ($logo_file && file_exists($logo_file)) {
    $cmd = "php '" . BASE_PATH . "/wp-cli.phar' media import '" . $logo_file . "' --title='Site Logo' --porcelain";
    echo "<p>Running: <code>$cmd</code></p>";
    $logo_id = trim(shell_exec($cmd));
    if ($logo_id && is_numeric($logo_id)) {
        $cmd2 = "php '" . BASE_PATH . "/wp-cli.phar' theme mod set custom_logo $logo_id";
        echo "<p>Setting custom logo with: <code>$cmd2</code></p>";
        $output = shell_exec($cmd2 . ' 2>&1');
        echo "<pre>$output</pre>";
        echo "<p>✅ Logo updated successfully! Attachment ID: $logo_id</p>";
    } else {
        echo "<p style='color:red;'>❌ Failed to import logo file. Check the file path and permissions.</p>";
    }
} else {
    echo "<p style='color:red;'>❌ Logo file not found. Please check your deployment or job-info.json.</p>";
}
// --- End Step 5 ---

// === Step 6: Automated Search & Replace for Site Personalization ===
echo "<h3>Running automated search & replace for site personalization...</h3>";

// Get new values from job-info.json
define('NEW_ADDRESS', $jobData['address'] ?? '');
define('NEW_PHONE', $jobData['phone'] ?? '');
define('NEW_EMAIL', $jobData['email'] ?? '');
define('NEW_DOMAIN', $jobData['domain'] ?? '');
define('NEW_TITLE', $jobData['title'] ?? '');

$wp_cli_phar = BASE_PATH . '/wp-cli.phar';
$wp_cli_cmd = 'php ' . escapeshellarg($wp_cli_phar);

function run_replace($search, $replace, $desc, $extra = '')
{
    global $wp_cli_cmd;
    if ($search && $replace) {
        $cmd = $wp_cli_cmd . ' search-replace ' . escapeshellarg($search) . ' ' . escapeshellarg($replace) . ' --skip-columns=guid --report-changed-only ' . $extra;
        echo "<p>Replacing <b>$desc</b>: <code>$cmd</code></p>";
        $output = shell_exec($cmd . ' 2>&1');
        echo "<pre>$output</pre>";
    }
}

run_replace('4425 Madisonville Rd, Hopkinsville, KY 42240', NEW_ADDRESS, 'Address');
run_replace('+1 (719) 319-8181', NEW_PHONE, 'Phone');
run_replace('support@' . NEW_DOMAIN, NEW_EMAIL, 'Email');
run_replace('winmill-equipment.com', NEW_DOMAIN, 'Domain');
run_replace('Winmill Equipment', NEW_TITLE, 'Title/Brand', '--regex');
run_replace('WINMILL EQUIPMENT', NEW_TITLE, 'Title/Brand (uppercase)', '--regex');
run_replace('winmill equipment', NEW_TITLE, 'Title/Brand (lowercase)', '--regex');

// === Step 7: Clean up job-info.json ===
if (file_exists($jobInfoPath)) {
    unlink($jobInfoPath);
    echo "<p>🗑️ Cleaned up job-info.json.</p>";
}

echo "<p>✅ Automated deployment script finished.</p>";

// === Step 8: Clean up install.php ===
if (file_exists(__FILE__)) {
    unlink(__FILE__);
    echo "<p>🗑️ Cleaned up install.php. This script has self-destructed.</p>";
}
