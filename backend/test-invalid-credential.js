const { validateCpanelCredentials } = require("./services/cpanelValidator");

async function testInvalidCredential() {
  console.log("🔍 Testing invalid credential validation...");

  const testCredential = {
    host: "invalid-domain-that-does-not-exist.com",
    username: "fakeuser",
    password: "fakepassword",
    port: 2083,
  };

  console.log("⏱️ Starting validation at:", new Date().toISOString());

  try {
    const result = await validateCpanelCredentials(testCredential);
    console.log("⏱️ Finished validation at:", new Date().toISOString());
    console.log("📋 Validation Result:", JSON.stringify(result, null, 2));

    if (result.valid) {
      console.log("✅ Credentials are valid!");
    } else {
      console.log("❌ Credentials are invalid:", result.message);
      if (result.error) {
        console.log("🔍 Error details:", result.error);
      }
    }
  } catch (error) {
    console.error("💥 Test failed:", error.message);
  }
}

testInvalidCredential();
