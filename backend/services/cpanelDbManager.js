const cpanelApi = require("@cpanel/api");
const https = require("https"); // For making HTTPS requests to cPanel
const { URL } = require("url");

/**
 * Creates an HTTP agent that ignores SSL certificate errors.
 * IMPORTANT: This should ONLY be used in development/testing environments.
 * For production, ensure valid SSL certificates are used and remove this.
 */
const insecureAgent = new https.Agent({
  rejectUnauthorized: false, // WARNING: Do not use in production without proper SSL validation
});

/**
 * Helper function to make cPanel UAPI calls.
 * Assumes cpanelConfig contains host, username, and password (or API token).
 * @param {object} cpanelConfig - Object with host, username, and password/apiToken.
 * @param {string} module - The UAPI module (e.g., 'Mysql').
 * @param {string} func - The UAPI function (e.g., 'create_database').
 * @param {object} args - Arguments for the UAPI function.
 * @returns {Promise<object>} - The API response.
 */
async function callUapi(cpanelConfig, module, func, args = {}) {
  const { host, username, password } = cpanelConfig;
  let authHeader;

  // Determine authentication method
  if (cpanelConfig.apiToken) {
    // Use API Token if available (more secure for automation)
    authHeader = new cpanelApi.WhmApiTokenHeader(
      cpanelConfig.apiToken,
      username
    );
  } else if (password) {
    // Fallback to basic auth with username/password
    const authString = Buffer.from(`${username}:${password}`).toString(
      "base64"
    );
    authHeader = { Authorization: `Basic ${authString}` };
  } else {
    throw new Error("cPanel credentials (password or apiToken) are missing.");
  }

  // Build the UAPI URL
  const queryParams = new URLSearchParams();
  for (const key in args) {
    queryParams.append(key, args[key]);
  }

  // Use baseUrl if provided (from connection test), otherwise use default
  const baseUrl = cpanelConfig.baseUrl || `https://${host}:2083`;
  let apiUrl = `${baseUrl}/json-api/uapi/${module}/${func}?${queryParams.toString()}`;

  console.log(`Calling cPanel UAPI: ${apiUrl}`);
  console.log(
    `Auth: Basic ${Buffer.from(`${username}:********`).toString("base64")}`
  ); // Mask password

  try {
    const response = await fetch(apiUrl, {
      method: "GET", // Many UAPI calls are GET, but `create` functions might be POST
      headers: {
        Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString(
          "base64"
        )}`,
        Accept: "application/json",
        "User-Agent": "WordPress-Deployer/1.0",
      },
      agent: insecureAgent, // WARNING: Remove for production
    });

    // Check if response is OK
    if (!response.ok) {
      console.error(`HTTP Error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error("Error response body:", errorText.substring(0, 500)); // Log first 500 chars
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Check content type to ensure we're getting JSON
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      console.error(`Unexpected content type: ${contentType}`);
      const responseText = await response.text();
      console.error("Response body:", responseText.substring(0, 1000)); // Log first 1000 chars
      throw new Error(`Expected JSON response, got: ${contentType}`);
    }

    const data = await response.json();

    // Check for cPanel API errors in the response
    if (data.errors && data.errors.length > 0) {
      console.error("cPanel API Error:", data.errors);
      throw new Error(`cPanel API Error: ${data.errors.join(", ")}`);
    }

    return data;
  } catch (error) {
    console.error("Network or cPanel API request error:", error);
    throw error;
  }
}

/**
 * Creates a MySQL database on cPanel.
 * @param {object} cpanelConfig - Object with host, username, and password for cPanel.
 * @param {string} dbName - The desired database name (will be prefixed by cPanel).
 * @returns {Promise<object>} - API response.
 */
async function createDatabase(cpanelConfig, dbName) {
  console.log(`Creating MySQL database: ${dbName}`);
  return callUapi(cpanelConfig, "Mysql", "create_database", { name: dbName });
}

/**
 * Creates a MySQL database user on cPanel.
 * @param {object} cpanelConfig - Object with host, username, and password for cPanel.
 * @param {string} username - The desired database username (will be prefixed by cPanel).
 * @param {string} password - The password for the database user.
 * @returns {Promise<object>} - API response.
 */
async function createDatabaseUser(cpanelConfig, username, password) {
  console.log(`Creating MySQL user: ${username}`);
  return callUapi(cpanelConfig, "Mysql", "create_user", {
    name: username,
    password: password,
  });
}

/**
 * Grants a MySQL user all privileges on a specific database.
 * @param {object} cpanelConfig - Object with host, username, and password for cPanel.
 * @param {string} username - The prefixed database username.
 * @param {string} dbName - The prefixed database name.
 * @returns {Promise<object>} - API response.
 */
async function grantUserPrivileges(cpanelConfig, username, dbName) {
  console.log(`Granting privileges to user ${username} on database ${dbName}`);
  return callUapi(cpanelConfig, "Mysql", "set_privileges_on_database", {
    user: username,
    database: dbName,
    privileges: "ALL",
  });
}

/**
 * Generates a strong password that meets security requirements
 * @returns {string} - A strong password
 */
function generateStrongPassword() {
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?";

  // Ensure at least one character from each category
  let password = "";
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];

  // Add more random characters to reach minimum length and complexity
  const allChars = uppercase + lowercase + numbers + symbols;
  for (let i = 0; i < 12; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  // Shuffle the password to avoid predictable patterns
  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}

/**
 * Orchestrates the creation of a WordPress MySQL database and user.
 * It will generate a random database name and user if not provided.
 * @param {object} cpanelConfig - cPanel configuration (host, username, password/apiToken).
 * @param {string} [desiredDbName] - Optional. Desired database name (without prefix).
 * @param {string} [desiredDbUser] - Optional. Desired database username (without prefix).
 * @param {string} [desiredDbPass] - Optional. Desired database user password.
 * @param {string} [domain] - Optional. Domain name for the WordPress site.
 * @returns {Promise<object>} - Object containing the full prefixed database name, user, and password.
 */
async function createWordPressDatabase(
  cpanelConfig,
  desiredDbName,
  desiredDbUser,
  desiredDbPass,
  domain = "unknown"
) {
  // Generate random names if not provided
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const generatedDbName = desiredDbName || `wp_${randomSuffix}`;
  const generatedDbUser = desiredDbUser || `wpuser_${randomSuffix}`;
  const generatedDbPass = desiredDbPass || generateStrongPassword(); // Use stronger password

  console.log("Starting WordPress database creation...");

  try {
    // First, try Namecheap-specific endpoints (since user mentioned Namecheap)
    let connectionTest;
    try {
      connectionTest = await testNamecheapConnection(cpanelConfig);
      console.log("✅ Namecheap API connection successful");
    } catch (namecheapError) {
      console.log(
        "⚠️ Namecheap-specific endpoints failed, trying general cPanel endpoints..."
      );
      connectionTest = await testCpanelConnection(cpanelConfig);
      console.log("✅ General cPanel connection test successful");
    }

    // Extract the base URL from the working endpoint
    const baseUrl = connectionTest.endpoint.replace(
      "/json-api/uapi/cpanel_info/get_user_information",
      ""
    );
    console.log(`Using base URL: ${baseUrl}`);

    // Update the cpanelConfig with the working base URL
    const workingConfig = {
      ...cpanelConfig,
      baseUrl: baseUrl,
    };

    // Create database
    const dbResult = await createDatabase(workingConfig, generatedDbName);
    console.log("Database creation result:", dbResult);

    const cpanelUsername = cpanelConfig.username;
    const prefixedDbName = `${cpanelUsername}_${generatedDbName}`;

    // Create database user
    const userResult = await createDatabaseUser(
      workingConfig,
      generatedDbUser,
      generatedDbPass
    );
    console.log("Database user creation result:", userResult);
    const prefixedDbUser = `${cpanelUsername}_${generatedDbUser}`;

    // Grant privileges
    const grantResult = await grantUserPrivileges(
      workingConfig,
      prefixedDbUser,
      prefixedDbName
    );
    console.log("Grant privileges result:", grantResult);

    console.log("WordPress database and user created successfully!");
    return {
      dbName: prefixedDbName,
      dbUser: prefixedDbUser,
      dbPass: generatedDbPass,
      manual: false,
    };
  } catch (error) {
    console.error(
      "Failed to create WordPress database via API:",
      error.message
    );
    console.log("🔄 Falling back to manual database setup...");

    // Fall back to manual setup
    return await createWordPressDatabaseManual(cpanelConfig, domain);
  }
}

/**
 * Test function to debug cPanel API connection
 * @param {object} cpanelConfig - cPanel configuration
 * @returns {Promise<object>} - Test results
 */
async function testCpanelConnection(cpanelConfig) {
  const { host, username, password } = cpanelConfig;

  console.log(`🔍 Testing cPanel connection to ${host}...`);

  // Test different possible endpoints - both cPanel UAPI and WHM API
  const endpoints = [
    // Standard cPanel UAPI endpoints
    `https://${host}:2083/json-api/uapi/cpanel_info/get_user_information`,
    `https://${host}:2082/json-api/uapi/cpanel_info/get_user_information`,
    `https://${host}:2087/json-api/uapi/cpanel_info/get_user_information`,
    `https://${host}:2086/json-api/uapi/cpanel_info/get_user_information`,

    // WHM API endpoints (more commonly available)
    `https://${host}:2087/json-api/version`,
    `https://${host}:2086/json-api/version`,
    `https://${host}:2083/json-api/version`,
    `https://${host}:2082/json-api/version`,

    // Alternative cPanel API endpoints
    `https://${host}:2083/execute/Mysql/get_databases`,
    `https://${host}:2082/execute/Mysql/get_databases`,
    `https://${host}:2087/execute/Mysql/get_databases`,
    `https://${host}:2086/execute/Mysql/get_databases`,

    // Try without port specification (some hosts auto-detect)
    `https://${host}/json-api/uapi/cpanel_info/get_user_information`,
    `https://${host}/json-api/version`,
    `https://${host}/execute/Mysql/get_databases`,

    // Namecheap specific endpoints (they often use different ports)
    `https://${host}:2083/json-api/uapi/Mysql/get_databases`,
    `https://${host}:2082/json-api/uapi/Mysql/get_databases`,
    `https://${host}:2087/json-api/uapi/Mysql/get_databases`,
    `https://${host}:2086/json-api/uapi/Mysql/get_databases`,
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`Testing endpoint: ${endpoint}`);

      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${username}:${password}`
          ).toString("base64")}`,
          Accept: "application/json",
          "User-Agent": "WordPress-Deployer/1.0",
        },
        agent: insecureAgent,
      });

      console.log(`Response status: ${response.status}`);
      console.log(`Content-Type: ${response.headers.get("content-type")}`);

      if (response.ok) {
        const data = await response.json();
        console.log("✅ Success! Found working endpoint:", endpoint);
        console.log(
          "Response data:",
          JSON.stringify(data, null, 2).substring(0, 500)
        );
        return { success: true, endpoint, data };
      } else {
        const errorText = await response.text();
        console.log(
          `❌ Failed: ${response.status} - ${errorText.substring(0, 200)}`
        );
      }
    } catch (error) {
      console.log(`❌ Error testing ${endpoint}:`, error.message);
    }
  }

  // If no API endpoints work, let's try to detect the hosting provider
  console.log(
    "🔍 No API endpoints found. Trying to detect hosting provider..."
  );

  try {
    const response = await fetch(`https://${host}`, {
      method: "GET",
      headers: {
        "User-Agent": "WordPress-Deployer/1.0",
      },
      agent: insecureAgent,
    });

    const html = await response.text();

    // Check for common hosting providers
    if (html.includes("cpanel") || html.includes("cPanel")) {
      console.log("✅ Detected cPanel hosting");
    } else if (html.includes("plesk") || html.includes("Plesk")) {
      console.log("⚠️ Detected Plesk hosting (not supported)");
    } else if (html.includes("directadmin") || html.includes("DirectAdmin")) {
      console.log("⚠️ Detected DirectAdmin hosting (not supported)");
    } else {
      console.log("❓ Unknown hosting control panel");
    }
  } catch (error) {
    console.log("Could not detect hosting provider:", error.message);
  }

  throw new Error(
    "No working cPanel API endpoint found. Please check with your hosting provider about API access."
  );
}

