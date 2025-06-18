const fs = require("fs");
const path = require("path");
const { uploadToFtp } = require("./services/ftpUploader");

// Test job data
const testJob = {
  id: "test-job-123",
  template: "business-template",
  domain: "example.com",
  email: "admin@example.com",
  phone: "+1234567890",
  address: "123 Main St, City, State 12345",
  logo: "test-logo.png",
  timestamp: new Date().toISOString(),
};

// Test FTP credentials (replace with your actual credentials)
const testFtpConfig = {
  host: "your-ftp-host.com",
  user: "your-ftp-username",
  pass: "your-ftp-password",
};

async function testUpload() {
  console.log("🧪 Testing FTP Upload Functionality");
  console.log("=====================================");

  // Check if required directories exist
  const requiredPaths = [
    { path: path.join(__dirname, "wordpress-core"), name: "WordPress Core" },
    { path: path.join(__dirname, "templates"), name: "Templates" },
    { path: path.join(__dirname, "uploads"), name: "Uploads" },
    { path: path.join(__dirname, "../deploy-scripts"), name: "Deploy Scripts" },
  ];

  console.log("\n📁 Checking required directories:");
  for (const item of requiredPaths) {
    const exists = fs.existsSync(item.path);
    console.log(`${exists ? "✅" : "❌"} ${item.name}: ${item.path}`);
    if (!exists) {
      console.log(`   ⚠️  Please create: ${item.path}`);
    }
  }

  // Check if test files exist
  const testFiles = [
    {
      path: path.join(__dirname, "templates", `${testJob.template}.wpress`),
      name: "Template file",
    },
    { path: path.join(__dirname, "uploads", testJob.logo), name: "Logo file" },
    {
      path: path.join(__dirname, "../deploy-scripts", "install.php"),
      name: "Install script",
    },
  ];

  console.log("\n📄 Checking required files:");
  for (const file of testFiles) {
    const exists = fs.existsSync(file.path);
    console.log(`${exists ? "✅" : "❌"} ${file.name}: ${file.path}`);
    if (!exists) {
      console.log(`   ⚠️  Please add: ${file.path}`);
    }
  }

  console.log("\n🔧 To test the actual FTP upload:");
  console.log("1. Replace the FTP credentials in this file");
  console.log("2. Ensure all required files exist");
  console.log("3. Run: node test-upload.js");
  console.log("\n📋 Current test configuration:");
  console.log(`   Host: ${testFtpConfig.host}`);
  console.log(`   User: ${testFtpConfig.user}`);
  console.log(`   Template: ${testJob.template}`);
  console.log(`   Domain: ${testJob.domain}`);

  // Uncomment the lines below to actually test the upload
  /*
  try {
    console.log("\n🚀 Starting FTP upload test...");
    await uploadToFtp(testFtpConfig, testJob);
    console.log("✅ Test upload completed successfully!");
  } catch (error) {
    console.error("❌ Test upload failed:", error.message);
  }
  */
}

// Run the test
testUpload().catch(console.error);
