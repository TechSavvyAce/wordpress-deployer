const { validateCpanelCredentials } = require("./services/cpanelValidator");

async function testCredential() {
  console.log("🔍 Testing credential validation...");

  const testCredential = {
    host: "accsnewtool.com",
    username: "accsnxuc", // Replace with actual username
    password: "2bO79XWH4oHT", // Replace with actual password
    port: 2083,
  };

  try {
    const result = await validateCpanelCredentials(testCredential);
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

testCredential();
