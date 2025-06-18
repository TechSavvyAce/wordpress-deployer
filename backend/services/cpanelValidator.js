const axios = require("axios");

/**
 * Validates cPanel credentials by attempting to access the cPanel API
 * @param {Object} credentials - cPanel credentials
 * @param {string} credentials.host - cPanel host (usually domain or server IP)
 * @param {string} credentials.username - cPanel username
 * @param {string} credentials.password - cPanel password
 * @param {number} credentials.port - cPanel port (default: 2083 for SSL)
 * @returns {Promise<Object>} Validation result
 */
async function validateCpanelCredentials(credentials) {
  const { host, username, password, port = 2083 } = credentials;

  // Validate input
  if (!host || !username || !password) {
    throw new Error(
      "Missing required credentials (host, username, or password)"
    );
  }

  // Clean host (remove protocol if present)
  const cleanHost = host.replace(/^https?:\/\//, "");

  try {
    console.log(`🔍 Validating cPanel credentials for ${cleanHost}...`);
    console.log(`📋 Using port: ${port}`);

    // Try multiple cPanel API endpoints
    const endpoints = [
      `/execute/1/`,
      `/execute/`,
      `/json-api/1/`,
      `/json-api/`,
    ];

    let lastError = null;

    for (const endpoint of endpoints) {
      try {
        const apiUrl = `https://${cleanHost}:${port}${endpoint}`;
        console.log(`🔗 Trying endpoint: ${apiUrl}`);

        const response = await axios.get(apiUrl, {
          auth: {
            username: username,
            password: password,
          },
          timeout: 8000, // Reduced timeout for faster failure
          validateStatus: function (status) {
            return status < 500; // Accept any status less than 500
          },
          // Add headers to mimic browser request
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept: "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            Connection: "keep-alive",
          },
        });

        console.log(`📊 Response status: ${response.status}`);
        console.log(`📊 Response headers:`, response.headers);

        if (response.status === 200) {
          console.log("✅ cPanel credentials are valid");
          return {
            valid: true,
            message: "cPanel credentials are valid",
            host: cleanHost,
            username: username,
            port: port,
            endpoint: endpoint,
          };
        } else if (response.status === 401) {
          console.log("❌ Invalid cPanel credentials (401)");
          return {
            valid: false,
            message: "Invalid username or password",
            host: cleanHost,
            username: username,
            port: port,
            endpoint: endpoint,
          };
        } else if (response.status === 403) {
          console.log("❌ Access forbidden (403) - API might be disabled");
          return {
            valid: false,
            message: "cPanel API access is disabled or restricted",
            host: cleanHost,
            username: username,
            port: port,
            endpoint: endpoint,
          };
        } else {
          console.log(`⚠️ Unexpected response: ${response.status}`);
          lastError = `Unexpected response from cPanel (Status: ${response.status})`;
        }
      } catch (endpointError) {
        console.log(`❌ Endpoint ${endpoint} failed:`, endpointError.message);
        lastError = endpointError.message;

        // Fail fast for common errors that indicate invalid credentials
        if (
          endpointError.code === "ENOTFOUND" ||
          endpointError.code === "ECONNREFUSED" ||
          endpointError.code === "ETIMEDOUT"
        ) {
          console.log(
            "🚫 Fast fail for connection error, skipping remaining endpoints"
          );
          break;
        }
      }
    }

    // All attempts failed
    console.log("❌ All validation attempts failed");
    return {
      valid: false,
      message:
        "Failed to validate cPanel credentials. Please check your hosting provider's cPanel configuration.",
      host: cleanHost,
      username: username,
      port: port,
      error: lastError,
      suggestion:
        "Some hosting providers disable cPanel API access. You may need to contact your hosting provider.",
    };
  } catch (error) {
    console.error("❌ cPanel validation error:", error.message);

    if (error.code === "ECONNREFUSED") {
      return {
        valid: false,
        message: "Cannot connect to cPanel server. Check host and port.",
        host: cleanHost,
        username: username,
        port: port,
        error: error.message,
      };
    } else if (error.code === "ENOTFOUND") {
      return {
        valid: false,
        message: "Host not found. Check the domain or server address.",
        host: cleanHost,
        username: username,
        port: port,
        error: error.message,
      };
    } else if (error.code === "ETIMEDOUT") {
      return {
        valid: false,
        message:
          "Connection timeout. Server may be down or port may be incorrect.",
        host: cleanHost,
        username: username,
        port: port,
        error: error.message,
      };
    } else if (
      error.code === "CERT_HAS_EXPIRED" ||
      error.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
    ) {
      return {
        valid: false,
        message:
          "SSL certificate issue. This might be a server configuration problem.",
        host: cleanHost,
        username: username,
        port: port,
        error: error.message,
        suggestion:
          "Try using port 2082 (non-SSL) or contact your hosting provider.",
      };
    } else {
      return {
        valid: false,
        message: "Failed to validate credentials",
        host: cleanHost,
        username: username,
        port: port,
        error: error.message,
      };
    }
  }
}

/**
 * Gets FTP credentials from cPanel
 * @param {Object} credentials - cPanel credentials
 * @returns {Promise<Object>} FTP credentials
 */
async function getFtpCredentials(credentials) {
  const { host, username, password, port = 2083 } = credentials;
  const cleanHost = host.replace(/^https?:\/\//, "");

  try {
    console.log(`🔍 Getting FTP credentials from cPanel...`);

    // Get FTP accounts from cPanel
    const apiUrl = `https://${cleanHost}:${port}/execute/Ftp/list_ftp`;

    const response = await axios.get(apiUrl, {
      auth: {
        username: username,
        password: password,
      },
      timeout: 10000,
    });

    if (response.status === 200 && response.data) {
      // Use the main cPanel account for FTP
      const ftpCredentials = {
        host: cleanHost,
        user: username,
        pass: password,
        port: 21, // Standard FTP port
      };

      console.log("✅ FTP credentials retrieved successfully");
      return {
        success: true,
        credentials: ftpCredentials,
        message: "FTP credentials retrieved from cPanel",
      };
    } else {
      throw new Error("Failed to retrieve FTP credentials from cPanel");
    }
  } catch (error) {
    console.error("❌ Error getting FTP credentials:", error.message);
    return {
      success: false,
      message: "Failed to retrieve FTP credentials",
      error: error.message,
    };
  }
}

/**
 * Tests FTP connection using provided credentials
 * @param {Object} ftpCredentials - FTP credentials
 * @returns {Promise<Object>} Test result
 */
async function testFtpConnection(ftpCredentials) {
  const ftp = require("basic-ftp");
  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    console.log(`🔍 Testing FTP connection to ${ftpCredentials.host}...`);

    await client.access({
      host: ftpCredentials.host,
      user: ftpCredentials.user,
      password: ftpCredentials.pass,
      port: ftpCredentials.port || 21,
      secure: false,
    });

    console.log("✅ FTP connection successful");
    return {
      valid: true,
      message: "FTP connection successful",
      host: ftpCredentials.host,
      user: ftpCredentials.user,
      port: ftpCredentials.port || 21,
    };
  } catch (error) {
    console.error("❌ FTP connection failed:", error.message);
    return {
      valid: false,
      message: "FTP connection failed",
      host: ftpCredentials.host,
      user: ftpCredentials.user,
      port: ftpCredentials.port || 21,
      error: error.message,
    };
  } finally {
    client.close();
  }
}

module.exports = {
  validateCpanelCredentials,
  getFtpCredentials,
  testFtpConnection,
};