/**
 * Fallback function when API access is not available
 * Provides manual database creation instructions
 * @param {object} cpanelConfig - cPanel configuration
 * @param {string} domain - Domain name for the WordPress site
 * @returns {Promise<object>} - Manual setup instructions
 */
async function createWordPressDatabaseManual(cpanelConfig, domain) {
  const { username } = cpanelConfig;

  // Generate random names
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const dbName = `wp_${randomSuffix}`;
  const dbUser = `wpuser_${randomSuffix}`;
  const dbPass = generateStrongPassword(); // Use stronger password

  const prefixedDbName = `${username}_${dbName}`;
  const prefixedDbUser = `${username}_${dbUser}`;

  console.log("⚠️ API access not available. Manual database setup required.");
  console.log("📋 Please follow these steps in your cPanel:");
  console.log("");
  console.log(
    "1. Log into your cPanel at: https://" + cpanelConfig.host + ":2083"
  );
  console.log("2. Go to 'MySQL Databases' section");
  console.log("3. Create a new database with these details:");
  console.log(`   - Database Name: ${prefixedDbName}`);
  console.log("4. Create a new database user with these details:");
  console.log(`   - Username: ${prefixedDbUser}`);
  console.log(`   - Password: ${dbPass}`);
  console.log("5. Add the user to the database with 'ALL PRIVILEGES'");
  console.log("");
  console.log("📝 Database credentials for wp-config.php:");
  console.log(`   DB_NAME: ${prefixedDbName}`);
  console.log(`   DB_USER: ${prefixedDbUser}`);
  console.log(`   DB_PASSWORD: ${dbPass}`);
  console.log(`   DB_HOST: localhost`);
  console.log("");

  return {
    dbName: prefixedDbName,
    dbUser: prefixedDbUser,
    dbPass: dbPass,
    manual: true,
    instructions: {
      cpanelUrl: `https://${cpanelConfig.host}:2083`,
      databaseName: prefixedDbName,
      databaseUser: prefixedDbUser,
      databasePassword: dbPass,
      domain: domain,
    },
  };
}

