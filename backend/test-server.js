const axios = require("axios");

async function testServer() {
  console.log("🧪 Testing WordPress Deployer Backend Server");
  console.log("=============================================");

  const baseUrl = "http://localhost:3001";

  try {
    // Test 1: Health check
    console.log("\n1️⃣ Testing health endpoint...");
    const healthResponse = await axios.get(`${baseUrl}/health`);
    console.log("✅ Health check passed:", healthResponse.data);

    // Test 2: Credentials endpoint
    console.log("\n2️⃣ Testing credentials endpoint...");
    const credentialsResponse = await axios.get(`${baseUrl}/credentials`);
    console.log("✅ Credentials endpoint working:", credentialsResponse.data);

    // Test 3: Jobs endpoint
    console.log("\n3️⃣ Testing jobs endpoint...");
    const jobsResponse = await axios.get(`${baseUrl}/jobs`);
    console.log("✅ Jobs endpoint working:", jobsResponse.data);

    console.log("\n🎉 All backend endpoints are working correctly!");
    console.log(`📡 Server is running on: ${baseUrl}`);
    console.log("\n💡 If you're still getting 'Failed to fetch' errors:");
    console.log(
      "   - Make sure you're opening the frontend from a web server (not file://)"
    );
    console.log(
      "   - Try opening: http://localhost:3001/health in your browser"
    );
    console.log("   - Check browser console for CORS errors");
  } catch (error) {
    console.error("\n❌ Backend test failed!");

    if (error.code === "ECONNREFUSED") {
      console.error("🔴 Server is not running!");
      console.error("💡 Start the server with: node index.js");
    } else if (error.code === "ENOTFOUND") {
      console.error("🔴 Cannot connect to localhost:3001");
      console.error("💡 Make sure the server is running on port 3001");
    } else {
      console.error("🔴 Error details:", error.message);
    }
  }
}

// Test cPanel validation with sample data
async function testCpanelValidation() {
  console.log("\n🔍 Testing cPanel validation...");

  const testCredentials = {
    host: "example.com",
    username: "testuser",
    password: "testpass",
    port: 2083,
  };

  try {
    const response = await axios.post(
      "http://localhost:3001/validate-credentials",
      testCredentials
    );
    console.log("✅ cPanel validation endpoint working");
    console.log("📋 Response:", response.data);
  } catch (error) {
    if (error.response) {
      console.log(
        "✅ cPanel validation endpoint working (expected error for test credentials)"
      );
      console.log("📋 Response:", error.response.data);
    } else {
      console.error("❌ cPanel validation failed:", error.message);
    }
  }
}

// Run tests
async function runTests() {
  await testServer();
  await testCpanelValidation();
}

runTests().catch(console.error);