/**
 * Specialized function for Namecheap hosting API access
 * Namecheap often uses different API endpoints and authentication methods
 * @param {object} cpanelConfig - cPanel configuration
 * @returns {Promise<object>} - Test results
 */
async function testNamecheapConnection(cpanelConfig) {
  const { host, username, password } = cpanelConfig;

  console.log(`🔍 Testing Namecheap-specific API endpoints for ${host}...`);

  // Namecheap specific endpoints and authentication methods
  const namecheapEndpoints = [
    // Standard cPanel UAPI with different authentication
    `https://${host}:2083/json-api/uapi/cpanel_info/get_user_information`,
    `https://${host}:2082/json-api/uapi/cpanel_info/get_user_information`,

    // WHM API endpoints (Namecheap often has WHM access)
    `https://${host}:2087/json-api/version`,
    `https://${host}:2086/json-api/version`,

    // Alternative authentication methods
    `https://${host}:2083/json-api/uapi/Mysql/get_databases`,
    `https://${host}:2082/json-api/uapi/Mysql/get_databases`,

    // Try with different user agent
    `https://${host}:2083/execute/Mysql/get_databases`,
    `https://${host}:2082/execute/Mysql/get_databases`,
  ];

  for (const endpoint of namecheapEndpoints) {
    try {
      console.log(`Testing Namecheap endpoint: ${endpoint}`);

      // Try different authentication methods
      const authMethods = [
        // Basic auth
        {
          Authorization: `Basic ${Buffer.from(
            `${username}:${password}`
          ).toString("base64")}`,
          "User-Agent": "WordPress-Deployer/1.0",
        },
        // Alternative user agent
        {
          Authorization: `Basic ${Buffer.from(
            `${username}:${password}`
          ).toString("base64")}`,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        // With additional headers
        {
          Authorization: `Basic ${Buffer.from(
            `${username}:${password}`
          ).toString("base64")}`,
          "User-Agent": "WordPress-Deployer/1.0",
          Accept: "application/json, text/plain, */*",
          "Cache-Control": "no-cache",
        },
      ];

      for (const headers of authMethods) {
        try {
          const response = await fetch(endpoint, {
            method: "GET",
            headers: {
              ...headers,
              Accept: "application/json",
            },
            agent: insecureAgent,
          });

          console.log(`Response status: ${response.status}`);
          console.log(`Content-Type: ${response.headers.get("content-type")}`);

          if (response.ok) {
            const data = await response.json();
            console.log(
              "✅ Success! Found working Namecheap endpoint:",
              endpoint
            );
            console.log(
              "Response data:",
              JSON.stringify(data, null, 2).substring(0, 500)
            );
            return { success: true, endpoint, data, provider: "namecheap" };
          } else {
            const errorText = await response.text();
            console.log(
              `❌ Failed: ${response.status} - ${errorText.substring(0, 200)}`
            );
          }
        } catch (authError) {
          console.log(`❌ Auth method failed:`, authError.message);
        }
      }
    } catch (error) {
      console.log(`❌ Error testing ${endpoint}:`, error.message);
    }
  }

  throw new Error("No working Namecheap API endpoint found");
}

module.exports = {
  createWordPressDatabase,
  testCpanelConnection,
  createWordPressDatabaseManual,
  testNamecheapConnection,
};
